# Airtel Payment Integration - Quick Start

## 📚 Complete Documentation Suite

I've created five comprehensive guides for you:

### 1. **AIRTEL_PAYMENT_INTEGRATION.md** (Main Guide)
   - Complete integration walkthrough
   - API basics and payment flow
   - Code examples for each step
   - Webhook configuration
   - Testing procedures
   - Production deployment checklist
   - **Start here if**: You want the full detailed guide

### 2. **AIRTEL_IMPLEMENTATION_CHECKLIST.md** (Action Plan)
   - Step-by-step phases (Preparation → Monitoring)
   - Task checkboxes to track progress
   - Troubleshooting guide
   - Estimated timeline (7-12 days)
   - **Start here if**: You want a clear checklist to follow

### 3. **AIRTEL_UGANDA_SETUP.md** (Uganda-Specific)
   - Correct developer portal for Uganda
   - Uganda-specific API configuration
   - Phone number validation (256XXXXXXXXX format)
   - Currency settings (UGX)
   - Environment variables for Uganda
   - Pre-launch checklist
   - **Start here if**: You're based in Uganda

### 4. **AIRTEL_VS_MTN_GUIDE.md** (Comparison)
   - Side-by-side API comparison
   - Field mapping between providers
   - Shared patterns and differences
   - Testing both providers simultaneously
   - Migration from MTN to Airtel
   - **Start here if**: You already have MTN and want to understand differences

### 5. **AIRTEL_QUICK_START.md** (This file)
   - Quick reference guide
   - 30-minute setup
   - Common commands
   - **Start here if**: You want to jump in immediately

---

## ⚡ 30-Minute Quick Start

### Step 1: Environment Variables (5 minutes)

Update `.env.local` in `shop/` directory:

```env
# Airtel Configuration
AIRTEL_API_KEY=your_airtel_api_key_here
AIRTEL_API_SECRET=your_airtel_secret_here
AIRTEL_MERCHANT_CODE=MRSQOOP
AIRTEL_MERCHANT_NAME=MrSqoopExpress
AIRTEL_WEBHOOK_SECRET=your_webhook_secret_here
AIRTEL_API_ENDPOINT=https://uat.airtel.africa/merchant/v1/
AIRTEL_CALLBACK_URL=http://localhost:3000/api/webhooks/payments/airtel-mtn
```

### Step 2: Create Airtel Payment API (10 minutes)

Create file: `shop/app/api/payments/airtel/initiate/route.js`

```javascript
import { NextResponse } from 'next/server';
import axios from 'axios';

export async function POST(request) {
  try {
    const { orderId, amount, customerPhone } = await request.json();

    if (!orderId || !amount || !customerPhone) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Format phone number
    const cleanPhone = customerPhone.replace(/\D/g, '');
    if (!cleanPhone.startsWith('256') || cleanPhone.length !== 12) {
      return NextResponse.json(
        { error: 'Invalid phone format. Use: 256XXXXXXXXX' },
        { status: 400 }
      );
    }

    const payload = {
      reference: orderId,
      subscriber: {
        email: 'customer@mrsqoopexpress.com', // TODO: Get from order
        msisdn: cleanPhone,
      },
      transaction: {
        amount: Math.round(amount),
        currency: 'UGX',
        id: `${orderId}-${Date.now()}`,
      },
      merchant: {
        code: process.env.AIRTEL_MERCHANT_CODE,
        name: process.env.AIRTEL_MERCHANT_NAME,
      },
      description: `Order ${orderId}`,
    };

    const response = await axios.post(
      `${process.env.AIRTEL_API_ENDPOINT}payments/`,
      payload,
      {
        headers: {
          Authorization: `Bearer ${process.env.AIRTEL_API_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );

    console.log('✅ Airtel payment initiated:', response.data);

    return NextResponse.json({
      success: true,
      transactionId: response.data.id,
      redirectUrl: response.data.checkout_url,
      status: response.data.status,
    });
  } catch (error) {
    console.error('❌ Airtel error:', error.response?.data || error.message);
    return NextResponse.json(
      { error: error.response?.data?.message || 'Payment initiation failed' },
      { status: error.response?.status || 500 }
    );
  }
}
```

### Step 3: Create Payment Button Component (10 minutes)

Create file: `shop/app/components/AirtelPaymentButton.jsx`

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
          amount,
          customerPhone,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Payment failed');
      }

      if (data.redirectUrl) {
        window.location.href = data.redirectUrl;
      } else {
        alert(`Payment initiated! Transaction ID: ${data.transactionId}`);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={initiatePayment}
      disabled={loading}
      className="bg-green-600 text-white px-6 py-2 rounded hover:bg-green-700 disabled:opacity-50"
    >
      {loading ? 'Processing...' : '💳 Pay with Airtel Money'}
    </button>
  );
}
```

### Step 4: Update Webhook Signature Verification (5 minutes)

Edit: `shop/app/api/webhooks/payments/airtel-mtn/route.js`

Find the `verifyAirtelSignature` function and update it:

```javascript
function verifyAirtelSignature(payload, secret) {
  const crypto = require('crypto');

  // Reconstruct signed content (adjust format based on Airtel's docs)
  const signedContent = `${payload.amount}|${payload.currency}|${payload.reference}|${payload.timestamp}`;

  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(signedContent)
    .digest('base64');

  return payload.signature === expectedSignature;
}
```

