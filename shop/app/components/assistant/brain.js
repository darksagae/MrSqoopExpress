/**
 * Sqoop Assist's conversation logic. No AI service: it understands what the
 * customer says with rules (intents, prices, sorting, quantities, "the second
 * one", colours, typos) and keeps the conversation's context (the last search,
 * the product being discussed, a pending order), then calls the assistant's
 * tools on /api/mcp for live shop data. Shared by the shop's assistant panel
 * and /assist.
 *
 * Every reply is { text, products?, detail?, compare?, cart?, order?, placed?,
 * orders?, links?, signIn?, hasMore?, chips? } for the UI to render.
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

/* ---------- Words ---------- */

const NUMBER_WORDS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
const ORDINALS = { first: 0, '1st': 0, second: 1, '2nd': 1, third: 2, '3rd': 2, fourth: 3, '4th': 3, fifth: 4, '5th': 4, sixth: 5, '6th': 5, seventh: 6, '7th': 6, eighth: 7, '8th': 7, last: -1 };
const COLORS = ['black', 'white', 'red', 'blue', 'green', 'pink', 'purple', 'yellow', 'orange', 'grey', 'gray', 'silver', 'gold', 'brown', 'beige', 'navy', 'transparent', 'multicolor'];

// The shop's categories, and the search that fills each (as on the home page).
const CATEGORIES = [
  [/\b(electronics?|gadgets?)\b/, 'electronic gadgets', 'electronics'],
  [/\b(laptops?|notebooks?|computers?)\b/, 'laptop', 'laptops'],
  [/\b(phones?|smartphones?|tablets?|mobiles?)\b/, 'smartphone', 'phones'],
  [/\b(fashion|clothes|clothing|outfits?)\b/, 'fashion clothes', 'fashion'],
  [/\b(home|furniture|appliances?)\b/, 'furniture chair', 'home and furniture'],
  [/\b(beauty|makeup|cosmetics|personal care|skincare)\b/, 'beauty products', 'beauty'],
  [/\b(fitness|gym|workout|exercise)\b/, 'fitness equipment', 'fitness'],
  [/\b(baby|babies|kids|children|toys?)\b/, 'baby toys', 'baby and kids'],
  [/\b(pets?|dogs?|cats?)\b/, 'pet supplies', 'pet supplies'],
  [/\b(automotive|car accessories|cars?)\b/, 'car accessories', 'car accessories'],
  [/\b(tools?)\b/, 'hand tools', 'tools'],
  [/\b(bags?|backpacks?|luggage)\b/, 'travel bags', 'bags'],
  [/\b(office|stationery)\b/, 'office supplies', 'office supplies'],
];

// Words that carry no product meaning in a search.
const STOP = new Set(
  ('i im me my mine we our us you your u a an the some any for to of in on at with and or but please pls plz kindly ' +
    'can could would will shall should may might show showing find finding search searching look looking get give need ' +
    'needs want wanted wanna like love see view display have has got do does did sell selling sold is are was be am ' +
    'there here this that these those what which who where when how something anything things thing stuff item items ' +
    'product products one ones option options also too very really just maybe kind sort type good nice great best ' +
    'mum mom mother dad father wife husband son daughter friend brother sister girlfriend boyfriend myself someone ' +
    'ugx shs shillings shilling price prices cost costs budget money cheap cheaper cheapest affordable expensive ' +
    'under below over above between around about less more than max maximum min minimum up within least most ' +
    'hello hi hey sqoop alexa assistant now today buy order purchase one two three four five six seven eight nine ten')
    .split(' ')
);

// Command words worth correcting when misspelt ("cheapr", "comapre").
const VOCAB = ['cheaper', 'cheapest', 'compare', 'details', 'payment', 'delivery', 'shipping', 'refund', 'return', 'returns', 'checkout', 'deals', 'popular', 'options', 'recommend', 'expensive', 'cancel', 'confirm', 'discount', 'promo', 'tracking', 'orders', 'warranty', 'genuine', 'quality', 'cheapest', 'specifications', 'available'];

function editDistance(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  return d[a.length][b.length];
}

// Real words one letter away from a command word.
const NO_FIX = new Set(['compact', 'cancer', 'details', 'detail', 'orderly', 'promos', 'popularity', 'shopping', 'shipped', 'returned']);

function fixTypo(word) {
  if (word.length < 5 || VOCAB.includes(word) || NO_FIX.has(word) || /\d/.test(word)) return word;
  const limit = word.length >= 8 ? 2 : 1;
  let best = word;
  let bestD = limit + 1;
  for (const v of VOCAB) {
    // "order" is a word in its own right, not a typo of "orders".
    if ((v.startsWith(word) || word.startsWith(v)) && Math.abs(v.length - word.length) <= 2) return word;
    const dist = editDistance(word, v);
    if (dist < bestD) {
      best = v;
      bestD = dist;
    }
  }
  return bestD <= limit ? best : word;
}

