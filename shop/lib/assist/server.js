import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getProduct, getTrending, searchProducts, trackOrder } from './store';
import { deliveryPhrase, shillings, shortTitle, totalOf } from './voice';

// Voice answers stay short: nobody wants twenty products read aloud.
const SPOKEN_RESULTS = 3;

const text = (t) => [{ type: 'text', text: t }];

/**
 * Sqoop Assist: the MCP server Alexa+ connects to.
 * `base` is the shop's own origin, e.g. https://www.mrsqoopexpress.com.
 */
export function createAssistServer(base) {
  const card = (p) => ({
    id: p.id,
    title: shortTitle(p.title, 10),
    image: p.image || p.images?.[0],
    priceUGX: p.priceUGX,
    handlingUGX: p.handlingUGX,
    shippingUGX: p.shipping?.costUGX ?? null,
    totalUGX: totalOf(p),
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

  return server;
}
