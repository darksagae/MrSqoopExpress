/**
 * Sqoop Assist's conversation logic: turns what the customer says into calls
 * to the assistant's MCP tools (/api/mcp) and remembers the context ("the
 * second one", "yes"). Shared by the shop's assistant panel and /assist.
 *
 * Every reply is { text, tool?, products?, product?, order?, placed?, orders?,
 * signIn?, chips? } for the UI to render.
 */

let rpcId = 0;
export async function callTool(name, args = {}) {
  const r = await fetch('/api/mcp', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      'mcp-protocol-version': '2025-11-25',
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: ++rpcId, method: 'tools/call', params: { name, arguments: args } }),
  });
  const j = await r.json();
  if (j.error) throw new Error(j.error.message);
  const res = j.result || {};
  return {
    text: (res.content || []).filter((c) => c.type === 'text').map((c) => c.text).join(' '),
    data: res.structuredContent || {},
  };
}

const ORDER_RE = /\b(MSE[-\s]?[A-Z0-9-]+)\b/i;
const PHONE_RE = /(\+?256|0)\s?7\d{2}\s?\d{3}\s?\d{3}/;
const ORDINALS = [[/\b(second|2nd|two)\b/, 1], [/\b(third|3rd|three|last)\b/, 2], [/\b(first|1st)\b/, 0]];
const QTY_WORDS = { two: 2, three: 3, four: 4, five: 5 };
const YES = /\b(yes|yeah|yep|sure|ok|okay|confirm|go ahead|place it|place the order|do it)\b/;
const NO = /\b(no|nope|cancel|stop|never mind)\b/;

function parseAmount(s) {
  const m = s.match(/(?:under|below|less than|cheaper than|max|maximum)\s+(?:ugx\s*)?(\d[\d,.]*)\s*(k|thousand|m|million)?/i);
  if (!m) return undefined;
  let n = parseFloat(m[1].replace(/,/g, ''));
  const u = (m[2] || '').toLowerCase();
  if (u === 'k' || u === 'thousand') n *= 1e3;
  if (u === 'm' || u === 'million') n *= 1e6;
  return n;
}