/** Lower-case, money as plain numbers ("50k" -> 50000), typos fixed. */
export function normalize(raw) {
  let t = ` ${String(raw).toLowerCase()} `
    .replace(/[’`]/g, "'")
    .replace(/\/=/g, ' ')
    .replace(/(\d),(\d{3})/g, '$1$2')
    .replace(/(\d),(\d{3})/g, '$1$2')
    .replace(/\b(\d+(?:\.\d+)?)\s*(k|thousand)\b/g, (_, n) => String(Math.round(parseFloat(n) * 1e3)))
    .replace(/\b(\d+(?:\.\d+)?)\s*(m|mil|million)\b/g, (_, n) => String(Math.round(parseFloat(n) * 1e6)))
    .replace(/\b(ugx|shs|ush)\s*(?=\d)/g, '')
    .replace(/[^a-z0-9#+\s.'-]/g, ' ')
    .replace(/\s+/g, ' ');
  t = t.split(' ').map((w) => (/^[a-z]+$/.test(w) ? fixTypo(w) : w)).join(' ');
  return t.trim();
}

const n = (s) => (/^\d+$/.test(s) ? Number(s) : NUMBER_WORDS[s] || null);
const QTY = '(\\d+|two|three|four|five|six|seven|eight|nine|ten)';

/** Prices, sorting, quantity, which product, colours, phone and order number. */
export function entities(t, raw = t) {
  const e = { ordinals: [], colors: [] };
  let m;
  if ((m = t.match(/\bbetween (\d{4,}) (?:and|to|-) (\d{4,})\b/)) || (m = t.match(/\b(\d{4,}) ?(?:-|to) ?(\d{4,})\b/))) {
    e.min = Math.min(+m[1], +m[2]);
    e.max = Math.max(+m[1], +m[2]);
  } else {
    if ((m = t.match(/\b(?:under|below|less than|cheaper than|max(?:imum)?|not more than|no more than|up to|within|at most|budget(?: of| is)?)\s+(\d{4,})\b/))) e.max = +m[1];
    if ((m = t.match(/\b(?:over|above|more than|at least|min(?:imum)?|starting (?:at|from))\s+(\d{4,})\b/))) e.min = +m[1];
    if ((m = t.match(/\b(?:around|about|roughly|approximately|close to)\s+(\d{4,})\b/))) {
      e.min = Math.round(+m[1] * 0.75);
      e.max = Math.round(+m[1] * 1.25);
    }
    // "a phone for 300k": a budget.
    if (!e.max && !e.min && (m = t.match(/\b(?:for|at|costing|of)\s+(\d{5,})\b/))) e.max = +m[1];
  }

  if (/\b(cheapest|lowest price|low to high|least expensive)\b/.test(t)) e.sort = 'price_low';
  else if (/\b(most expensive|priciest|high to low|highest price)\b/.test(t)) e.sort = 'price_high';
  else if (/\b(best rated|top rated|highest rated|best reviews?|good reviews?|best quality|top quality|highly rated)\b/.test(t)) e.sort = 'rating';
  else if (/\b(best sell(?:ing|ers?)|most popular|popular|trending|most sold|hot)\b/.test(t)) e.sort = 'popular';

  if ((m = t.match(new RegExp(`\\b${QTY}\\s*(?:pieces|piece|pcs|units|items|of them|of those|of these|of it|pairs|sets)\\b`)))) e.qty = n(m[1]);
  else if ((m = t.match(new RegExp(`\\b(?:make it|change (?:it )?to|quantity(?: of| to)?|qty|x)\\s*${QTY}\\b`)))) e.qty = n(m[1]);
  // "add 2 of the first one", "buy three of them", "two of the second"
  else if ((m = t.match(new RegExp(`\\b(?:add|buy|order|get|want|take)\\s+${QTY}\\s+(?:of|more)\\b`)))) e.qty = n(m[1]);
  else if ((m = t.match(new RegExp(`\\b${QTY}\\s+of\\s+(?:the\\s+)?(?:first|second|third|fourth|fifth|last|[1-8](?:st|nd|rd|th)?)\\b`)))) e.qty = n(m[1]);

  for (const [w, i] of Object.entries(ORDINALS)) if (new RegExp(`\\b${w}\\b`).test(t)) e.ordinals.push(i);
  const re = /\b(?:number|no\.?|#|option|item|product)\s*([1-8])\b/g;
  while ((m = re.exec(t))) e.ordinals.push(+m[1] - 1);
  if (/\bboth\b/.test(t)) e.both = true;

  for (const c of COLORS) if (new RegExp(`\\b${c}\\b`).test(t)) e.colors.push(c);

  e.phone = raw.match(/(\+?256|0)\s?7\d{2}\s?\d{3}\s?\d{3}/)?.[0]?.replace(/\s/g, '');
  e.orderId = raw.match(/\b(MSE[-\s]?[A-Z0-9-]{2,})\b/i)?.[1]?.replace(/\s/g, '-').toUpperCase();
  return e;
}

/** What to search for, with intent words, prices and filler stripped out. */
export function productTerms(t) {
  return t
    .replace(/\bbetween \d+ (?:and|to|-) \d+\b/g, ' ')
    .replace(/\b(under|below|less than|over|above|more than|around|about|up to|within|at least|at most|budget(?: of| is)?)\s+\d+\b/g, ' ')
    .replace(/\b(best rated|top rated|highest rated|best selling|most popular|lowest price|most expensive|low to high|high to low)\b/g, ' ')
    .replace(new RegExp(`\\b${QTY}\\s*(pieces|piece|pcs|units|items|pairs|sets)\\b`, 'g'), ' ')
    .replace(/\b(first|second|third|fourth|fifth|last|1st|2nd|3rd)\b/g, ' ')
    .replace(/\b\d{5,}\b/g, ' ')
    .split(/\s+/)
    .filter((w) => w && !STOP.has(w))
    // A number stays only after a product word ("iphone 15"), not alone ("order 2").
    .filter((w, i, all) => (/^\d+$/.test(w) ? i > 0 && /^[a-z]/.test(all[i - 1]) : w.length > 1))
    .join(' ')
    .trim();
}

/* ---------- Answers ---------- */

const pickOne = (list) => list[Math.floor(Math.random() * list.length)];
const ugx = (v) => 'UGX ' + new Intl.NumberFormat('en-UG').format(Math.round(v));
const short = (title, words = 6) => String(title || '').split(/[,|(]/)[0].split(/\s+/).slice(0, words).join(' ');
const ordinalWord = (i) => ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth'][i] || `number ${i + 1}`;
const soldNumber = (s) => (typeof s === 'number' ? s : parseInt(String(s || '').replace(/\D/g, ''), 10) || 0);

const YES = /\b(yes|yeah|yep|yah|ya|sure|ok|okay|confirm|confirmed|go ahead|place it|place the order|place my order|do it|proceed|correct|right)\b/;
const NO = /\b(no|nope|cancel|stop|never mind|nevermind|don't|do not|wait)\b/;

const CAPABILITIES =
  'I can find products and show their price delivered to Uganda, filter by budget, sort by price or rating, ' +
  'compare options, add things to your cart, place orders paid by Mobile Money, and track your orders.';

const START_CHIPS = ["Today's deals", 'Earbuds under 50k', 'Track my order', 'How long is delivery?'];

function faq(t, promo) {
  const q = (re) => re.test(t);
  if (q(/\b(how long|when will|delivery time|how many days|how many weeks|take to (arrive|deliver|reach)|arrive|shipping time|delivery period)\b/) && !q(/\b(my order|my parcel|mse)\b/)) {
    return {
      text:
        'Delivery to Uganda takes 7 to 15 working days from when your payment is confirmed. Every product page shows its ' +
        'expected delivery dates, and I can check one for you: just ask "when will the first one arrive?".',
      chips: ['Track my order', "Today's deals"],
    };
  }
  if (q(/\b(shipping (cost|fee|price|charges?)|delivery (cost|fee|charges?)|how much is (shipping|delivery)|free shipping|do you charge for (shipping|delivery))\b/)) {
    return {
      text:
        'The price I show is the full price delivered to Uganda: the item, a handling fee and shipping. Many items ship free. ' +
        'Ask me for the price breakdown of any product.',
    };
  }
  if (q(/\b(how (can|do) i pay|payment (method|option)s?|pay(ing)? (with|by|using|via)|can i pay|mobile money|cash on delivery|pay on delivery|do you accept|card payment|visa|mastercard)\b/) && !q(/\b(did|went|go through|status)\b/)) {
    return {
      text:
        'You can pay with MTN Mobile Money, Airtel Money or a Visa or Mastercard bank card. With Mobile Money, a payment request comes to your phone and you approve it with your PIN. ' +
        'With a card, you pay on a secure bank payment page at checkout. ' +
        "We don't take cash on delivery. I can place a Mobile Money order for you right here; for a card payment, use checkout.",
      chips: ["Today's deals"],
    };
  }
  if (q(/\b(refund|returns?|return policy|send (it )?back|exchange|damaged|broken|faulty|wrong item|not working|defective)\b/)) {
    return {
      text:
        'If an item arrives damaged, faulty or wrong, contact us within 7 days of delivery with your order number and photos, and we will replace it or refund you at no cost. ' +
        "We can't take back items just because you changed your mind, unless the listing says so. Refunds go to the Mobile Money number you paid with, usually within 3 to 10 business days.",
      links: [{ label: 'Return policy', href: '/returns' }, { label: 'Email support', href: 'mailto:support@mrsqoopexpress.com' }],
    };
  }
  if (q(/\b(cancel (my|an|the) order|cancel order|cancellation)\b/)) {
    return {
      text: 'You can cancel for a full refund any time before your order ships. Email support@mrsqoopexpress.com with your order number.',
      links: [{ label: 'Email support', href: 'mailto:support@mrsqoopexpress.com' }],
    };
  }
  if (q(/\b(promo|coupon|discount code|voucher|offer code|promotion|promo code)\b/) || (q(/\bdiscount\b/) && !productTerms(t).replace(/\bdiscount\b/, '').trim())) {
    if (promo?.code) {
      const min = promo.minOrder ? ` on orders over ${ugx(promo.minOrder)}` : '';
      return { text: `Use code ${promo.code} at checkout: ${promo.text || 'a discount'}${min}.`, chips: ["Today's deals"] };
    }
    return { text: "There's no promo code running right now, but check today's deals for discounted items.", chips: ["Today's deals"] };
  }
  if (q(/\b(contact|support|customer care|call you|your phone|your number|email you|talk to (a )?(human|person|someone)|complain|complaint)\b/)) {
    return {
      text: 'You can reach our team at support@mrsqoopexpress.com. Include your order number if it is about an order.',
      links: [{ label: 'Email support', href: 'mailto:support@mrsqoopexpress.com' }],
    };
  }
  if (q(/\b(how does (this|it) work|how do (you|i) (order|buy)|how to (order|buy)|where do you (get|ship from)|where are (the )?products from|how does mr sqoop)\b/)) {
    return {
      text:
        'You shop here, we buy from trusted international suppliers and ship it to Uganda. The price you see includes delivery, you pay with Mobile Money, ' +
        'and you can track your order any time. Tell me what you need and I will find it, or order it for you.',
    };
  }
  if (q(/\b(are|is) (they|these|your|the|it|this|those)\b.*\b(genuine|original|real|fake|legit|safe|good quality)\b|\b(can i trust|legit|scam|is this (site|shop) (safe|real))\b/)) {
    return {
      text:
        'Every product shows its rating and how many have sold, so you can see what other buyers think, and I can compare options for you. ' +
        "If what arrives is faulty or not what you ordered, we'll replace it or refund you within 7 days of delivery.",
    };
  }
  if (q(/\b(warranty|guarantee)\b/)) {
    return { text: 'Faulty, damaged or wrong items can be replaced or refunded if you tell us within 7 days of delivery.', links: [{ label: 'Return policy', href: '/returns' }] };
  }
  if (q(/\b(where do you deliver|deliver to|do you deliver|which (towns?|areas?|districts?))\b/) && !productTerms(t.replace(/\bdeliver\w*\b/g, ''))) {
    return { text: "We deliver to Uganda. We'll contact you on the phone number on your order to arrange delivery." };
  }
  if (q(/\b(sign in|log ?in|create (an )?account|sign up|register)\b/)) {
    return { text: 'Tap "Sign in" at the top of the page. You can use Google or your email. Once signed in, I can order and track for you.', links: [{ label: 'Sign in', href: '/login?next=/' }] };
  }
  return null;
}

function smallTalk(t, name) {
  const hi = name ? ` ${name}` : '';
  const words = t.split(' ').length;
  if (/^(oli otya|osiibye otya|gyebale ko|wasuze otya)/.test(t)) {
    return { text: `Gyendi${hi}, webale kubuuza! What can I find for you today?`, chips: START_CHIPS };
  }
  if (/^(hi|hello|hey|hiya|good (morning|afternoon|evening)|howdy|yo|sup|wassup|what's up|greetings)\b/.test(t) && words <= 5) {
    const how = /\bhow are (you|u)\b/.test(t) ? " I'm doing great, thanks for asking." : '';
    return { text: pickOne([`Hi${hi}!${how} What are you shopping for today?`, `Hello${hi}!${how} What can I help you find?`]), chips: START_CHIPS };
  }
  if (/^how are (you|u)\b/.test(t)) return { text: `I'm doing great${hi}, thanks! What can I find for you?`, chips: START_CHIPS };
  if (/\b(thank you|thanks|thank u|thx|webale|asante|appreciated?)\b/.test(t) && words <= 6 && !/\b(show|find|search|need|want|buy|order|add)\b/.test(t)) {
    return { text: pickOne(["You're welcome! Anything else I can find for you?", 'Happy to help! Need anything else?']) };
  }
  if (/^(bye|goodbye|see you|later|good night|ciao)\b/.test(t)) return { text: `Bye${hi}! Come back any time.` };
  if (/\b(who are you|what are you|your name|are you (a )?(robot|bot|human|real|ai))\b/.test(t)) {
    return { text: `I'm Sqoop, Mr Sqoop Express's shopping assistant. ${CAPABILITIES}`, chips: START_CHIPS };
  }
  if (/^(help|what can you do|how can you help|menu|options|commands)\b/.test(t) || /\bwhat can you do\b/.test(t)) {
    return { text: CAPABILITIES, chips: [...START_CHIPS, 'My orders'] };
  }
  if (/^(ok|okay|cool|nice|great|awesome|alright|fine|good|wow|hmm+)$/.test(t)) return { text: 'Great! What else can I find for you?' };
  if (/\b(stupid|useless|rubbish|nonsense|not helpful|angry|annoyed|bad service)\b/.test(t)) {
    return {
      text: "I'm sorry about that. Tell me what you're looking for in a few words, like \"black wireless earbuds under 80k\", or email support@mrsqoopexpress.com and our team will help.",
    };
  }
  return null;
}

/* ---------- The brain ---------- */

/**
 * @param {{ signedIn?: () => boolean, name?: () => string|null,
 *           cart?: { items: () => object[], add: (product, qty) => void, remove: (id) => void, clear: () => void } }} opts
 */
export function createBrain({ signedIn = () => false, name = () => null, cart = null } = {}) {
  const mem = {
    search: null, // { query, label, max, min, sort, page, hasMore }
    products: [], // the cards last shown, in order
    focus: null, // the product being talked about
    pending: null, // signed order confirmation awaiting yes/no
    pendingItems: null, // what that order contains, to change quantity or phone
    awaitingPhone: null,
    trackId: null,
    lastOrderId: null,
  };
  let promoInfo;

  async function promo() {
    if (promoInfo !== undefined) return promoInfo;
    try {
      const r = await fetch('/api/settings/public');
      promoInfo = (await r.json())?.promo || null;
    } catch {
      promoInfo = null;
    }
    return promoInfo;
  }

  /** A shown product named in the message: "the kadixi one", "the pendant light". */
  function byName(t) {
    const words = t.split(' ').filter((w) => w.length > 2 && !STOP.has(w) && !/^(add|cart|basket|remove|details?|specs?)$/.test(w));
    let best = null;
    let bestScore = 0;
    for (const p of mem.products) {
      const title = String(p.title || '').toLowerCase();
      const score = words.filter((w) => title.includes(w)).length;
      if (score > bestScore) {
        best = p;
        bestScore = score;
      }
    }
    return best;
  }

  /** Which product "the second one", "it", "the black one" means. */
  function pickProduct(t, e) {
    const list = mem.products;
    if (e.ordinals.length && list.length) {
      const i = e.ordinals[0];
      return list[i < 0 ? list.length - 1 : Math.min(i, list.length - 1)];
    }
    return byName(t) || mem.focus || list[0] || null;
  }

  const refersToShown = (t, e) => e.ordinals.length > 0 || /\b(it|this|that|these|those|them|this one|that one)\b/.test(t) || Boolean(byName(t));

  /* --- searching --- */

  async function search(s, intro) {
    const args = { query: s.query };
    if (s.max) args.max_price_ugx = s.max;
    if (s.min) args.min_price_ugx = s.min;
    if (s.sort && s.sort !== 'relevance') args.sort = s.sort;
    if (s.page > 1) args.page = s.page;
    const r = await callTool('search_products', args);
    const products = r.data.products || [];
    const label = s.label || s.query;
    if (!products.length) {
      const range = s.max && s.min ? ` between ${ugx(s.min)} and ${ugx(s.max)}` : s.max ? ` under ${ugx(s.max)}` : s.min ? ` over ${ugx(s.min)}` : '';
      if (s.page > 1) return { text: `That's everything I found for ${label}${range}. Want me to try a different search?` };
      return {
        text: `I couldn't find ${label}${range} that we can deliver to Uganda right now. Try different words, or a bigger budget.`,
        chips: s.max ? [`${label} under ${Math.round((s.max * 1.5) / 1000)}k`, "Today's deals"] : ["Today's deals"],
      };
    }
    mem.search = { ...s, hasMore: r.data.hasMore };
    mem.products = products;
    mem.focus = null;
    const range = s.max && s.min ? ` between ${ugx(s.min)} and ${ugx(s.max)}` : s.max ? ` under ${ugx(s.max)}` : s.min ? ` over ${ugx(s.min)}` : '';
    const order = { price_low: ', cheapest first', price_high: ', most expensive first', rating: ', best rated first', popular: ', best sellers first' }[s.sort] || '';
    const cheapest = products.reduce((a, b) => (b.totalUGX < a.totalUGX ? b : a));
    const text =
      intro ||
      pickOne([
        `Here ${products.length === 1 ? 'is 1 option' : `are ${products.length} options`} for ${label}${range}${order}.`,
        `I found ${products.length === 1 ? '1 option' : `${products.length} options`} for ${label}${range}${order}.`,
      ]) + ` Prices start at ${ugx(cheapest.totalUGX)} delivered.`;
    return {
      text,
      products,
      hasMore: r.data.hasMore,
      chips: ['Order the first one', 'Compare the first two', 'Show cheaper ones', 'Best rated'],
    };
  }

  /* --- product details and comparison --- */

  async function details(p) {
    const r = await callTool('get_price_quote', { product_id: p.id });
    const d = r.data.product;
    if (!d) return { text: "I couldn't load that product right now. Please try again." };
    mem.focus = { ...p, ...d };
    const ship = d.freeShipping ? 'free shipping' : d.shippingUGX != null ? `${ugx(d.shippingUGX)} shipping` : 'shipping';
    const stars = parseFloat(d.rating) > 0 ? ` Rated ${d.rating} stars${d.reviews > 0 ? ` from ${new Intl.NumberFormat('en-UG').format(d.reviews)} reviews` : ''}.` : '';
    const opts = d.options?.length ? ` Comes in ${d.options.slice(0, 5).join(', ')}${d.options.length > 5 ? ' and more' : ''}.` : '';
    const when = d.minDays && d.maxDays ? ` Delivery to Uganda takes ${d.minDays} to ${d.maxDays} working days.` : '';
    return {
      text: `${short(d.title, 6)}: ${ugx(d.totalUGX)} delivered to Uganda (item ${ugx(d.priceUGX)}, handling ${ugx(d.handlingUGX)}, ${ship}).${stars}${opts}${when}`,
      detail: mem.focus,
      chips: ['Buy it now', 'Add it to my cart', 'Show similar'],
    };
  }

  function compare(list) {
    const items = list.filter(Boolean).slice(0, 3);
    if (items.length < 2) return { text: 'Show me a few products first, then I can compare them.' };
    const idx = (p) => mem.products.indexOf(p);
    const nameOf = (p) => (idx(p) >= 0 ? `the ${ordinalWord(idx(p))}` : short(p.title, 3));
    const cheapest = items.reduce((a, b) => (b.totalUGX < a.totalUGX ? b : a));
    const rated = items.reduce((a, b) => ((b.rating || 0) > (a.rating || 0) ? b : a));
    const popular = items.reduce((a, b) => (soldNumber(b.sold) > soldNumber(a.sold) ? b : a));
    // Best value: the best rated among those within 25% of the cheapest price.
    const value = items
      .filter((p) => p.totalUGX <= cheapest.totalUGX * 1.25)
      .reduce((a, b) => ((b.rating || 0) > (a.rating || 0) ? b : a));
    let text = `${nameOf(cheapest)[0].toUpperCase() + nameOf(cheapest).slice(1)} is the cheapest at ${ugx(cheapest.totalUGX)}.`;
    if (rated !== cheapest && rated.rating) text += ` ${nameOf(rated)[0].toUpperCase() + nameOf(rated).slice(1)} is best rated (${rated.rating} stars).`;
    if (popular !== rated && popular !== cheapest && soldNumber(popular.sold)) text += ` ${nameOf(popular)[0].toUpperCase() + nameOf(popular).slice(1)} sells the most.`;
    text += ` For value for money, I'd pick ${nameOf(value)}.`;
    mem.focus = value;
    return { text, compare: items, best: value.id, chips: [`Order ${nameOf(value)}`, 'Add it to my cart'] };
  }

  /* --- ordering --- */

  async function prepare(items, phone) {
    const args = { items: items.map((i) => ({ product_id: String(i.product_id), quantity: i.quantity || 1, ...(i.sku_id ? { sku_id: String(i.sku_id) } : {}) })) };
    if (phone) args.phone = phone;
    const r = await callTool('prepare_order', args);
    mem.pending = r.data.confirmation || null;
    mem.pendingItems = r.data.confirmation ? args.items : null;
    mem.awaitingPhone = r.data.needPhone ? args.items : null;
    return { text: r.text, order: r.data.order, signIn: r.data.signIn, chips: [] };
  }

  async function confirm() {
    const confirmation = mem.pending;
    mem.pending = null;
    mem.pendingItems = null;
    if (!confirmation) return { text: 'There is no order waiting. Tell me what you would like to buy.' };
    const r = await callTool('place_order', { confirmation });
    if (r.data.orderId) mem.lastOrderId = r.data.orderId;
    return { text: r.text, placed: r.data.orderId ? r.data : undefined, chips: r.data.orderId ? ['Did my payment go through?'] : undefined };
  }

  function cancel() {
    mem.pending = null;
    mem.pendingItems = null;
    return { text: "Okay, I won't place that order. Anything else?", chips: ['Keep shopping', 'My cart'] };
  }

  async function paymentStatus(orderId) {
    const r = await callTool('payment_status', { order_id: orderId });
    return { text: r.text, signIn: r.data.signIn, chips: r.data.paymentStatus === 'PENDING' ? ['Did my payment go through?'] : ['My orders'] };
  }

  async function myOrders() {
    const r = await callTool('my_orders');
    return { text: r.text, orders: r.data.orders, signIn: r.data.signIn };
  }

  /** "Buy now" on a card or detail view. */
  function buy(p, quantity = 1) {
    mem.focus = p;
    return prepare([{ product_id: p.id, quantity, sku_id: p.skuId }]);
  }

  /* --- cart --- */

  function cartSummary(lead) {
    const items = cart?.items() || [];
    if (!items.length) return { text: `${lead ? lead + ' ' : ''}Your cart is empty. Tell me what you're looking for.`, chips: START_CHIPS };
    const count = items.reduce((s, i) => s + i.qty, 0);
    const total = items.reduce((s, i) => s + i.qty * ((i.price || 0) + (i.shipUGX || 0) + (i.handlingUGX || 0)), 0);
    return {
      text: `${lead ? lead + ' ' : ''}Your cart has ${count} ${count === 1 ? 'item' : 'items'}, ${ugx(total)} delivered.`,
      cart: items,
      cartTotal: total,
      chips: ['Order everything in my cart', 'Keep shopping'],
    };
  }

  function addToCart(p, qty = 1) {
    if (!cart || !p) return { text: 'Show me a product first, then I can add it to your cart.' };
    cart.add(p, qty);
    return cartSummary(`Added ${qty > 1 ? qty + ' × ' : ''}${short(p.title)} to your cart.`);
  }

  /* --- understanding a message --- */

  async function think(raw) {
    // "Hi, I need a laptop": greet, then answer the rest.
    const greeting = normalize(raw).match(/^(hi|hello|hey|hiya|good (morning|afternoon|evening)|oli otya|gyebale ko)\b[\s,.!]*/);
    if (greeting && productTerms(normalize(raw).slice(greeting[0].length))) {
      const r = await think(normalize(raw).slice(greeting[0].length));
      return { ...r, text: `${pickOne(['Hi', 'Hello'])}${name() ? ' ' + name() : ''}! ${r.text}` };
    }
    const t = normalize(raw);
    const e = entities(t, raw);
    const first = name();
    const terms = productTerms(t);

    // 1. An order is waiting for yes/no, or for a change.
    if (mem.pending) {
      if (NO.test(t) && !YES.test(t.replace(/\bno\b.*$/, ''))) return cancel();
      if (e.qty && mem.pendingItems) return prepare(mem.pendingItems.map((i, k) => (k === 0 ? { ...i, quantity: e.qty } : i)), e.phone);
      if (e.phone && mem.pendingItems) return prepare(mem.pendingItems, e.phone);
      if (YES.test(t)) return confirm();
    }
    if (mem.awaitingPhone && e.phone) return prepare(mem.awaitingPhone, e.phone);
    if (/^(yes|yeah|yep|yah|sure|ok|okay|no|nope|not really|nah)\b/.test(t) && t.split(' ').length <= 3) {
      return { text: /^(no|nope|not really|nah)/.test(t) ? 'No problem. Anything else I can help with?' : 'Great! What would you like to do next?', chips: START_CHIPS };
    }

    // 2. Small talk and common questions, answered right here.
    const chat = smallTalk(t, first);
    if (chat) return chat;
    const answer = e.phone ? null : faq(t, await promo());
    if (answer && !(/\b(find|show|search|need|want)\b/.test(t) && terms.split(' ').length > 1)) return answer;

    // 3. Cart.
    if (/\b(clear|empty)\b.*\b(cart|basket)\b/.test(t)) {
      cart?.clear();
      return { text: 'Done, your cart is empty.', chips: START_CHIPS };
    }
    if (/\b(remove|delete|take out|drop)\b/.test(t) && cart) {
      const items = cart.items();
      const i = e.ordinals[0];
      const words = terms.split(' ').filter(Boolean);
      const hit = i != null ? items[i < 0 ? items.length - 1 : i] : items.find((c) => words.some((w) => String(c.name).toLowerCase().includes(w)));
      if (!hit) return cartSummary("I couldn't tell which item to remove.");
      cart.remove(hit.id);
      return cartSummary(`Removed ${short(hit.name)}.`);
    }
    if (/\b(order|buy|pay for|checkout)\b.*\b(everything|all|my cart|the cart|cart items|them all)\b/.test(t)) {
      const items = cart?.items() || [];
      if (!items.length) return cartSummary();
      return prepare(items.map((c) => ({ product_id: String(c.id).split(':')[0], quantity: c.qty, sku_id: c.skuId })), e.phone);
    }
    if (/\b(check ?out|go to checkout|proceed to pay(ment)?)\b/.test(t)) {
      const s = cartSummary();
      return s.cart ? { ...s, text: `${s.text} You can check out on the website, or I can order it all for you right here.`, links: [{ label: 'Go to checkout', href: '/checkout' }] } : s;
    }
    if (/\b(add|put)\b/.test(t) && (/\b(cart|basket|bag)\b/.test(t) || /\badd (it|this|that|them|the|one)\b/.test(t))) {
      return addToCart(pickProduct(t, e), e.qty || 1);
    }
    if (/\b(my cart|the cart|my basket|in (my|the) cart|view cart|show cart|open cart|cart total|what's in|whats in)\b/.test(t)) return cartSummary();

    // 4. Orders and payments.
    if (/\b(my orders|order history|recent orders|past orders|what (have|did) i order(ed)?)\b/.test(t)) return myOrders();
    if (/\b(paid|payment|go through|went through|money (went|go))\b/.test(t) && !/\b(how|method|options?|can i)\b/.test(t)) {
      if (e.orderId || mem.lastOrderId) return paymentStatus(e.orderId || mem.lastOrderId);
      if (signedIn()) return myOrders();
    }
    if (/\b(track|tracking|where is my|where's my|wheres my|status of my|order status|my parcel|my package|my delivery|my order)\b/.test(t) || e.orderId || (mem.trackId && e.phone)) {
      const id = e.orderId || mem.trackId;
      if (!id) {
        if (signedIn()) return myOrders();
        return { text: "Sure. What's your order number? It starts with M S E. Or sign in and I'll find your orders.", signIn: true };
      }
      if (signedIn() && !e.phone) return paymentStatus(id);
      if (!e.phone) {
        mem.trackId = id;
        return { text: `Got it, order ${id}. For your security, what phone number did you use at checkout?` };
      }
      mem.trackId = null;
      const r = await callTool('track_order', { order_id: id, phone: e.phone });
      return { text: r.text };
    }

    // 5. Buying ("which one should I buy?" is a comparison, handled next).
    const asksAdvice = /\b(which (one )?(should|would|do|is|to)|recommend|suggest|what do you think|better one)\b/.test(t);
    if (!asksAdvice && /\b(buy|purchase|order (it|this|that|them|one|two|three|four|five|the|\d)|i('ll| will) take|get (it|this|that|one) for me)\b/.test(t)) {
      if (terms && !refersToShown(t, e)) {
        // "Buy earbuds": find them first.
        const found = await search({ query: terms, max: e.max, min: e.min, sort: e.sort, page: 1 });
        return found.products ? { ...found, text: `${found.text} Which one would you like? Say "order the first one", or tap Buy now.` } : found;
      }
      const p = pickProduct(t, e);
      if (!p) return { text: 'Tell me what you want first, for example "find wireless earbuds", then say "order the first one".' };
      return prepare([{ product_id: p.id, quantity: e.qty || 1, sku_id: p.skuId }], e.phone);
    }

    // 6. Comparing.
    if (/\b(compare|comparison|difference|differ|vs|versus|which (one )?(is|should i)|which is (better|best|cheaper)|recommend|suggest|what do you think|better one)\b/.test(t)) {
      if (!mem.products.length) {
        if (terms) {
          const found = await search({ query: terms, max: e.max, min: e.min, sort: 'rating', page: 1 });
          if (!found.products) return found;
          const pick = compare(mem.products.slice(0, 3));
          return { ...found, text: `${found.text} ${pick.text}` };
        }
        return { text: 'Show me a few products first, then I can compare them.' };
      }
      const top = t.match(/\b(?:first|top) (two|three|2|3)\b/);
      const count = top ? n(top[1]) : e.both ? 2 : 3;
      const chosen = e.ordinals.length >= 2 && !top ? e.ordinals.map((i) => mem.products[i < 0 ? mem.products.length - 1 : i]) : mem.products.slice(0, count);
      return compare(chosen);
    }

    // 7. Details about one product.
    if (mem.products.length && (e.ordinals.length || byName(t)) && !productTerms(t.replace(/\b(one|please|pls)\b/g, '')).split(' ').some((w) => w && !byName(w))) {
      // Just "the second one" / "the kadixi one": open it. With a number, offer both actions.
      const p = pickProduct(t, e);
      const res = await details(p);
      if (e.qty && res.detail) {
        const which = mem.products.indexOf(p) >= 0 ? `the ${ordinalWord(mem.products.indexOf(p))}` : 'it';
        return { ...res, text: `Would you like to order ${e.qty} now, or add them to your cart? ${res.text}`, chips: [`Order ${e.qty} of ${which}`, `Add ${e.qty} of ${which} to my cart`] };
      }
      return res;
    }
    if (mem.products.length || mem.focus) {
      const aboutOne =
        /\b(details?|tell me (more )?about|more about|describe|specs?|specifications|features|info|information|colou?rs?|sizes?|variants?|how much (is|for)|price of|cost of|breakdown|reviews?|ratings?|when will|arrive|delivery (date|time)|available in|come in)\b/.test(t);
      if (aboutOne && (e.ordinals.length || /\b(it|this|that|one|them)\b/.test(t) || !terms || e.colors.length)) {
        const p = pickProduct(t, e);
        if (p) {
          if (e.colors.length) {
            const res = await details(p);
            const opts = (res.detail?.options || []).map((o) => o.toLowerCase());
            const has = e.colors.filter((c) => opts.some((o) => o.includes(c)));
            const lead = has.length ? `Yes, it comes in ${has.join(' and ')}.` : opts.length ? `It doesn't list ${e.colors.join(' or ')}; it comes in ${res.detail.options.slice(0, 5).join(', ')}.` : '';
            return lead ? { ...res, text: `${lead} ${res.text}` } : res;
          }
          return details(p);
        }
      }
    }

    // 8. Follow-ups on the last search.
    if (mem.search) {
      const s = mem.search;
      const onlyRefines = !terms || (e.colors.length && terms.split(' ').every((w) => COLORS.includes(w)));
      if (/\b(more|other|another|next|else|different|others)\b/.test(t) && onlyRefines) {
        if (!s.hasMore) return { text: `That's everything I found for ${s.label || s.query}. Try a different search, or ask me for today's deals.` };
        return search({ ...s, page: (s.page || 1) + 1 }, `Here are more ${s.label || s.query}.`);
      }
      if (/\b(cheaper|less expensive|lower price|more affordable|too expensive|too much|can't afford)\b/.test(t) && onlyRefines) {
        const floor = Math.min(...mem.products.map((p) => p.totalUGX));
        const res = await search({ ...s, max: floor - 1, min: undefined, sort: 'price_low', page: 1 });
        return res.products ? res : { text: `The ones I showed are the cheapest ${s.label || s.query} I can find, from ${ugx(floor)}.` };
      }
      if (/\b(more expensive|higher quality|premium|better quality|high end|pricier|top of the range)\b/.test(t) && onlyRefines) {
        return search({ ...s, sort: 'price_high', min: undefined, max: undefined, page: 1 });
      }
      if (e.sort && onlyRefines) return search({ ...s, sort: e.sort, page: 1 });
      if ((e.max || e.min) && onlyRefines) return search({ ...s, max: e.max, min: e.min, page: 1 });
      if (e.colors.length && onlyRefines) {
        const base = s.query.split(' ').filter((w) => !COLORS.includes(w)).join(' ');
        return search({ ...s, query: `${e.colors.join(' ')} ${base}`, label: `${e.colors.join(' ')} ${s.label || base}`, page: 1 });
      }
    }
    if (/\b(similar|like (this|that|it)|same kind)\b/.test(t) && (mem.focus || mem.products[0])) {
      const p = refersToShown(t, e) ? pickProduct(t, e) : mem.focus || mem.products[0];
      const q = productTerms(normalize(short(p.title, 4))) || short(p.title, 3).toLowerCase();
      return search({ query: q, page: 1 }, `Here are products similar to ${short(p.title, 4)}.`);
    }
    if (/\b(keep shopping|continue shopping|browse|something else)\b/.test(t)) {
      return { text: 'Sure! What else are you looking for?', chips: START_CHIPS };
    }
    if (/\b(more|show more|next|more options|others)\b/.test(t) && !terms) {
      return { text: "Tell me what you're looking for first, for example \"wireless earbuds under 50k\".", chips: START_CHIPS };
    }

    // 9. Deals.
    if (/\b(deals?|offers?|on sale|sales|discounts?|trending|hot items|bargains?)\b/.test(t) && !terms.replace(/\b(deals?|offers?|sale|sales|discounts?|trending|hot|bargains?)\b/g, '').trim()) {
      const r = await callTool('get_deals');
      mem.products = r.data.products || [];
      mem.search = null;
      mem.focus = null;
      return {
        text: mem.products.length ? `Here's what's popular today${first ? `, ${first}` : ''}.` : 'There are no deals to share right now.',
        products: mem.products,
        chips: ['Order the first one', 'Compare the first two'],
      };
    }

    // 10. A category, or a product search.
    let query = terms;
    let label = terms;
    for (const [re, keyword, nice] of CATEGORIES) {
      if (terms.split(' ').every((w) => re.test(w))) {
        query = keyword;
        label = nice;
        break;
      }
    }
    if (!query) {
      if (e.max || e.min || e.sort) return { text: 'What kind of product should I look for? For example "earbuds under 50k".', chips: START_CHIPS };
      return {
        text: `Sorry${first ? ' ' + first : ''}, I didn't quite get that. ${CAPABILITIES} Try "phones under 500k" or "compare the first two".`,
        chips: START_CHIPS,
      };
    }
    return search({ query, label, max: e.max, min: e.min, sort: e.sort, page: 1 });
  }

  return { think, buy, confirm, cancel, paymentStatus, myOrders, details, addToCart, mem };
}
