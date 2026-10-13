import { aliexpressDS } from './aliexpress.js';
import { getSql } from './db.js';
import { ensureAccountColumns } from './orders.js';
import { WAREHOUSE } from './shipping-destination.js';
import { shipUGX } from './pricing.js';

/**
 * Place a paid order with the supplier, shipped to our Dubai warehouse.
 *
 * Money is spent on the back of this, so it must never run twice for one
 * order: the row is claimed first ("placing"), and only an order that is paid
 * and has not been placed (or whose last attempt failed) can be claimed.
 *
 * The supplier creates the order unpaid. Paying it is done in the supplier
 * account, by the operator.
 */
let columnsReady = null;
function ensureSupplierColumns() {
  if (!columnsReady) {
    columnsReady = (async () => {
      await ensureAccountColumns();
      const sql = getSql();
      await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS supplier_status TEXT`;
      await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS supplier_order_ids TEXT`;
      await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS supplier_error TEXT`;
      await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS supplier_at TIMESTAMPTZ`;
      await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS supplier_ship_usd NUMERIC`;
    })().catch((e) => { columnsReady = null; throw e; });
  }
  return columnsReady;
}

const view = (row) => ({
  status: row.supplier_status || null,
  orderIds: row.supplier_order_ids ? row.supplier_order_ids.split(',') : [],
  error: row.supplier_error || null,
  at: row.supplier_at || null,
  // What the supplier charged to ship to the Dubai warehouse when the order was
  // placed (the customer paid the same route's quote at checkout).
  dubaiShipUSD: row.supplier_ship_usd == null ? null : Number(row.supplier_ship_usd),
});

// Pauses between freight lookups that the supplier answers as temporarily
// unavailable: four tries over about ten seconds.
const FREIGHT_WAITS_MS = [1500, 3000, 5000];

// The admin previews an order and then places it, which asks the supplier the
// same freight question twice within a minute. Reusing the first answer
// avoids the second lookup, which is the one most likely to be refused.
const QUOTE_TTL_MS = 10 * 60 * 1000;
const quotes = new Map();
function recentQuote(key) {
  const q = quotes.get(key);
  return q && Date.now() - q.at < QUOTE_TTL_MS ? q.freight : null;
}
function rememberQuote(key, freight) {
  if (quotes.size > 200) quotes.clear();
  quotes.set(key, { at: Date.now(), freight });
}

/** Work out exactly what to order for one line: product, option and delivery service. */
async function buildItem(line) {
  const productId = String(line.id || '').split(':')[0];
  const qty = Math.max(1, Number(line.qty) || 1);
  const product = await aliexpressDS.getProduct({ productId });
  const variant = product.variants.find((v) => v.skuId === String(line.skuId)) || null;
  if (!variant) throw new Error(`"${line.name || productId}": the option bought is no longer available from the supplier.`);

  // Always quoted to the warehouse (Dubai), with its province and city.
  const ask = () => aliexpressDS.queryFreight({ productId, skuId: variant.skuId, quantity: qty });
  const name = line.name || productId;
  const key = `${productId}:${variant.skuId}:${qty}`;
  let freight = recentQuote(key);
  for (let attempt = 0; !freight; attempt++) {
    try {
      freight = await ask();
      rememberQuote(key, freight);
    } catch (e) {
      if (e.code !== 'FREIGHT_TEMPORARY') throw e;
      // Even with the city given, the supplier answers a UAE lookup with a
      // passing DELIVERY_SERVICE_EXCEPTION now and then, more often when the
      // same product was just asked about (the preview, then the order). So
      // wait longer between tries than a normal hiccup needs.
      if (attempt < FREIGHT_WAITS_MS.length) {
        await new Promise((r) => setTimeout(r, FREIGHT_WAITS_MS[attempt]));
        continue;
      }
      // Still busy: use the route the supplier quoted for this very line at
      // checkout, which is what the customer paid for.
      if (line.shipService) {
        freight = {
          deliverable: true,
          serviceCode: line.shipService,
          company: line.shipService,
          freeShipping: Number(line.shipUSD) === 0,
          shippingCostUSD: Number(line.shipUSD) || 0,
          fromCheckout: true,
        };
        break;
      }
      console.warn('[supplier] freight lookup still busy for', name, e.message);
      throw new Error(`"${name}": AliExpress didn't answer about shipping to the Dubai warehouse. Please try again in a minute.`);
    }
  }
  if (!freight.deliverable || !freight.serviceCode) {
    throw new Error(`"${name}": the supplier will not ship this to the Dubai warehouse.`);
  }
  const item = {
    product_id: Number(productId),
    product_count: qty,
    logistics_service_name: freight.serviceCode,
  };
  if (variant.skuAttr) item.sku_attr = variant.skuAttr;
  const shipUSD = freight.freeShipping ? 0 : Number(freight.shippingCostUSD) || 0;
  const service = freight.company || freight.serviceCode;
  return { item, shipUSD, service: freight.fromCheckout ? `${service}, as quoted at checkout` : service };
}

/**
 * Money for one order, side by side: what the customer paid us for shipping
 * plus handling, against what the supplier charges to ship to Dubai now.
 * Checkout quotes the same Dubai shipping, so what is left is the handling fee
 * (give or take a change in the supplier's price since): the budget for the
 * Dubai -> Uganda leg.
 */
function moneyFor(order, dubaiShipUSD) {
  const items = Array.isArray(order.items) ? order.items : [];
  const paidShipUGX = items.reduce((t, i) => t + (Number(i.qty) || 1) * (Number(i.shipUGX) || 0), 0);
  const paidHandlingUGX = items.reduce((t, i) => t + (Number(i.qty) || 1) * (Number(i.handlingUGX) || 0), 0);
  const dubaiShipUGX = shipUGX(dubaiShipUSD);
  return {
    dubaiShipUSD: Math.round(dubaiShipUSD * 100) / 100,
    dubaiShipUGX,
    paidShipUGX,
    paidHandlingUGX,
    leftForUgandaLegUGX: paidShipUGX + paidHandlingUGX - dubaiShipUGX,
  };
}

/** Quote the supplier order to Dubai without placing it, so the operator sees the cost first. */
export async function previewSupplierOrder(orderId) {
  const [order] = await getSql()`SELECT * FROM orders WHERE id = ${orderId}`;
  if (!order) return { ok: false, code: 'NOT_FOUND', error: 'Order not found in the shop.' };
  const items = Array.isArray(order.items) ? order.items : [];
  const lines = [];
  for (const line of items) {
    const built = await buildItem(line);
    lines.push({ name: line.name, qty: Number(line.qty) || 1, shipUSD: built.shipUSD, service: built.service });
  }
  const total = lines.reduce((t, l) => t + l.shipUSD, 0);
  return { ok: true, lines, ...moneyFor(order, total) };
}

export async function placeSupplierOrder(orderId) {
  await ensureSupplierColumns();
  const sql = getSql();

  const claimed = await sql`
    UPDATE orders
       SET supplier_status = 'placing', supplier_error = NULL, supplier_at = now()
     WHERE id = ${orderId}
       AND payment_status = 'SUCCESSFUL'
       AND (supplier_status IS NULL OR supplier_status = 'failed')
    RETURNING *
  `;
  if (!claimed.length) {
    const [row] = await sql`SELECT * FROM orders WHERE id = ${orderId}`;
    if (!row) return { ok: false, code: 'NOT_FOUND', error: 'Order not found in the shop.' };
    if (row.payment_status !== 'SUCCESSFUL') return { ok: false, code: 'NOT_PAID', error: 'This order has not been paid.' };
    // Already placed, or being placed right now: never order twice.
    return { ok: row.supplier_status === 'placed', code: row.supplier_status === 'placed' ? 'ALREADY_PLACED' : 'IN_PROGRESS', supplier: view(row) };
  }

  const order = claimed[0];
  try {
    const items = Array.isArray(order.items) ? order.items : [];
    if (!items.length) throw new Error('The order has no items.');
    const productItems = [];
    let dubaiShipUSD = 0;
    for (const line of items) {
      const built = await buildItem(line);
      productItems.push(built.item);
      dubaiShipUSD += built.shipUSD;
    }

    const request = {
      out_order_id: order.id,
      logistics_address: {
        full_name: WAREHOUSE.contactName,
        contact_person: WAREHOUSE.contactName,
        phone_country: WAREHOUSE.phoneCountry,
        mobile_no: WAREHOUSE.phone,
        address: WAREHOUSE.addressLine,
        city: WAREHOUSE.city,
        province: WAREHOUSE.province,
        country: WAREHOUSE.countryCode,
        zip: WAREHOUSE.zip,
      },
      product_items: productItems,
    };
    const resp = await aliexpressDS.call('aliexpress.ds.order.create', {
      param_place_order_request4_open_api_d_t_o: JSON.stringify(request),
      ds_extend_request: JSON.stringify({ payment: { pay_currency: 'USD' } }),
    });
    const result = resp?.aliexpress_ds_order_create_response?.result || resp?.result || {};
    const ids = [].concat(result.order_list?.number || []).map(String).filter(Boolean);
    if (!result.is_success || !ids.length) {
      throw new Error(result.error_msg || result.error_code || 'The supplier did not create the order.');
    }

    const [row] = await sql`
      UPDATE orders SET supplier_status = 'placed', supplier_order_ids = ${ids.join(',')},
                        supplier_error = NULL, supplier_at = now(),
                        supplier_ship_usd = ${Math.round(dubaiShipUSD * 100) / 100}
       WHERE id = ${order.id} RETURNING *
    `;
    return { ok: true, code: 'PLACED', supplier: view(row), money: moneyFor(row, dubaiShipUSD) };
  } catch (e) {
    console.error('[supplier] placing order failed', order.id, e.message);
    const [row] = await sql`
      UPDATE orders SET supplier_status = 'failed', supplier_error = ${String(e.message).slice(0, 300)}, supplier_at = now()
       WHERE id = ${order.id} RETURNING *
    `;
    return { ok: false, code: 'FAILED', error: row.supplier_error, supplier: view(row) };
  }
}
