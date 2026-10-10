import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { myOrders, paymentStatus, placeOrder, prepareOrder } from './account';
import { getProduct, getTrending, searchProducts, trackOrder } from './store';
import { deliveryPhrase, shillings, shortTitle, totalOf } from './voice';

// Voice answers stay short: nobody wants twenty products read aloud.
const SPOKEN_RESULTS = 3;

const text = (t) => [{ type: 'text', text: t }];

/**
 * Sqoop Assist: the MCP server Alexa+ connects to.
 * `base` is the shop's own origin, e.g. https://www.mrsqoopexpress.com.
 * `account` is the signed-in customer the assistant acts for, or null; the
 * account tools (orders, ordering, payments) only ever touch that account.
 */
export function createAssistServer(base, { account = null } = {}) {
  const card = (p) => ({
    id: p.id,
    // The variant the shipping was quoted for, so "Add to cart" prices like the product page.
    skuId: p.skuId ?? p.shipping?.quotedForSkuId ?? null,
    title: shortTitle(p.title, 10),
    image: p.image || p.images?.[0],
    priceUGX: p.priceUGX,
    handlingUGX: p.handlingUGX,
    shippingUGX: p.shipping?.known ? p.shipping.costUGX : null,
    freeShipping: Boolean(p.shipping?.free),
    totalUGX: totalOf(p),
    originalUGX: p.originalUGX ?? null,
    discountPct: p.discountPct ?? null,
    rating: p.rating ?? null,
    sold: p.sold ?? null,
    delivery: deliveryPhrase(p.shipping),
    url: `${base}/product/${p.id}`,
  });

  const server = new McpServer({ name: 'sqoop-assist', version: '1.0.0' });

  server.registerTool(
    'search_products',
    {
      title: 'Search products',
      description:
        'Search the Mr Sqoop Express catalogue for products that can be delivered to Uganda. ' +
        'Optionally limit to a maximum total price in Uganda shillings (item + handling + shipping).',
      inputSchema: {
        query: z.string().min(1).describe('What the customer is looking for, e.g. "wireless earbuds"'),
        max_price_ugx: z.number().positive().optional().describe('Maximum total price in UGX'),
      },
    },
    async ({ query, max_price_ugx }) => {
      let products = await searchProducts(base, query, 20);
      if (max_price_ugx) products = products.filter((p) => totalOf(p) <= max_price_ugx);
      const top = products.slice(0, SPOKEN_RESULTS);
      if (!top.length) {
        const limit = max_price_ugx ? ` under ${shillings(max_price_ugx)}` : '';
        return { content: text(`I couldn't find any ${query}${limit} that we can deliver to Uganda right now.`) };
      }
      const lines = top.map((p, i) => `${i + 1}. ${shortTitle(p.title)} for ${shillings(totalOf(p))} delivered`);
      return {
        content: text(`Here are ${top.length} options for ${query}. ${lines.join('. ')}. Want the full price breakdown for any of these?`),
        structuredContent: { products: top.map(card) },
      };
    }
  );

  server.registerTool(
    'get_price_quote',
    {
      title: 'Get price quote',
      description:
        'Full price for one product delivered to Uganda: item price, handling fee and shipping, in Uganda shillings, plus the delivery window.',
      inputSchema: { product_id: z.string().min(1).describe('Mr Sqoop Express product id') },
    },
    async ({ product_id }) => {
      const p = await getProduct(base, product_id);
      if (!p) return { content: text("I couldn't find that product anymore.") };
      const s = p.shipping;
      const shipping = !s?.known ? 'shipping to be confirmed' : s.free ? 'free shipping' : `${shillings(s.costUGX)} shipping`;
      return {
        content: text(
          `The ${shortTitle(p.title)} costs ${shillings(p.priceUGX)}, plus a ${shillings(p.handlingUGX)} handling fee and ${shipping}. ` +
            `That's ${shillings(totalOf(p))} in total, delivered to Uganda, and ${deliveryPhrase(s)}. You can pay with MTN or Airtel Mobile Money.`
        ),
        structuredContent: { product: card(p) },
      };
    }
  );

  server.registerTool(
    'track_order',
    {
      title: 'Track order',
      description:
        'Status of a Mr Sqoop Express order. Needs both the order number and the phone number used at checkout, so customers can only see their own orders.',
      inputSchema: {
        order_id: z.string().min(3).describe('Order number, e.g. MSE-1234'),
        phone: z.string().min(9).describe('Phone number used at checkout'),
      },
    },
    async ({ order_id, phone }) => {
      const o = await trackOrder(base, order_id.toUpperCase(), phone);
      if (!o) return { content: text(`I couldn't find order ${order_id} with that phone number. Please check both and try again.`) };
      if (o.cancelled) return { content: text(`Order ${o.id} was cancelled.`) };
      const done = o.steps.filter((s) => s.done).length;
      return {
        content: text(
          `Your order ${o.id} is ${String(o.statusLabel).toLowerCase()}. That's step ${Math.max(done, 1)} of ${o.steps.length}. ` +
            `You paid ${shillings(o.amountUGX)}.`
        ),
        structuredContent: { order: { id: o.id, statusLabel: o.statusLabel, step: done, steps: o.steps.length } },
      };
    }
  );

  server.registerTool(
    'get_deals',
    {
      title: "Today's deals",
      description: 'Best-selling products on Mr Sqoop Express right now, with their delivered price in Uganda shillings.',
      inputSchema: {},
    },
    async () => {
      const products = (await getTrending(base, 8)).slice(0, SPOKEN_RESULTS);
      if (!products.length) return { content: text('There are no deals to share right now.') };
      const lines = products.map((p) => {
        const off = p.discountPct ? `, ${p.discountPct} percent off` : '';
        return `${shortTitle(p.title)} for ${shillings(totalOf(p))} delivered${off}`;
      });
      return {
        content: text(`Here's what's popular today. ${lines.join('. ')}.`),
        structuredContent: { products: products.map(card) },
      };
    }
  );

  // What the account tools return, as an MCP result.
  const reply = ({ speech, data }) => ({ content: text(speech), ...(data ? { structuredContent: data } : {}) });

  server.registerTool(
    'my_orders',
    {
      title: 'My orders',
      description: "The signed-in customer's latest orders and where each one is. Needs the customer to be signed in.",
      inputSchema: {},
    },
    async () => reply(await myOrders(account))
  );

  server.registerTool(
    'prepare_order',
    {
      title: 'Prepare an order',
      description:
        'Price an order for the signed-in customer and read it back for them to confirm. Nothing is charged. ' +
        'Returns a confirmation to pass to place_order once the customer clearly says yes. ' +
        'Uses the Mobile Money number from their last order unless they give one.',
      inputSchema: {
        items: z
          .array(z.object({ product_id: z.string().min(1), quantity: z.number().int().min(1).max(50).optional() }))
          .min(1)
          .max(10)
          .describe('Products to order, with quantity (default 1)'),
        phone: z.string().min(9).optional().describe('MTN or Airtel Uganda number to send the payment request to'),
        promo_code: z.string().optional().describe('Promo code, if the customer gave one'),
      },
    },
    async (args) => reply(await prepareOrder(account, args))
  );

  server.registerTool(
    'place_order',
    {
      title: 'Place the order',
      description:
        'Place the order prepare_order read back and send the Mobile Money payment request to the customer\'s phone. ' +
        'Only call this after the customer has clearly said yes to that exact order. ' +
        'The customer approves the charge with their own PIN on their phone.',
      inputSchema: { confirmation: z.string().min(10).describe('The confirmation prepare_order returned') },
    },
    async (args) => reply(await placeOrder(account, args))
  );

  server.registerTool(
    'payment_status',
    {
      title: 'Payment status',
      description: "Whether the payment for one of the signed-in customer's orders went through.",
      inputSchema: { order_id: z.string().min(3).describe('Order number, e.g. MSE-012') },
    },
    async (args) => reply(await paymentStatus(account, args))
  );

  return server;
}
