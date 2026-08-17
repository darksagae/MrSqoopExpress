# Airtel vs MTN Payment Integration

This guide compares Airtel Money and MTN Mobile Money to help you understand implementation differences.

## Quick Comparison

| Aspect | Airtel Money | MTN Mobile Money |
|--------|-------------|-----------------|
| **API Base URL** | `https://apis.airtel.africa/merchant/v1/` | `https://api.mtn.com/v1/` (varies by region) |
| **Authentication** | Bearer token (API Key) | OAuth 2.0 (Client Credentials) |
| **Payment Initiation** | POST `/payments/` | POST `/payment/` |
| **Status Check** | GET `/payments/{id}/` | GET `/payment/{id}/` |
| **Webhook Signature** | HMAC-SHA256 in header | HMAC-SHA256 in body |
| **Phone Format** | `256701234567` (12 digits) | `256701234567` (12 digits) |
| **Timeout** | 30 seconds | 10 seconds |
| **Retry Policy** | Auto-retries by platform | Manual retry required |
| **Currency** | USD, UGX, etc. | USD, UGX, etc. |

## API Structure Comparison

### 1. Authentication

#### Airtel Money (Bearer Token)
```javascript
// Simple bearer token authentication
const headers = {
  'Authorization': `Bearer ${AIRTEL_API_KEY}`,
  'Content-Type': 'application/json'
};
```

#### MTN Mobile Money (OAuth 2.0)
```javascript
// Requires getting an access token first
const tokenResponse = await fetch('https://api.mtn.com/oauth/token', {
  method: 'POST',
  headers: {
    'Authorization': `Basic ${base64(clientId:clientSecret)}`,
    'Content-Type': 'application/x-www-form-urlencoded'
  },
  body: 'grant_type=client_credentials'
});

const accessToken = tokenResponse.access_token;
const headers = {
  'Authorization': `Bearer ${accessToken}`,
  'X-Target-Environment': 'production',
  'Content-Type': 'application/json'
};
```

**Key Difference:** Airtel uses simple bearer tokens, MTN requires OAuth 2.0 flow.

### 2. Payment Initiation

#### Airtel Money Request
```javascript
const payload = {
  reference: "ORDER-001",                    // Your order ID
  subscriber: {
    email: "customer@example.com",
    msisdn: "256701234567"                  // Phone number
  },
  transaction: {
    amount: 50000,
    currency: "UGX",
    id: "txn_123456"                        // Unique transaction ID
  },
  merchant: {
    code: "MRSQOOP",
    name: "MrSqoopExpress"
  },
  description: "Order for products"
};

const response = await axios.post(
  'https://apis.airtel.africa/merchant/v1/payments/',
  payload,
  { headers: airtelHeaders }
);

// Response
{
  "id": "txn_abc123",                       // Airtel transaction ID
  "status": "PENDING",
  "checkout_url": "https://checkout.airtel...", // Redirect URL
  "reference": "ORDER-001"
}
```

#### MTN Mobile Money Request
```javascript
const payload = {
  externalId: "ORDER-001",                  // Your order ID
  amount: "50000",                          // String, not number!
  currency: "UGX",
  payee: {
    partyIdType: "MSISDN",
    partyId: "256701234567"                 // Phone number
  },
  payer: {
    partyIdType: "CONSUMER",
    partyId: "256701234567"
  },
  payerMessage: "Payment for order",
  payeeNote: "MrSqoopExpress order",
  callbackUrl: "https://your-domain.com/api/webhooks/payments/mtn"
};

const response = await axios.post(
  'https://api.mtn.com/v1/payment/',
  payload,
  { headers: mtnHeaders }
);

// Response (often async)
{
  "transactionId": "12345",
  "status": "PENDING",
  "externalId": "ORDER-001"
}
```

**Key Differences:**
- **Field names:** Airtel uses `reference`, MTN uses `externalId`
- **Data types:** Airtel `amount` is number, MTN `amount` is string
- **Structure:** Airtel has `subscriber`, MTN has `payer`/`payee`
- **Callback:** MTN requires callback URL in request, Airtel uses webhook registration

### 3. Webhook Payload

#### Airtel Money Webhook
```json
{
  "id": "txn_abc123",
  "reference": "ORDER-001",
  "status": "SUCCESS",
  "amount": 50000,
  "currency": "UGX",
  "subscriber": {
    "msisdn": "256701234567",
    "email": "customer@example.com"
  },
  "merchant": {
    "code": "MRSQOOP"
  },
  "timestamp": "2024-07-27T10:30:00Z",
  "signature": "base64_signature_here"
}
```

