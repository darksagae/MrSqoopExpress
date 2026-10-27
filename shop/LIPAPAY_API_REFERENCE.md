# LipaPay API — Developer Reference

Working notes for integrating LipaPay (Uganda mobile-money aggregator) into the shop.

Two sources are combined here:

- **Documented** — from `LipaPay_API_Reference.docx` v3.0 (April 2026), downloadable at
  <https://www.lipapayug.com/doc/LipaPay_API_Reference.docx>.
- **Verified** — behaviour actually observed by calling the live API with our merchant
  credentials. **Where the two disagree, the doc is wrong** — those cases are called out
  explicitly below, because several of them will bite during integration.

---

## 1. What LipaPay is (and is not)

LipaPay is an **aggregator in front of MTN Mobile Money and Airtel Money** for Ugandan
merchants. One integration, one signing scheme, both wallets — in UGX only.

| Capability | Supported |
|---|---|
| MTN Mobile Money collection & disbursement | ✅ |
| Airtel Money collection & disbursement | ✅ |
| Account-holder name lookup before charging | ✅ (`/api/pay/bill`) |
| Balance + statement for reconciliation | ✅ |
| **Visa / Mastercard / any card** | ❌ **Not supported** |
| Currencies other than UGX | ❌ |

> **This does not unlock card payments.** LipaPay covers exactly the two wallets our
> checkout already supports. The Visa/Mastercard badges in the site footer are still
> unbacked — a separate card processor (Flutterwave, Paystack, Stripe) would be needed.

What LipaPay *does* buy us: one API instead of two separate MTN and Airtel integrations,
plus name-lookup and reconciliation endpoints we don't currently have.

---

## 2. Our account status (verified)

| Item | Value |
|---|---|
| Merchant ID | `1205036` |
| Private key | Stored as env var — **never commit it** |
| Credentials valid | ✅ Confirmed — request signing accepted, response signature verifies |
| Merchant balance | **0.00 UGX** |
| Environment | These are **production** credentials hitting the production host |

Two consequences:

1. **These are not sandbox credentials.** The doc publishes the shared sandbox pair as
   `MchID=2` / `db761034110c45058490c6772a99b4ab`. Ours is a real merchant account, so
   `/api/pay/unifiedorder` will move **real money against real phone numbers**. Do not
   call it casually while testing.
2. **Balance is 0.00 UGX.** Irrelevant for collections (money flows in), but any
   disbursement will fail until the account is funded.

---

## 3. Environments

| Environment | Base URL | Status |
|---|---|---|
| Production | `https://pay.lipapayug.com` | ✅ Live and responding |
| Development | `http://dev.pay.lipapayug.com` | ❌ **Down — 502 Bad Gateway** (nginx) |

Notes:

- The sandbox host being down means **there is currently no safe place to test a real
  payment.** Ask LipaPay support (support@lipapayug.com, +256 200 998 096) when it's back.
- `https://admin.lipapayug.com` is the **merchant dashboard** — a browser login UI, not an
  API. Its `/User/` path 404s for API calls. Don't point code at it.
- Dev is plain **HTTP**, production is HTTPS.

---

## 4. Authentication & request signing

There are no API keys in headers and no OAuth. Every request carries `MchID` plus an MD5
`Sign`, and the private key is **only ever used locally to compute that hash** — it is
never transmitted.

### Protocol basics

| Property | Value |
|---|---|
| Method | `POST` (all endpoints) |
| Content-Type | `application/json` |
| Encoding | UTF-8 |
| Signature | MD5, lowercase hex, 32 chars |

### Algorithm

1. Take every request field **except `Sign`**.
2. Order them **as listed in that endpoint's parameter table — not alphabetically.**
3. Join as `Key=Value&Key=Value&…`, **omitting any field that is null or empty**.
4. Append `&privateKey=<your-key>`.
5. MD5 the whole string → lowercase hex.