---

## 🧪 Testing

### Test with cURL

```bash
# Test payment initiation
curl -X POST http://localhost:3000/api/payments/airtel/initiate \
  -H "Content-Type: application/json" \
  -d '{
    "orderId": "TEST-001",
    "amount": 5000,
    "customerPhone": "256701234567"
  }'

# Test webhook
curl -X POST http://localhost:3000/api/webhooks/payments/airtel-mtn \
  -H "Content-Type: application/json" \
  -H "X-Airtel-Signature: test_signature" \
  -d '{
    "id": "txn_test_123",
    "reference": "TEST-001",
    "status": "SUCCESS",
    "amount": 5000,
    "currency": "UGX",
    "timestamp": "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'"
  }'
```

### Test with Ngrok (for webhook testing)

```bash
# Install ngrok (if not already installed)
npm install -g ngrok

# Start ngrok
ngrok http 3000

# Copy the HTTPS URL and update AIRTEL_CALLBACK_URL in .env.local
# Example: https://abc123.ngrok.io/api/webhooks/payments/airtel-mtn
```

---

## 📋 Common Commands

```bash
# Start development server
cd shop
npm run dev

# Build for production
npm run build

# Check environment variables are set
grep AIRTEL .env.local

# View logs (if running in terminal)
tail -f logs/server.log

# Deploy to Vercel
vercel --prod

# Set environment variables in Vercel
vercel env add AIRTEL_API_KEY
vercel env add AIRTEL_API_SECRET
vercel env add AIRTEL_WEBHOOK_SECRET
```

---

## 🔑 Getting Airtel Uganda Credentials

### Step-by-Step Registration

1. **Visit** https://developers.airtel.africa
2. **Sign up** with your business email
3. **Complete KYC** verification (business documents required)
4. **Create API Application** (select Uganda as country)
5. **Generate API Key & Secret**
6. **Copy to `.env.local`**

### Find Your Credentials In

- **API Key**: Developer Portal → My Apps → [Your App] → API Keys
- **API Secret**: Same location
- **Merchant Code**: Developer Portal → My Apps → [Your App] → Merchant Settings
- **Webhook Secret**: Developer Portal → My Apps → [Your App] → Webhooks
- **Access Token**: Generated after OAuth authentication

---

## 🐛 Troubleshooting

### Payment Won't Initiate

```
❌ "Invalid phone number"
✅ Ensure format: 256XXXXXXXXX (12 digits, no spaces)

❌ "Authentication failed"
✅ Check AIRTEL_API_KEY in .env.local

❌ "API endpoint error"
✅ Verify AIRTEL_API_ENDPOINT (sandbox vs production)
```

### Webhook Not Received

```
✅ Check webhook URL is publicly accessible
✅ Test with ngrok: ngrok http 3000
✅ Verify webhook URL in Airtel Dashboard matches callback URL
✅ Check firewall isn't blocking inbound requests
```

### Signature Verification Fails

```
✅ Verify AIRTEL_WEBHOOK_SECRET is correct
✅ Check signature format matches Airtel docs
✅ Enable verbose logging to debug
```

---

## 📊 Integration Checklist

Quick checklist to track your progress:

```
Development:
□ Register Airtel Merchant Account
□ Get API credentials
□ Update .env.local with credentials
□ Create payment initiation API
□ Create payment button component
□ Implement webhook signature verification
□ Test payment flow

Testing:
□ Test payment initiation with small amount
□ Test webhook with cURL
□ Test signature verification
□ Test order status update
□ Test email notifications

Production:
□ Update .env.prod with production credentials
□ Update AIRTEL_API_ENDPOINT to production URL
□ Deploy to staging first
□ Deploy to production
□ Monitor for errors
```

---

## 🚀 Next Steps

1. **Read AIRTEL_PAYMENT_INTEGRATION.md** - Full guide with all details
2. **Follow AIRTEL_IMPLEMENTATION_CHECKLIST.md** - Step-by-step tasks
3. **Refer to AIRTEL_VS_MTN_GUIDE.md** - When you need provider comparison

---

## 📞 Support

- **Airtel Documentation**: https://developer.airtel.africa/docs
- **Merchant Portal**: https://merchant.airtel.africa
- **Support Email**: developer-support@airtel.africa

---

## 💡 Pro Tips

1. **Start in sandbox** - Always test in sandbox first
2. **Use ngrok** - Test webhooks locally before deploying
3. **Monitor logs** - Watch console logs during testing
4. **Small amounts** - Test with small amounts first (50-500 UGX)
5. **Idempotent endpoints** - Make sure duplicate webhooks are handled
6. **Rate limiting** - Implement to prevent abuse
7. **Retry logic** - Add exponential backoff for failed webhooks

---

**Ready to start?**

1. ✅ Set up `.env.local` with Airtel credentials
2. ✅ Create the payment API route
3. ✅ Create the payment button component
4. ✅ Test with cURL
5. ✅ Integrate into checkout page

See **AIRTEL_PAYMENT_INTEGRATION.md** for detailed implementation! 🎉

---

**Last Updated:** 2024-07-27  
**Status:** Ready to implement
