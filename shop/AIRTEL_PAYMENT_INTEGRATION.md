# Airtel Payment Integration Guide

This guide explains how to integrate Airtel Money payments into the MrSqoopExpress shop, based on the existing MTN implementation.

## Table of Contents
1. [Overview](#overview)
2. [Airtel API Basics](#airtel-api-basics)
3. [Environment Setup](#environment-setup)
4. [Implementation Steps](#implementation-steps)
5. [Webhook Configuration](#webhook-configuration)
6. [Signature Verification](#signature-verification)
7. [Testing & Debugging](#testing--debugging)
8. [Production Deployment](#production-deployment)

---

## Overview

Airtel Money is a mobile money service available in Uganda and other African countries. Our implementation will:

- **Initiate payments** from customer's Airtel Money account
- **Receive webhooks** when payment status changes
- **Update order status** based on payment confirmation
- **Handle failures** gracefully with customer notifications

### Payment Flow

```
Customer → Shop (Initiate Payment) → Airtel Gateway
           ↓
        Airtel processes payment
           ↓
Airtel → Shop Webhook → Update Order → Send Confirmations
```

---

## Airtel API Basics

### 1. **Airtel Merchant Account Requirements**

Before integration, you need:

- ✅ **Airtel Money Merchant Account** (business registration required)
- ✅ **Merchant Code** (unique identifier for your business)
- ✅ **API Key & Secret** (authentication credentials)
- ✅ **API Endpoint** (typically `https://apis.airtel.africa/merchant/v1/`)
- ✅ **Sandbox API** (for testing: `https://uat.airtel.africa/merchant/v1/`)

### 2. **Airtel Payment Methods**

Airtel supports multiple payment initiation methods:

| Method | Use Case | Pros | Cons |
|--------|----------|------|------|
| **Online Checkout** | Browser-based payments | User-friendly, hosted UI | Requires redirect |
| **USSD Push** | Direct debit from phone | No app needed | Requires phone verification |
| **Mobile App** | In-app payments | Seamless UX | Requires app integration |
| **Bill Payment API** | Direct API calls | Programmatic control | More complex implementation |

**Recommended:** Start with **Online Checkout** (simplest), then add USSD if needed.

### 3. **Uganda API Endpoints**

```
Base URL (Production): https://api.airtel.africa/merchant/v1/
Base URL (Sandbox): https://uat.airtel.africa/merchant/v1/

Key Endpoints:
POST /payments/
  → Initiate a payment

GET /payments/{transaction_id}/
  → Check payment status

POST /webhooks/
  → Register webhook URLs

For Uganda Specifically:
- Country Code: UG
- Currency: UGX
- Phone Format: 256XXXXXXXXX (12 digits)
```

---

## Environment Setup

### Step 1: Get Airtel Uganda Credentials

1. Visit [Airtel Developer Portal](https://developers.airtel.africa)
2. Sign up and create an account
3. Complete KYC (Know Your Customer) verification
4. Create a new application (select Uganda as country)
5. Note these credentials:
   - **Merchant Code**: e.g., `MRSQOOP`
   - **API Key**: e.g., `prod_12345abc...`
   - **API Secret**: e.g., `secret_98765xyz...`
   - **Access Token**: Generated after authentication
   - **Webhook Secret**: For signature verification

### Step 2: Update `.env.local`

Already configured in your `.env.local`, update with real credentials:

```env
# ===== AIRTEL CONFIGURATION =====
AIRTEL_API_KEY=prod_your_actual_api_key_here
AIRTEL_API_SECRET=secret_your_actual_secret_here
AIRTEL_MERCHANT_CODE=MRSQOOP
AIRTEL_MERCHANT_NAME=MrSqoopExpress
AIRTEL_WEBHOOK_SECRET=your_airtel_webhook_secret
AIRTEL_API_ENDPOINT=https://uat.airtel.africa/merchant/v1/  # Use sandbox first
AIRTEL_CALLBACK_URL=https://your-domain.com/api/webhooks/payments/airtel-mtn
```

### Step 3: Register Webhook URL

In Airtel Developer Portal:
1. Go to **My Apps** → **[Your Application]** → **Webhooks**
2. Add webhook URL: `https://your-domain.com/api/webhooks/payments/airtel-mtn`
3. Select events: `payment.success`, `payment.failed`, `payment.pending`
4. Copy the Webhook Secret to `AIRTEL_WEBHOOK_SECRET`

---

## Implementation Steps

### Step 1: Create Payment Initiation Component

**File:** `shop/app/components/AirtelPaymentButton.jsx`

```javascript
'use client';

import { useState } from 'react';

export default function AirtelPaymentButton({ orderId, amount, customerPhone }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const initiatePayment = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/payments/airtel/initiate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId,
          amount,           // Amount in currency (e.g., UGX)
          customerPhone,    // Phone number (format: 256XXXXXXXXX)
          currency: 'UGX',
          description: `Payment for order ${orderId}`,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Payment initiation failed');
      }

      // Redirect to Airtel payment gateway
      if (data.redirectUrl) {
        window.location.href = data.redirectUrl;
      } else if (data.transactionId) {
        // For USSD, show transaction ID and polling message
        alert(`Payment initiated! Transaction ID: ${data.transactionId}\nCheck your phone for USSD prompt.`);
      }
    } catch (err) {
      setError(err.message);
      console.error('Payment initiation error:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <button
        onClick={initiatePayment}
        disabled={loading}
        className="bg-green-600 text-white px-6 py-2 rounded hover:bg-green-700 disabled:opacity-50"
      >
        {loading ? 'Processing...' : '💳 Pay with Airtel Money'}
      </button>
      {error && <p className="text-red-600 mt-2">{error}</p>}
    </div>
  );
}
```

### Step 2: Create Payment Initiation API Route

**File:** `shop/app/api/payments/airtel/initiate/route.js`

```javascript
import { NextResponse } from 'next/server';
import axios from 'axios';

export async function POST(request) {
  try {
    const { orderId, amount, customerPhone, currency = 'UGX', description } = await request.json();

    // Validate input
    if (!orderId || !amount || !customerPhone) {
      return NextResponse.json(
        { error: 'Missing required fields: orderId, amount, customerPhone' },
        { status: 400 }
      );
    }

    // Validate phone format (Uganda: 256XXXXXXXXX)
    const cleanPhone = customerPhone.replace(/\D/g, '');
    if (!cleanPhone.startsWith('256') || cleanPhone.length !== 12) {
      return NextResponse.json(
        { error: 'Invalid phone number. Use format: 256XXXXXXXXX' },
        { status: 400 }
      );
    }

    const payload = {
      reference: orderId,                                    // Unique order ID
      subscriber: {
        email: `customer@mrsqoopexpress.com`,              // TODO: Get from order
        msisdn: cleanPhone,                                 // Customer phone
      },
      transaction: {
        amount: Math.round(amount),                         // Amount in currency
        currency: currency,
        id: `${orderId}-${Date.now()}`,                     // Unique transaction ID
      },
      merchant: {
        code: process.env.AIRTEL_MERCHANT_CODE,
        name: process.env.AIRTEL_MERCHANT_NAME,
      },
      pin: 'AIRTEL_PIN',                                    // Only for PIN-based auth
      description: description || `Order ${orderId}`,
    };

    // Call Airtel API
    const response = await axios.post(
      `${process.env.AIRTEL_API_ENDPOINT}payments/`,
      payload,
      {
        headers: {
          Authorization: `Bearer ${process.env.AIRTEL_API_KEY}`,
          'Content-Type': 'application/json',
        },
        timeout: 10000,
      }
    );

    console.log('✅ Airtel payment initiated:', {
      orderId,
      transactionId: response.data.id,
      status: response.data.status,
    });

    // Store transaction reference in database
    // TODO: Save to database
    await saveAirtelTransaction({
      orderId,
      transactionId: response.data.id,
      airtelTransactionId: response.data.airtel_money_id || response.data.id,
      amount,
      currency,
      status: response.data.status,
      initiatedAt: new Date(),
    });

    return NextResponse.json({
      success: true,
      transactionId: response.data.id,
      redirectUrl: response.data.checkout_url,              // If available
      status: response.data.status,
      message: response.data.status === 'PENDING'
        ? 'Please enter your Airtel Money PIN on the redirected page'
        : 'Payment processed',
    });
  } catch (error) {
    console.error('❌ Airtel payment initiation error:', error.response?.data || error.message);

    return NextResponse.json(
      {
        error: error.response?.data?.message || error.message || 'Payment initiation failed',
        details: error.response?.data,
      },
      { status: error.response?.status || 500 }
    );
  }
}

async function saveAirtelTransaction(transactionData) {
  // TODO: Implement database save
  console.log('💾 Saving Airtel transaction:', transactionData);
  return true;
}
```

### Step 3: Update Webhook Handler

**File:** `shop/app/api/webhooks/payments/airtel-mtn/route.js` (Update existing file)

Update the signature verification functions:

```javascript
function verifyAirtelSignature(payload, secret) {
  // Airtel uses HMAC-SHA256 for signature verification
  const crypto = require('crypto');

  // Reconstruct the signed content (varies by Airtel version)
  // Common format: amount|currency|reference|timestamp
  const signedContent = `${payload.amount}|${payload.currency}|${payload.reference}|${payload.timestamp}`;

  // Calculate HMAC
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(signedContent)
    .digest('base64');

  console.log('🔐 Airtel signature verification:', {
    provided: payload.signature,
    expected: expectedSignature,
    match: payload.signature === expectedSignature,
  });

  return payload.signature === expectedSignature;
}

function verifyMTNSignature(payload, secret) {
  // MTN uses different signature method
  const crypto = require('crypto');

  // Reconstruct payload string (exact format matters!)
  const payloadString = JSON.stringify({
    externalId: payload.externalId,
    amount: payload.amount,
    currency: payload.currency,
    payer: payload.payer,
    payeeNote: payload.payeeNote,
    transactionStatus: payload.transactionStatus,
  });

  // Calculate signature
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(payloadString)
    .digest('base64');

  return payload.signature === expectedSignature;
}
```

### Step 4: Update Order Handling

Ensure payment handlers update the database correctly:

```javascript
async function updateOrderStatus(orderId, updates) {
  // TODO: Implement actual database update
  // Example for MongoDB:
  /*
  const db = await connectDB();
  const result = await db.collection('orders').updateOne(
    { _id: orderId },
    { $set: updates }
  );
  return result.modifiedCount > 0;
  */

  console.log(`📝 Updating order ${orderId}:`, updates);
  return true;
}
```

---

## Webhook Configuration

### Understanding Airtel Webhooks

Airtel sends webhooks when payment status changes:

**Webhook Payload Example:**
```json
{
  "id": "txn_123456789",
  "reference": "ORDER-001",
  "status": "SUCCESS",
  "amount": 50000,
  "currency": "UGX",
  "subscriber": {
    "msisdn": "256701234567"
  },
  "merchant": {
    "code": "MRSQOOP"
  },
  "timestamp": "2024-07-27T10:30:00Z",
  "signature": "base64_encoded_signature"
}
```

### Webhook Status Values

| Status | Meaning | Action |
|--------|---------|--------|
| `SUCCESS` | Payment completed | Update order to "paid" |
| `FAILED` | Payment declined | Mark order as "payment_failed" |
| `PENDING` | Waiting for confirmation | Mark order as "pending_payment" |
| `REVERSED` | Payment refunded | Mark as "reversed" |

### Testing Webhook Locally

Use `ngrok` to expose your local server:

```bash
# Install ngrok
npm install -g ngrok

# Start ngrok (exposes localhost:3000 as public URL)
ngrok http 3000

# Use the generated URL in Airtel Merchant Dashboard
# Example: https://abc123.ngrok.io/api/webhooks/payments/airtel-mtn
```

Then in `.env.local`:
```env
AIRTEL_CALLBACK_URL=https://abc123.ngrok.io/api/webhooks/payments/airtel-mtn
```

---

## Signature Verification

### Why Signature Verification Matters

Webhooks could be spoofed by attackers. Airtel signs each webhook with a secret, proving it came from Airtel.

### How to Verify

1. **Get the signature** from webhook header: `X-Airtel-Signature`
2. **Reconstruct the signed content** (exact format from Airtel docs)
3. **Calculate HMAC-SHA256** using your webhook secret
4. **Compare** with provided signature

### Example Verification (Node.js)

```javascript
const crypto = require('crypto');

function verifyAirtelWebhook(payload, signature, secret) {
  // Airtel format (confirm with their docs):
  const signedContent = `${payload.amount}${payload.currency}${payload.reference}`;

  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(signedContent)
    .digest('base64');

  return signature === expectedSignature;
}
```

**Important:** Always verify signatures before processing payments!

---

## Testing & Debugging

### 1. Sandbox Testing

**Steps:**
1. Use `AIRTEL_API_ENDPOINT=https://uat.airtel.africa/merchant/v1/`
2. Use test credentials from Airtel
3. Use test phone numbers (provided by Airtel)
4. Monitor webhook delivery in Merchant Dashboard

**Test Credentials:**
```
Phone: 256701234567 (test number)
PIN: 0000
Amount: Any amount (won't actually charge)
```

### 2. Check Webhook Delivery

In Airtel Merchant Dashboard:
1. Go to **Webhooks** → **Logs**
2. View delivery status and response
3. Retry failed webhooks

### 3. Local Debugging

```javascript
// Add verbose logging in webhook handler
console.log('📨 Webhook received:', JSON.stringify(payload, null, 2));
console.log('🔐 Signature valid:', isValid);
console.log('💾 Order updated:', updateResult);
```

Monitor logs:
```bash
npm run dev
# Watch for payment-related logs
```

### 4. Common Issues

| Issue | Solution |
|-------|----------|
| Webhooks not arriving | Check callback URL registered in Airtel Dashboard |
| Signature verification fails | Confirm exact payload format with Airtel |
| Payment not initiating | Verify API key/secret and merchant code |
| CORS errors | Add Airtel domain to CORS policy |

---

## Production Deployment

### Checklist

- [ ] Replace sandbox URL with production: `AIRTEL_API_ENDPOINT=https://apis.airtel.africa/merchant/v1/`
- [ ] Use real API credentials (not sandbox)
- [ ] Test end-to-end payment flow
- [ ] Verify webhook signature verification is enabled
- [ ] Add error monitoring (Sentry, etc.)
- [ ] Test order status updates in database
- [ ] Test customer/admin notifications
- [ ] Load test with multiple concurrent payments
- [ ] Document rollback procedure

### Environment Variables (Production)

```env
# Production Airtel
AIRTEL_API_KEY=prod_your_production_api_key
AIRTEL_API_SECRET=prod_your_production_secret
AIRTEL_API_ENDPOINT=https://apis.airtel.africa/merchant/v1/
AIRTEL_WEBHOOK_SECRET=your_production_webhook_secret
AIRTEL_CALLBACK_URL=https://mrsqoopexpress.com/api/webhooks/payments/airtel-mtn
```

### Monitoring & Alerts

Set up alerts for:
- ⚠️ Failed payment webhook deliveries
- ❌ Signature verification failures
- 📉 Unusually high failed payment rate
- 🔴 Webhook processing errors

---

## Migration from Development to Production

### 1. Parallel Testing
- Keep sandbox environment active during production launch
- Test new features in sandbox first
- Run both environments for 1-2 weeks

### 2. Gradual Rollout
- Start with small percentage of users on Airtel
- Monitor success rate and error logs
- Gradually increase traffic

### 3. Customer Communication
- Notify customers about new payment method
- Provide support for payment issues
- Collect feedback

---

## Airtel vs MTN Comparison

| Feature | Airtel | MTN |
|---------|--------|-----|
| **API Style** | REST/JSON | REST with XML option |
| **Webhook Signature** | HMAC-SHA256 | HMAC-SHA256 |
| **Transaction ID** | UUID format | Reference-based |
| **Timeout** | 10-30 seconds | 5-10 seconds |
| **Retry Policy** | Auto-retry by provider | Manual webhook retry |
| **Error Codes** | Numeric (e.g., 200, 400) | Text-based |

---

## Support & Resources

### Airtel Uganda Developer Resources
- **Developer Portal**: https://developers.airtel.africa
- **API Documentation**: https://developer.airtel.africa/docs
- **Status Page**: https://status.airtel.africa
- **Support Email**: developer-support@airtel.africa
- **Community**: https://developers.airtel.africa (developer community forum)

### Testing Tools
- [Postman Collection](#) (Coming soon)
- [cURL Examples](#) (See section below)

### Contact
- Airtel Support: support@airtel.africa
- API Issues: developer-support@airtel.africa

---

## cURL Examples

### Initiate Payment
```bash
curl -X POST https://uat.airtel.africa/merchant/v1/payments/ \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "reference": "ORDER-001",
    "subscriber": {
      "email": "customer@example.com",
      "msisdn": "256701234567"
    },
    "transaction": {
      "amount": 50000,
      "currency": "UGX",
      "id": "txn_123456"
    },
    "merchant": {
      "code": "MRSQOOP",
      "name": "MrSqoopExpress"
    }
  }'
```

### Check Payment Status
```bash
curl -X GET https://uat.airtel.africa/merchant/v1/payments/txn_123456/ \
  -H "Authorization: Bearer YOUR_API_KEY"
```

### Send Test Webhook
```bash
curl -X POST http://localhost:3000/api/webhooks/payments/airtel-mtn \
  -H "Content-Type: application/json" \
  -H "X-Airtel-Signature: YOUR_TEST_SIGNATURE" \
  -d '{
    "id": "txn_test_123",
    "reference": "ORDER-001",
    "status": "SUCCESS",
    "amount": 50000,
    "currency": "UGX",
    "timestamp": "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'"
  }'
```

---

## Next Steps

1. **Register Airtel Merchant Account** - Start KYC process
2. **Update `.env.local`** - Add real Airtel credentials when ready
3. **Implement Payment Button** - Use component from Step 1
4. **Test in Sandbox** - Use test phone numbers
5. **Deploy to Staging** - Full end-to-end testing
6. **Go Live** - Switch to production credentials
7. **Monitor** - Watch logs and metrics

---

**Last Updated:** 2024-07-27  
**Version:** 1.0  
**Status:** Ready for Implementation