Values are used **raw** — not URL-encoded. Note `TraderFullName=Sand Box` in the official
example keeps its literal space.

### Verified implementation

This reproduces the doc's published example hash exactly
(`fc92ceeaa10d8efb2783feecc6aae395`), so the algorithm below is confirmed correct:

```js
import crypto from 'crypto';

/**
 * LipaPay MD5 signature.
 * `fields` MUST be insertion-ordered to match the endpoint's parameter table —
 * plain object literals preserve string-key order in JS, which is what we rely on.
 */
function sign(fields, privateKey) {
  const base = Object.entries(fields)
    .filter(([, v]) => v !== null && v !== undefined && v !== '')
    .map(([k, v]) => `${k}=${v}`)
    .join('&');
  return crypto.createHash('md5').update(`${base}&privateKey=${privateKey}`, 'utf8').digest('hex');
}
```

### Verifying responses and callbacks

Responses and callbacks are signed too, using the **`Data` object's** fields in table
order. Always verify incoming callbacks — it's the only thing proving the POST came from
LipaPay.

> ⚠️ **`PayMessage` is excluded from the signature** even though it's present in the
> payload. Include it and every verification fails. This applies to the order-query
> response and to callbacks.

---

## 5. Endpoints

All paths are relative to the base URL from §3.

### 5.1 Unified Order — `/api/pay/unifiedorder`

Starts a collection (charge a customer) or disbursement (pay someone out). **Asynchronous** —
this call only *initiates*; the real outcome arrives via callback.

**⚠️ This is the money-moving endpoint. Never call it as a connectivity test.**

| Field | Req | Type | Notes |
|---|---|---|---|
| `Version` | Y | String(10) | Always `"v1.0"` |
| `MchID` | Y | Int(8) | Our merchant ID |
| `TimeStamp` | Y | Long(10) | UTC Unix seconds — see tolerance in §7 |
| `Channel` | Y | Int(1) | `0` Auto (detect from prefix) · `1` MTN · `2` Airtel |
| `OutTradeNo` | Y | String(6–36) | **Our** order number. Unique per merchant. Charset `0-9 A-Z a-z - _ *` |
| `Amount` | Y | Int(8) | **UGX cents** — see §7. Min `50000` (= 500 UGX). Whole numbers only |
| `TransactionType` | Y | Int(1) | `1` Collection (money in) · `2` Disbursement (money out) |
| `TraderID` | Y | String(10–20) | Customer MSISDN, e.g. `0750000000` |
| `TraderFullName` | Y | String(50) | Account holder name. `"NONEEDMATCHNAMES"` skips name matching |
| `Description` | Y | String(200) | Free text shown on the transaction |
| `NotifyUrl` | Y | String(155) | Where LipaPay POSTs the result |
| `Sign` | Y | String(32) | MD5 per §4 |

Response `Data`: `OutTradeNo`, `TransactionId` (platform UUID), `ActualPaymentAmount`,
`ActualCollectAmount`, `PayerCharge`, `PayeeCharge`, `ChannelCharge`, `Sign`.

`TraderFullName` matters: LipaPay verifies the name against the wallet unless you pass the
literal `NONEEDMATCHNAMES`. Our checkout collects a name, but customers routinely type
something that won't match their registered MoMo name — so either call `/api/pay/bill`
first to fetch the real name, or send the bypass value.

### 5.2 Payment Result Query — `/api/pay/orderquery`

Authoritative status lookup. Use when a callback never arrived.

Request: `Version`, `MchID`, `TimeStamp`, `OutTradeNo`, `Sign`.

Response `Data`: `PayStatus`, `PayTime`, `OutTradeNo`, `TransactionId`, `Amount`,
`ActualPaymentAmount`, `ActualCollectAmount`, `PayerCharge`, `PayeeCharge`, `PayMessage`, `Sign`.

**`PayStatus` enum — the one that matters:**

