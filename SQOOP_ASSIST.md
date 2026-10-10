# Sqoop Assist — judging and testing guide

Sqoop Assist is the shopping assistant for Mr Sqoop Express, built for the
Alexa+ track. It is an MCP server inside the shop (MCP spec 2025-11-25,
Streamable HTTP, stateless, JSON responses).

- **MCP endpoint:** `https://www.mrsqoopexpress.com/api/mcp`
- **Try it in the browser:** open https://www.mrsqoopexpress.com and tap **Ask Sqoop**
  (bottom right), or open https://www.mrsqoopexpress.com/assist
- **Code:** `shop/app/api/mcp/route.js` (endpoint), `shop/lib/assist/` (tools),
  `shop/app/components/assistant/` (chat widget), `infra/voice-server/` (voice)

## Tools

| Tool | What it does | Needs sign-in |
|---|---|---|
| `search_products` | Search the catalogue, optional max price in UGX | No |
| `get_price_quote` | Item + handling fee + shipping to Uganda, total in UGX, delivery window | No |
| `get_deals` | Best sellers right now | No |
| `track_order` | Order status; needs order number **and** checkout phone | No |
| `my_orders` | The signed-in customer's orders | Yes |
| `prepare_order` | Prices an order and returns a signed confirmation (10 min) | Yes |
| `place_order` | Places the order only with that confirmation; customer approves the Mobile Money charge with their own PIN | Yes |
| `payment_status` | Whether the Mobile Money payment went through | Yes |

Account tools only use the session for requests from the shop's own pages,
so another site can't order in a visitor's name.

## Test it from a terminal

```bash
U=https://www.mrsqoopexpress.com/api/mcp
H=(-H 'content-type: application/json' -H 'accept: application/json, text/event-stream' -H 'mcp-protocol-version: 2025-11-25')

# Handshake and tool list
curl -s $U "${H[@]}" -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"judge","version":"1"}}}'
curl -s $U "${H[@]}" -d '{"jsonrpc":"2.0","id":2,"method":"tools/list"}'

# Search with a budget, then a price quote
curl -s $U "${H[@]}" -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"search_products","arguments":{"query":"wireless earbuds","max_price_ugx":150000}}}'
curl -s $U "${H[@]}" -d '{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"get_deals","arguments":{}}}'

# Tracking refuses a wrong phone number
curl -s $U "${H[@]}" -d '{"jsonrpc":"2.0","id":5,"method":"tools/call","params":{"name":"track_order","arguments":{"order_id":"MSE-1001","phone":"0772123456"}}}'
```

Any MCP client (e.g. the MCP Inspector) can connect to the same URL with the
Streamable HTTP transport.

## Run it locally

```bash
cd shop
npm install
ASSIST_STORE_URL=https://www.mrsqoopexpress.com npm run dev   # reads live store data
# MCP endpoint: http://localhost:3000/api/mcp
```

`ASSIST_STORE_URL` lets a local server answer from the live shop, so no
database or AliExpress credentials are needed to try the public tools.