**Signature Verification:**
```javascript
// Header: X-Airtel-Signature
const signature = req.headers['x-airtel-signature'];

// Content to sign (ask Airtel for exact format)
const content = `${payload.amount}${payload.currency}${payload.reference}`;

// Verify
const expected = crypto
  .createHmac('sha256', AIRTEL_WEBHOOK_SECRET)
  .update(content)
  .digest('base64');

return signature === expected;
```

#### MTN Mobile Money Webhook
```json
{
  "externalId": "ORDER-001",
  "amount": "50000",
  "currency": "UGX",
  "financialTransactionId": "12345",
  "payer": {
    "partyIdType": "MSISDN",
    "partyId": "256701234567"
  },
  "transactionStatus": "SUCCESS",
  "reason": {
    "code": "TRANSACTION_SUCCESS",
    "message": "Success"
  },
  "timestamp": "2024-07-27T10:30:00Z",
  "signature": "signature_here"
}
```

**Signature Verification:**
```javascript
// No header, signature in body
const signature = payload.signature;
delete payload.signature; // Remove signature from payload before verification

// Recreate payload string (order matters!)
const content = JSON.stringify(payload);

// Verify
const expected = crypto
  .createHmac('sha256', MTN_WEBHOOK_SECRET)
  .update(content)
  .digest('base64');

return signature === expected;
```

**Key Differences:**
- **Field names:** Status field is `status` vs `transactionStatus`
- **Signature location:** Header vs body
- **Signature verification:** Needs exact JSON string reconstruction

### 4. Status Polling (Optional)

Both platforms support polling to check payment status:

#### Airtel Money Status Check
```javascript
const response = await axios.get(
  'https://apis.airtel.africa/merchant/v1/payments/txn_abc123/',
  { headers: airtelHeaders }
);

// Returns same structure as webhook
{
  "id": "txn_abc123",
  "status": "SUCCESS",
  "amount": 50000,
  ...
}
```

#### MTN Mobile Money Status Check
```javascript
const response = await axios.get(
  'https://api.mtn.com/v1/payment/12345',
  { 
    headers: mtnHeaders,
    params: {
      externalId: "ORDER-001"
    }
  }
);

// Returns payment details
{
  "transactionId": "12345",
  "status": "SUCCESS",
  "externalId": "ORDER-001",
  ...
}
```

## Implementation Differences

### Phone Number Format

Both expect: **`256XXXXXXXXX`** (12 digits for Uganda)

```javascript
function formatPhoneNumber(phone) {
  // Remove everything except digits
  let clean = phone.replace(/\D/g, '');
  
  // Add 256 prefix if not present
  if (!clean.startsWith('256')) {
    if (clean.startsWith('0')) {
      clean = '256' + clean.substring(1);
    } else {
      clean = '256' + clean;
    }
  }
  
  // Validate
  if (clean.length !== 12 || !clean.startsWith('256')) {
    throw new Error('Invalid phone number');
  }
  
  return clean;
}
```

### Amount Handling

| Provider | Type | Example | Note |
|----------|------|---------|------|
| Airtel | Number | `50000` | Direct number |
| MTN | String | `"50000"` | Must be string |

```javascript
// Airtel
const amount = 50000; // Number

// MTN
const amount = "50000"; // String
```

### Error Handling

#### Airtel Errors
```javascript
// Airtel returns HTTP status codes
// 200 = Success
// 400 = Invalid request
// 401 = Authentication failed
// 500 = Server error

const errorCode = response.status;
const errorMessage = response.data.message;
```

#### MTN Errors
```javascript
// MTN returns different error format
{
  "referenceId": "12345",
  "errors": [
    {
      "code": "INVALID_REQUEST",
      "message": "Invalid phone number"
    }
  ]
}

const error = response.data.errors[0];
```

## Shared Implementation Patterns

### 1. Webhook Verification (Both)
```javascript
// Both use HMAC-SHA256
// Steps:
// 1. Extract signature from webhook
// 2. Reconstruct signed content
// 3. Calculate expected signature
// 4. Compare (timing-safe comparison)
// 5. Process only if valid

function verifySignature(payload, signature, secret) {
  const crypto = require('crypto');
  
  // Reconstruct content (format varies)
  const content = reconstructContent(payload);
  
  // Calculate expected
  const expected = crypto
    .createHmac('sha256', secret)
    .update(content)
    .digest('base64');
  
  // Timing-safe comparison (prevents timing attacks)
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expected)
  );
}
```