| Value | Meaning |
|---|---|
| `0` | Processing (customer hasn't approved the prompt yet) |
| `1` | Successful |
| `2` | Failed |

### 5.3 Payment Result Callback

LipaPay POSTs to the `NotifyUrl` from the unified order. Body carries the same fields as
the 5.2 `Data` object (including `Sign`).

**You must reply with the plain-text body `SUCCESS` and HTTP 200.** Anything else — wrong
body, non-200, timeout — is treated as failure and triggers retries.

| Behaviour | Detail |
|---|---|
| Retry schedule | 1s → 30s → 30s → 30s |
| Retry ceiling | Up to **24 hours** |
| Duplicates | Expected. Make the handler idempotent |

Idempotency: check whether `OutTradeNo` is already settled and no-op if so. Our existing
webhook handlers already follow this shape.

### 5.4 Prepaid Bill Enquiry — `/api/pay/bill`

Fee + **account-holder name** preview before charging. Read-only.

Request: `Version`, `MchID`, `TimeStamp`, `Channel`, `TransactionType`, `TraderID`, `Amount`, `Sign`.

Response `Data`: `TraderID`, `GivenName`, `FamilyName`, `FullName`, `Amount`,
`ServiceCharge`, `ServiceChargeRate`, `Sign`.

This is genuinely useful for checkout UX — confirm "Paying as JOHN OKELLO, fee 1,500 UGX"
before sending the prompt. **But see the IP-whitelist blocker in §7 — this endpoint is
currently blocked for us.**

### 5.5 Get Balance — `/api/pay/balance`

Request: `Version`, `MchID`, `TimeStamp`, `Sign`. Response `Data`: `Balance`, `Sign`.

Cheapest way to health-check credentials — no side effects.

### 5.6 Statement of Account — `/api/pay/statement`

Reconciliation. Request: `Version`, `MchID`, `TimeStamp`, `StartTime`, `EndTime`, `Sign`.
Dates are `yyyyMMdd`. **Max window is 3 days.**

Response `Data.Items[]` — one entry per transaction, same shape as 5.2 minus `Sign`.

---

## 6. Status codes

`StatusCode` lives **inside the JSON body**, not the HTTP status.

| Code | Documented meaning | Verified? |
|---|---|---|
| 200 | Success, `Data` populated | ✅ |
| 202 | Success, nothing to return | — |
| 400 | Parameter error, see `Errors` | ✅ |
| 401 | Signature verification failed | ✅ `"Signature verification failed!"` |
| 403 | Documented as *duplicate order number* | ⚠️ **Also used for IP-whitelist rejection** — see §7 |
| 404 | Documented as *order not found* | ❌ **Never observed** — unknown orders return 400 |
| 500 | Platform error — retry | — |
| 502 | Channel provider error — retry | — |

---

## 7. Verified gotchas

Everything here was confirmed against the live API. Most of it is either undocumented or
contradicts the doc.

### 7.1 🔴 IP whitelist on transactional endpoints — the main blocker

`/api/pay/bill` returns:

```json
{"StatusCode":403,"Succeeded":false,
 "Errors":"Your IP address (x.x.x.x) is not authorized to access this API interface …
           Please contact the administrator to add your IP address to the whitelist."}
```

Observed scope:

| Endpoint | Reachable from an unlisted IP? |
|---|---|
| `/api/pay/balance` | ✅ yes |
| `/api/pay/orderquery` | ✅ yes |
| `/api/pay/statement` | ✅ yes |
| `/api/pay/bill` | ❌ **403 — whitelist required** |
| `/api/pay/unifiedorder` | ❓ untested (can't test without moving money) — **assume whitelisted** |

**How unstable are dynamic IPs in practice?** Across a handful of consecutive calls from
one sandboxed environment, LipaPay reported four different source addresses:

```
160.79.106.129  →  160.79.106.131  →  136.111.196.80  →  34.56.134.135
```

Not even the /16 held. Vercel serverless behaves the same way — whitelisting is simply
incompatible with it.

**Why this is a problem for us:** the shop runs on Vercel serverless functions, which have
**dynamic egress IPs**. There is no fixed address to whitelist. Options:

1. Vercel **Static IPs** — a paid add-on (Pro/Enterprise tier).
2. Route LipaPay calls through a small fixed-IP proxy (cheap VPS / Cloudflare Worker with
   a dedicated egress).
3. Ask LipaPay whether they can whitelist a CIDR range, or waive it for our merchant.

This needs resolving **before** any integration work, or `unifiedorder` will 403 in
production even though it works from a whitelisted machine.

### 7.2 HTTP status is always 200

Even hard failures return HTTP 200 with the real code in the body. Never branch on
`res.ok` / `res.status` — always parse and check `StatusCode` + `Succeeded`.

### 7.3 Timestamp tolerance is ~±2 minutes

Measured against `/api/pay/balance`:

| Offset from real time | Result |
|---|---|
| −90s | ✅ accepted |
| −120s | ❌ rejected |
| +120s | ✅ accepted |
| +180s | ❌ rejected |

So roughly **−120s to +180s**. A server with drifting clock will fail intermittently with
a confusing 400. Ensure NTP sync; don't reuse a cached timestamp across retries.

### 7.4 Amounts are in CENTS, not shillings

`Amount: 50000` means **500 UGX**, not 50,000 UGX. A naive `Math.round(priceUGX)` would
overcharge by **100×**. Convert explicitly:

```js
const amountCents = Math.round(amountUGX * 100); // 500 UGX -> 50000
```

Minimum is `50000` cents = **500 UGX**. Airtel rejects decimals, so it must be a whole number.

### 7.5 Validation errors are an object, and partly in Chinese

`Errors` is documented as "String | String[]" but on validation failure it's an **object
keyed by field name**:

```json
{"StatusCode":400,"Succeeded":false,
 "Errors":{"Version":["Version不允许为空!"]}}
```

(`Version不允许为空!` = "Version must not be empty!") Any error-rendering code must handle
string, array, **and object**, and must not assume English.

### 7.6 Unknown order returns 400, not 404

Documented as 404; actually returns `{"StatusCode":400,"Errors":"OutTradeNo does not exist!"}`.
Don't branch on 404 to detect unknown orders.

### 7.7 `StartTime`/`EndTime` are required on statement

Doc says both are optional and default to today. They are **mandatory**:

```json
{"StatusCode":400,"Errors":{"EndTime":["The EndTime field is required."],
                            "StartTime":["The StartTime field is required."]}}
```

With both supplied it returns `200` / `{"Items":[]}`.

### 7.8 `JSON.parse()` breaks response-signature verification

LipaPay signs the **literal decimal text it sent**, not the numeric value. The balance
response carries `"Balance":0.000000`, and only that exact string hashes to the `Sign`
it ships with:

| String signed | MD5 |
|---|---|
| `Balance=0.000000&privateKey=…` | `23c6f7b9…` ✅ matches |
| `Balance=0.00&privateKey=…` | `b5e1dfc6…` ✗ |
| `Balance=0&privateKey=…` | `330c50d6…` ✗ |

`JSON.parse()` turns `0.000000` into the number `0`, which re-serializes as `"0"` — so
verification always fails if you rebuild the string from parsed values. Extract the raw
token from the response **text** instead. `scripts/lipapay-check.mjs` has a `rawField()`
helper that does this.

Same trap applies to callbacks, where a false mismatch would mean rejecting a genuine
payment notification.

### 7.9 Field order in the signature is load-bearing

Sorting alphabetically — the instinct for most signing schemes — produces a wrong hash and
a 401. Order must follow the endpoint's parameter table. Keep signing objects as ordered
literals and never rebuild them via `Object.keys().sort()`.

---

## 8. Network prefixes (Appendix A)

Used to pick `Channel` when not using auto-detect (`Channel=0`).

| Operator | Channel | Prefixes |
|---|---|---|
| MTN Uganda | `1` | 760–789, 790–794 |
| Airtel Uganda | `2` | 700–709, 730–731, 740–759 |

Numbers are 9 national digits; `TraderID` accepts the 10-digit local form with leading `0`
(`0750000000`) or the 9-digit national form. Country code +256.

Our existing checkout already does this prefix detection in
`app/checkout/page.js` — note its MTN list (`77, 78, 76, 39, 31`) is **narrower** than
LipaPay's (760–789, 790–794) and includes landline-ish prefixes; worth reconciling if we
switch over.

---

## 9. How it is wired (implemented)

Built and merged, but **dormant by default**. Nothing changes until
`PAYMENT_PROVIDER=lipapay` is set — which must wait for a whitelisted static IP,
or every checkout 403s.

```
lib/payments/lipapay.js                    provider: requestToPay, getPaymentStatus,
                                           verifySignature, payStatusToString
lib/payments/resolve.js                    picks direct MTN/Airtel vs LipaPay
app/api/webhooks/payments/lipapay/route.js callback handler
```

`resolve.js` is the switch:

| `PAYMENT_PROVIDER` | Behaviour |
|---|---|
| unset / anything else | **Direct `mtn.js` / `airtel.js`** — current production behaviour |
| `lipapay` | Both networks routed through LipaPay |

### The customer never sees "LipaPay"

They pick **MTN Mobile Money** or **Airtel Money**, the prompt arrives from that
wallet, and those are the only names the UI uses — the same way a card checkout says
"Visa", not "Stripe". The labels are truthful either way; only the processor behind them
changes.

This is enforced, not just intended:

- `NETWORK_LABEL` in `resolve.js` is the single source of customer-facing names.
- Error paths return generic text. The `missing` array (`LIPAPAY_MCH_ID`, …) and
  `error.code` (`LIPAPAY_IP_NOT_WHITELISTED`, …) name the processor, so both now stay in
  server logs instead of the API response.
- `GET /api/orders` is unauthenticated and previously listed missing env var names —
  it now returns only `{ ready }` per network.
- Verified: the string `lipa` appears in **no client-side bundle**.

One thing that *will* be visible: the charge may appear on the customer's MoMo statement
under LipaPay's merchant name rather than ours. Support should expect
"who is this charging me?" questions.

### Behaviour notes

- `OutTradeNo` is our `orderId` (`MSE-…`), which is also what `orderquery` takes — so it
  doubles as the `payment_ref` we persist, and no schema change was needed.
- Retries after a failure generate a fresh `orderId`, avoiding the `403 duplicate`
  that resubmitting the same `OutTradeNo` would cause.
- Airtel first calls `bill` with channel 2 and sends its registered `FullName` as
  `TraderFullName`. Live name matching rejected `isagala mark` and required
  `MARK ISAGALA`; delivery names must not determine the wallet name. A failed or
  incomplete lookup prevents collection. MTN retains `NONEEDMATCHNAMES`.
- `Channel` follows the customer's selection (MTN=1 / Airtel=2) rather than auto-detect,
  so a mismatch fails loudly instead of silently charging the other wallet.
- The callback handler verifies the signature *and* re-confirms via `orderquery` before
  settling. Convenient detail: `orderquery` is **not** IP-gated, so callback verification
  keeps working from Vercel even while `unifiedorder` is blocked.

### Enabling it later

```
PAYMENT_PROVIDER=lipapay
LIPAPAY_MCH_ID=1205036
LIPAPAY_PRIVATE_KEY=<rotated key>
LIPAPAY_BASE_URL=https://pay.lipapayug.com
LIPAPAY_NOTIFY_URL=https://www.mrsqoopexpress.com/api/webhooks/payments/lipapay
```

Give LipaPay the Vercel static IP first, then flip `PAYMENT_PROVIDER`. Roll back by
unsetting that one variable.

---

## 10. Original interface mapping

Current structure, for reference:

```
lib/payments/mtn.js      → isMtnConfigured(), mtnMissing(),
                           requestToPay({amountUGX, phone, orderId, note}),
                           getPaymentStatus(referenceId)
lib/payments/airtel.js   → same interface shape
app/api/orders/create/   → branches on method === 'mtn' | 'airtel'
app/api/webhooks/payments/mtn/       → provider callbacks
app/api/webhooks/payments/airtel-mtn/
```

A LipaPay provider would slot in as `lib/payments/lipapay.js` exposing the **same
interface**, so `orders/create` only needs one more branch:

| Our interface | LipaPay endpoint |
|---|---|
| `isLipaPayConfigured()` | env presence check |
| `requestToPay({amountUGX, phone, orderId})` | `POST /api/pay/unifiedorder` (`TransactionType=1`) |
| `getPaymentStatus(outTradeNo)` | `POST /api/pay/orderquery` → map `PayStatus` 0/1/2 |
| *(new)* `previewCharge({phone, amountUGX})` | `POST /api/pay/bill` — name + fee preview |

Callback handler → `app/api/webhooks/payments/lipapay/route.js`, which must:

1. Verify `Sign` over the `Data` fields **excluding `PayMessage`**.
2. Look up `OutTradeNo`; if already settled, return `SUCCESS` and stop (idempotency).
3. Map `PayStatus` → our order state.
4. Respond with the literal body `SUCCESS`, HTTP 200.

Env vars (Vercel project settings, never in the repo):

```
LIPAPAY_MCH_ID=1205036
LIPAPAY_PRIVATE_KEY=<rotated key>
LIPAPAY_BASE_URL=https://pay.lipapayug.com
LIPAPAY_NOTIFY_URL=https://www.mrsqoopexpress.com/api/webhooks/payments/lipapay
```

`OutTradeNo` must be unique per merchant and restricted to `0-9 A-Z a-z - _ *`. Our
existing `ORD-1001`-style IDs fit, but reusing one after a failed attempt returns `403
duplicate` — append a retry suffix (`ORD-1001-R2`) rather than resubmitting the same value.

---

## 11. Checking it from a whitelisted machine

`scripts/lipapay-check.mjs` exercises the API end to end. Run it from a machine whose IP
is whitelisted — not from Vercel.

```bash
export LIPAPAY_MCH_ID=1205036
export LIPAPAY_PRIVATE_KEY=<your key>

# Read-only: balance + statement. Works from any IP.
node scripts/lipapay-check.mjs

# Adds the IP-gated name/fee lookup — the real whitelist test.
node scripts/lipapay-check.mjs --phone 07XXXXXXXX
```

It verifies response signatures, and on a 403 prints the address **LipaPay itself saw** —
more reliable than an IP echo service, which reports something different behind a proxy.

A real 500 UGX collection needs two explicit flags, since there is no sandbox:

```bash
node scripts/lipapay-check.mjs --phone 07XXXXXXXX --charge --confirm
```

That places the order, then polls `orderquery` until `PayStatus` resolves. Without
`--confirm` it explains what would happen and exits.

---

## 12. Open items

1. 🔴 **Resolve the IP whitelist** (§7.1) — hard blocker on Vercel's dynamic IPs.
2. 🔴 **Rotate the private key** — it was shared in plaintext over chat. The vendor's own
   doc says to rotate on suspected exposure.
3. 🟠 **No working sandbox** — `dev.pay.lipapayug.com` is 502. Ask when it returns; until
   then the only way to test a real charge is a live low-value transaction (min 500 UGX)
   against a phone we control.
4. 🟠 **Confirm `unifiedorder` whitelist status** once an IP is listed.
5. 🟡 **Decide whether LipaPay replaces or supplements** the direct MTN/Airtel
   integrations — it covers the same two wallets, so the win is consolidation plus
   name-lookup and reconciliation, not new payment methods.
6. 🟡 **Fund the account** if disbursements (refunds) are ever wanted — balance is 0.00.
