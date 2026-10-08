import { aliexpressDS } from './aliexpress.js';
import { getSql } from './db.js';
import { ensureAccountColumns } from './orders.js';
import { WAREHOUSE } from './shipping-destination.js';

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
    })().catch((e) => { columnsReady = null; throw e; });
  }
  return columnsReady;
}

const view = (row) => ({
  status: row.supplier_status || null,
  orderIds: row.supplier_order_ids ? row.supplier_order_ids.split(',') : [],
  error: row.supplier_error || null,
  at: row.supplier_at || null,
});

/** Work out exactly what to order for one line: product, option and delivery service. */
async function buildItem(line) {
  const productId = String(line.id || '').split(':')[0];
  const qty = Math.max(1, Number(line.qty) || 1);
  const product = await aliexpressDS.getProduct({ productId });
  const variant = product.variants.find((v) => v.skuId === String(line.skuId)) || null;
  if (!variant) throw new Error(`"${line.name || productId}": the option bought is no longer available from the supplier.`);

  const freight = await aliexpressDS.queryFreight({
    productId,
    skuId: variant.skuId,
    quantity: qty,
    country: WAREHOUSE.countryCode,
  });
  if (!freight.deliverable || !freight.serviceCode) {
    throw new Error(`"${line.name || productId}": the supplier will not ship this to the Dubai warehouse.`);
  }
  const item = {
    product_id: Number(productId),
    product_count: qty,
    logistics_service_name: freight.serviceCode,
  };
  if (variant.skuAttr) item.sku_attr = variant.skuAttr;
  return item;
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
    for (const line of items) productItems.push(await buildItem(line));

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
                        supplier_error = NULL, supplier_at = now()
       WHERE id = ${order.id} RETURNING *
    `;
    return { ok: true, code: 'PLACED', supplier: view(row) };
  } catch (e) {
    console.error('[supplier] placing order failed', order.id, e.message);
    const [row] = await sql`
      UPDATE orders SET supplier_status = 'failed', supplier_error = ${String(e.message).slice(0, 300)}, supplier_at = now()
       WHERE id = ${order.id} RETURNING *
    `;
    return { ok: false, code: 'FAILED', error: row.supplier_error, supplier: view(row) };
  }
}