function searchTerm(s) {
  return s
    .toLowerCase()
    .replace(/\b(alexa|sqoop|please|can you|could you|find me|find|show me|show|search for|search|look for|i want|i need|get me|some|a|an|any)\b/g, ' ')
    .replace(/\b(under|below|less than|cheaper than)\b.*$/, ' ')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** @param {() => boolean} signedIn whether a customer is signed in right now */
export function createBrain(signedIn = () => false) {
  const mem = { lastProducts: [], lastProduct: null, trackId: null, pending: null, awaitingPhone: null, lastOrderId: null };

  function remember(data) {
    if (data?.products?.length) {
      mem.lastProducts = data.products.map((p) => ({ id: p.id }));
      mem.lastProduct = null;
    }
    if (data?.product) mem.lastProduct = { id: data.product.id };
  }

  // When product cards show the details, the screen only needs the first
  // sentence ("Here are 3 options for earbuds."); the full text is still spoken.
  const reply = (tool, r, extra = {}) => ({
    tool,
    text: r.text,
    display: r.data.products?.length ? r.text.split(/(?<=[.!?])\s+/)[0] : undefined,
    products: r.data.products,
    product: r.data.product,
    orders: r.data.orders,
    signIn: r.data.signIn,
    ...extra,
  });

  // Ordering is two steps: prepare_order reads the order back, and place_order
  // only runs after the customer says yes to it.
  async function prepare(args) {
    const r = await callTool('prepare_order', args);
    mem.pending = r.data.confirmation || null;
    mem.awaitingPhone = r.data.needPhone ? args.items : null;
    return reply('prepare_order', r, {
      order: r.data.order,
      // The order sheet has its own Place order / Cancel buttons.
      chips: r.data.confirmation || r.data.signIn ? [] : undefined,
    });
  }

  async function confirm() {
    const confirmation = mem.pending;
    mem.pending = null;
    if (!confirmation) return { text: 'There is no order waiting. Tell me what you would like to buy.' };
    const r = await callTool('place_order', { confirmation });
    if (r.data.orderId) mem.lastOrderId = r.data.orderId;
    return reply('place_order', r, {
      placed: r.data.orderId ? r.data : undefined,
      chips: r.data.orderId ? ['Did my payment go through?'] : undefined,
    });
  }

  function cancel() {
    mem.pending = null;
    return { text: "Okay, I won't place that order." };
  }

  async function paymentStatus(orderId) {
    const r = await callTool('payment_status', { order_id: orderId });
    return reply('payment_status', r, { chips: r.data.paymentStatus === 'PENDING' ? ['Did my payment go through?'] : ['My orders'] });
  }

  async function myOrders() {
    const r = await callTool('my_orders');
    return reply('my_orders', r);
  }

  /** "Buy now" on a product card. */
  function buy(productId, quantity = 1) {
    mem.lastProduct = { id: productId };
    return prepare({ items: [{ product_id: String(productId), quantity }] });
  }

  async function think(u) {
    const lower = u.toLowerCase();
    const orderId = u.match(ORDER_RE)?.[1]?.replace(/\s/g, '-').toUpperCase();
    const phone = u.match(PHONE_RE)?.[0]?.replace(/\s/g, '');

    if (mem.pending && (YES.test(lower) || NO.test(lower))) return NO.test(lower) ? cancel() : confirm();
    if (mem.awaitingPhone && phone) return prepare({ items: mem.awaitingPhone, phone });

    if (/\b(my orders|order history|recent orders|what (have|did) i order(ed)?)\b/.test(lower)) return myOrders();
    if (/\b(paid|payment|go through|went through)\b/.test(lower) && (orderId || mem.lastOrderId)) {
      return paymentStatus(orderId || mem.lastOrderId);
    }

    if (/\b(buy|purchase|order (it|this|that|them|one|two|three|four|five|the|\d)|add (it|this|that|the)|i('ll| will) take)\b/.test(lower)) {
      const qm = lower.match(/\b(\d+|two|three|four|five)\s+(of (them|it|those|these)|pieces|units|pcs)\b/);
      const quantity = qm ? Number(qm[1]) || QTY_WORDS[qm[1]] : 1;
      const rest = qm ? lower.replace(qm[0], ' ') : lower;
      const idx = ORDINALS.find(([re]) => re.test(rest))?.[1];
      const list = mem.lastProducts;
      const pick = idx != null && list.length ? list[Math.min(idx, list.length - 1)] : mem.lastProduct || list[0];
      if (!pick) return { text: 'Tell me what you want first, for example "find wireless earbuds", then say "order the first one".' };
      const args = { items: [{ product_id: pick.id, quantity }] };
      if (phone) args.phone = phone;
      return prepare(args);
    }

    if (/\b(track|where is my|package|order status|my order)\b/.test(lower) || orderId || (mem.trackId && phone)) {
      const id = orderId || mem.trackId;
      if (!id) {
        if (signedIn()) return myOrders();
        return { text: "Sure. What's your order number? It starts with M S E.", chips: [] };
      }
      if (!phone) {
        if (signedIn()) return paymentStatus(id);
        mem.trackId = id;
        return { text: `Got it, order ${id}. For your security, what phone number did you use at checkout?` };
      }
      mem.trackId = null;
      const r = await callTool('track_order', { order_id: id, phone });
      return reply('track_order', r);
    }

    if (/\b(deal|deals|offer|offers|trending|popular|discount|promo)\b/.test(lower)) {
      const r = await callTool('get_deals');
      remember(r.data);
      return reply('get_deals', r, { chips: ['Order the first one'] });
    }

    if (/\b(how much|price|cost|shipping|breakdown|deliver)\b/.test(lower) && mem.lastProducts.length) {
      const idx = ORDINALS.find(([re]) => re.test(lower))?.[1] ?? 0;
      const pick = mem.lastProducts[Math.min(idx, mem.lastProducts.length - 1)];
      const r = await callTool('get_price_quote', { product_id: pick.id });
      remember(r.data);
      return reply('get_price_quote', r, { chips: ['Buy it now'] });
    }

    const query = searchTerm(u);
    if (!query) return { text: "You can ask me to find a product, check a price, order for you or track your order." };
    const args = { query };
    const max = parseAmount(u);
    if (max) args.max_price_ugx = max;
    const r = await callTool('search_products', args);
    remember(r.data);
    return reply('search_products', r, { chips: r.data.products?.length ? ['Order the first one', 'Price of the second one'] : undefined });
  }

  return { think, buy, confirm, cancel, paymentStatus, myOrders, mem };
}