### 2. Order Status Update (Both)
```javascript
// Both follow same flow:
// Webhook received → Verify signature → Update order → Send confirmations

async function handlePaymentWebhook(payload) {
  // 1. Verify signature
  if (!verifySignature(payload)) {
    throw new Error('Invalid signature');
  }
  
  // 2. Update order status
  const status = mapPaymentStatus(payload.status);
  await updateOrderStatus(payload.reference || payload.externalId, status);
  
  // 3. Send notifications
  await sendCustomerEmail(payload.reference);
  await sendAdminNotification(payload.reference);
  
  return { success: true };
}
```

### 3. Retry Logic (Both)
```javascript
// Both should retry failed webhooks
const maxRetries = 3;
const retryDelays = [5000, 10000, 30000]; // 5s, 10s, 30s

async function processWebhookWithRetry(payload, attempt = 0) {
  try {
    return await updateOrderStatus(payload);
  } catch (error) {
    if (attempt < maxRetries) {
      setTimeout(() => {
        processWebhookWithRetry(payload, attempt + 1);
      }, retryDelays[attempt]);
    } else {
      // Log for manual review
      console.error('Webhook processing failed after retries:', payload);
    }
  }
}
```

## Testing Both Providers

### Test Credentials

#### Airtel Sandbox
```
Base URL: https://uat.airtel.africa/merchant/v1/
Test Phone: 256701234567
Test PIN: 0000
```

#### MTN Sandbox
```
Base URL: https://sandbox.momodeveloper.mtn.com/
Test Phone: 256701234567
Test PIN: 0000
```

### Side-by-Side Test

```javascript
async function testBothProviders() {
  const testData = {
    orderId: 'TEST-001',
    amount: 5000,
    phone: '256701234567'
  };

  // Test Airtel
  try {
    const airtelResponse = await initiateAirtelPayment(testData);
    console.log('✅ Airtel:', airtelResponse);
  } catch (err) {
    console.error('❌ Airtel:', err.message);
  }

  // Test MTN
  try {
    const mtnResponse = await initiateMTNPayment(testData);
    console.log('✅ MTN:', mtnResponse);
  } catch (err) {
    console.error('❌ MTN:', err.message);
  }
}
```

## Migration Path

If you already have MTN implemented and want to add Airtel:

### Step 1: Minimal Changes to Webhook Handler
```javascript
// Existing code handles both
async function POST(request) {
  const payload = await request.json();
  const provider = detectProvider(payload);
  
  if (provider === 'airtel') {
    const isValid = verifyAirtelSignature(payload);
  } else if (provider === 'mtn') {
    const isValid = verifyMTNSignature(payload);
  }
  
  // Rest is same...
}

function detectProvider(payload) {
  // Airtel uses 'id' + 'reference'
  // MTN uses 'transactionId' + 'externalId'
  if (payload.reference && payload.id) return 'airtel';
  if (payload.externalId && payload.transactionId) return 'mtn';
  return 'unknown';
}
```

### Step 2: Add Airtel Payment Initiation
```javascript
// Create new file: /api/payments/airtel/initiate/route.js
// Similar to existing MTN implementation
// Just use Airtel API endpoints and format
```

### Step 3: Update Checkout
```javascript
// Add Airtel button alongside MTN
<div className="payment-methods">
  <AirtelPaymentButton />
  <MTNPaymentButton />
</div>
```

## Common Issues & Solutions

| Issue | Airtel Solution | MTN Solution |
|-------|-----------------|--------------|
| **Auth fails** | Check API Key format | Check OAuth token not expired |
| **Phone invalid** | Must be 12 digits starting 256 | Must be 12 digits starting 256 |
| **Webhook not received** | Check webhook registration | Check callback URL in request |
| **Signature fails** | Verify exact content format | Verify JSON reconstruction order |
| **Timeout** | Default 30s, configurable | Default 10s, strict |

## Recommendations

### Start With
1. **Airtel first** - Simpler authentication (bearer token)
2. **Test in sandbox** - Use ngrok for webhook testing
3. **Add MTN later** - Reuse webhook framework

### Best Practices
- ✅ Verify all webhooks before processing
- ✅ Store transaction IDs for reconciliation
- ✅ Implement idempotency (same webhook twice = safe)
- ✅ Monitor success rates by provider
- ✅ Log all API calls for debugging
- ✅ Set up alerts for payment failures

---

**Key Takeaway:** Both APIs are similar in structure, but differ in authentication and field naming. Once you handle both signature verification methods, the rest is interchangeable.
