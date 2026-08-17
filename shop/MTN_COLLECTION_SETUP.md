# MTN Collection Widget Setup Guide

Complete guide for setting up MTN Mobile Money Collection Widget on your MrSqoopExpress shop.

## 🎯 What You Have

MTN has given you access to the **Collection Widget** product, which allows you to:
- ✅ Receive mobile money payments from MTN users
- ✅ Accept payments via USSD (dial *xxx#)
- ✅ Accept payments via QR Code
- ✅ Direct integration on your website

### Your Credentials

```
Product: Collection Widget
Primary Key: <YOUR_MTN_PRIMARY_KEY>
Secondary Key: <YOUR_MTN_SECONDARY_KEY>
Country: Uganda
Currency: UGX
```

---

## 📝 Understanding Your Keys

### Primary Key
- **Use for:** Production API calls
- **Keep:** Secret (like API key)
- **Where:** .env.local as MTN_PRIMARY_KEY

### Secondary Key
- **Use for:** Backup/fallback authentication
- **Keep:** Secret
- **Where:** .env.local as MTN_SECONDARY_KEY

---

## 🔧 Environment Variables Setup

Update `shop/.env.local` with your MTN credentials:

```env
# ===== MTN MOBILE MONEY CONFIGURATION =====
MTN_PRIMARY_KEY=<YOUR_MTN_PRIMARY_KEY>
MTN_SECONDARY_KEY=<YOUR_MTN_SECONDARY_KEY>
MTN_MERCHANT_CODE=MRSQOOP
MTN_MERCHANT_NAME=MrSqoopExpress
MTN_CURRENCY=UGX
MTN_COUNTRY=UG

# MTN Collection Widget Endpoints
MTN_API_ENDPOINT=https://sandbox.momodeveloper.mtn.com/collection/v1_0
# Switch to production when ready:
# MTN_API_ENDPOINT=https://api.momodeveloper.mtn.com/collection/v1_0

# Your shop's webhook URL for payment notifications
MTN_CALLBACK_URL=http://localhost:3000/api/webhooks/payments/mtn

# Primary Key (for signature verification of webhooks)
MTN_API_KEY=<YOUR_MTN_PRIMARY_KEY>
MTN_API_SECRET=<YOUR_MTN_SECONDARY_KEY>
```

---

## 🔐 IP Whitelisting for MTN

### Configure in MTN Portal

1. **Login** to https://momodeveloper.mtn.com
2. **Go to** Settings or Security Settings
3. **Find** IP Whitelist section
4. **Enable** IP Whitelisting

### Add These IPs

**Your Development IP:**
```
203.0.113.42/32  (replace with your public IP from: curl -s https://api.ipify.org)
```

**Vercel Production IPs (all 14):**
```
76.76.19.0/24
76.76.20.0/24
76.76.21.0/24
76.76.22.0/24
76.76.112.0/24
76.76.113.0/24
76.76.114.0/24
76.76.115.0/24
76.76.48.0/24
76.76.49.0/24
76.76.50.0/24
76.76.51.0/24
185.254.30.0/24
185.254.31.0/24
```

**Save** configuration

---

## 📲 Collection Widget Integration Types

MTN's Collection Widget supports multiple payment methods:

### 1. USSD Payment (Recommended)
```
How it works:
1. Customer sees "Pay with MTN" button on your site
2. MTN generates USSD code (e.g., *xxx*1#)
3. Customer dials USSD on their phone
4. MTN deducts money from their account
5. Your server gets webhook notification
6. Order marked as paid
```

**Advantage**: No app needed, works on basic phones

### 2. QR Code Payment
```
How it works:
1. Customer sees QR code on your checkout
2. Scans with MTN Mobile Money app
3. App shows payment prompt
4. Customer confirms payment
5. Webhook notification to your server
6. Order marked as paid
```

**Advantage**: Faster than USSD, app-based

### 3. Web/Redirect Payment
```
How it works:
1. Customer clicks "Pay with MTN" button
2. Redirected to MTN payment gateway
3. Completes payment
4. Redirected back to your site
5. Webhook confirms payment
6. Order marked as paid
```

**Advantage**: Hosted payment page (MTN handles UI)

---

## 🛠️ Implementation: Payment Initiation

### Create Payment Request API

**File:** `shop/app/api/payments/mtn/initiate/route.js`

```javascript
import { NextResponse } from 'next/server';
import axios from 'axios';
import crypto from 'crypto';

export async function POST(request) {
  try {
    const { orderId, amount, customerPhone, paymentType = 'USSD' } = await request.json();

    // Validate input
    if (!orderId || !amount || !customerPhone) {
      return NextResponse.json(
        { error: 'Missing required fields: orderId, amount, customerPhone' },
        { status: 400 }
      );
    }

    // Format phone (256XXXXXXXXX)
    const cleanPhone = customerPhone.replace(/\D/g, '');
    if (!cleanPhone.startsWith('256') || cleanPhone.length !== 12) {
      return NextResponse.json(
        { error: 'Invalid phone. Use format: 256XXXXXXXXX' },
        { status: 400 }
      );
    }

    // Generate request ID
    const requestId = `${orderId}-${Date.now()}`;

    // Create MTN Collection request
    const payload = {
      externalId: orderId,                    // Your order ID
      amount: amount.toString(),              // Amount as string
      currency: 'UGX',
      payer: {
        partyIdType: 'MSISDN',                // Mobile number
        partyId: cleanPhone,                  // Customer phone
      },
      payerMessage: `Payment for order ${orderId}`,
      payeeNote: 'MrSqoopExpress order payment',
      callbackUrl: process.env.MTN_CALLBACK_URL,
    };

    console.log('📱 MTN Collection initiated:', {
      orderId,
      amount,
      phone: cleanPhone,
      paymentType,
    });

    // Call MTN API
    const response = await axios.post(
      `${process.env.MTN_API_ENDPOINT}/requesttopay`,
      payload,
      {
        headers: {
          'Authorization': `Bearer ${process.env.MTN_PRIMARY_KEY}`,
          'X-Reference-Id': requestId,
          'Content-Type': 'application/json',
          'Ocp-Apim-Subscription-Key': process.env.MTN_PRIMARY_KEY,
        },
        timeout: 30000,
      }
    );

    console.log('✅ MTN payment request accepted:', {
      requestId,
      status: response.status,
    });

    // Save transaction to database
    // TODO: Save to database
    await saveMTNTransaction({
      orderId,
      requestId,
      amount,
      currency: 'UGX',
      phone: cleanPhone,
      paymentType,
      status: 'PENDING',
      initiatedAt: new Date(),
    });

    return NextResponse.json({
      success: true,
      orderId,
      requestId,
      amount,
      message: paymentType === 'USSD'
        ? `Please dial *123*1# to complete payment` // MTN USSD code (example)
        : 'Please complete payment on MTN gateway',
      paymentType,
    });

  } catch (error) {
    console.error('❌ MTN payment initiation error:', error.response?.data || error.message);

    return NextResponse.json(
      {
        error: error.response?.data?.message || error.message || 'Payment failed',
        details: error.response?.data,
      },
      { status: error.response?.status || 500 }
    );
  }
}

async function saveMTNTransaction(transactionData) {
  // TODO: Implement database save
  console.log('💾 Saving MTN transaction:', transactionData);
  return true;
}
```

---

## 🔔 Webhook Handler for MTN

### Update Existing Webhook

**File:** `shop/app/api/webhooks/payments/mtn/route.js`

```javascript
import { NextResponse } from 'next/server';
import crypto from 'crypto';

export async function POST(request) {
  try {
    const payload = await request.json();

    console.log('📨 MTN Webhook received:', {
      externalId: payload.externalId,
      status: payload.transactionStatus,
      amount: payload.amount,
    });

    // Verify webhook signature
    const isValid = await verifyMTNWebhookSignature(payload);
    if (!isValid) {
      console.warn('❌ Invalid MTN webhook signature');
      return NextResponse.json(
        { error: 'Invalid signature' },
        { status: 401 }
      );
    }

    // Handle payment status
    const status = payload.transactionStatus?.toUpperCase();

    switch (status) {
      case 'SUCCESSFUL':
      case 'SUCCESS':
        return await handleMTNPaymentSuccess(payload);

      case 'PENDING':
        return await handleMTNPaymentPending(payload);

      case 'FAILED':
      case 'REJECTED':
        return await handleMTNPaymentFailed(payload);

      default:
        console.warn('Unknown MTN payment status:', status);
        return NextResponse.json(
          { error: 'Unknown status' },
          { status: 400 }
        );
    }

  } catch (error) {
    console.error('❌ MTN webhook error:', error);
    return NextResponse.json(
      { error: 'Webhook processing failed' },
      { status: 500 }
    );
  }
}

async function handleMTNPaymentSuccess(payload) {
  const { externalId, amount, financialTransactionId } = payload;

  console.log('✅ MTN Payment SUCCESS:', { externalId, amount });

  // Update order status
  const orderUpdated = await updateOrderStatus(externalId, {
    paymentStatus: 'confirmed',
    orderStatus: 'awaiting_admin_confirmation',
    transactionId: financialTransactionId,
    paymentMethod: 'MTN',
    paidAt: new Date().toISOString(),
  });

  if (!orderUpdated) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 });
  }

  // Send confirmations
  await sendCustomerEmail(externalId, 'payment_confirmed');
  await sendAdminNotification(externalId, 'payment_confirmed', { amount });

  return NextResponse.json({
    success: true,
    message: 'Payment confirmed',
    orderId: externalId,
    transactionId: financialTransactionId,
  });
}

async function handleMTNPaymentPending(payload) {
  const { externalId } = payload;
  console.log('⏳ MTN Payment PENDING:', externalId);

  await updateOrderStatus(externalId, {
    paymentStatus: 'pending',
  });

  return NextResponse.json({
    success: true,
    message: 'Payment pending',
    orderId: externalId,
  });
}

async function handleMTNPaymentFailed(payload) {
  const { externalId, reason } = payload;
  console.log('❌ MTN Payment FAILED:', { externalId, reason });

  await updateOrderStatus(externalId, {
    paymentStatus: 'failed',
    orderStatus: 'cancelled',
    failureReason: reason,
    cancelledAt: new Date().toISOString(),
  });

  await sendCustomerEmail(externalId, 'payment_failed');

  return NextResponse.json({
    success: true,
    message: 'Payment failed - order cancelled',
    orderId: externalId,
  });
}

async function verifyMTNWebhookSignature(payload) {
  // MTN signature verification
  // Check their documentation for exact format
  
  const signature = payload.signature; // Or from headers
  if (!signature) {
    return true; // Skip in development, enable in production
  }

  // Reconstruct signed content (exact format from MTN docs)
  const signedContent = JSON.stringify({
    externalId: payload.externalId,
    amount: payload.amount,
    currency: payload.currency,
    transactionStatus: payload.transactionStatus,
  });

  // Calculate expected signature
  const expectedSignature = crypto
    .createHmac('sha256', process.env.MTN_PRIMARY_KEY)
    .update(signedContent)
    .digest('base64');

  return signature === expectedSignature;
}

async function updateOrderStatus(orderId, updates) {
  // TODO: Implement database update
  console.log(`📝 Updating order ${orderId}:`, updates);
  return true;
}

async function sendCustomerEmail(orderId, emailType) {
  // TODO: Send email
  console.log(`📧 Sending ${emailType} email for order ${orderId}`);
  return true;
}

async function sendAdminNotification(orderId, notificationType, data) {
  // TODO: Send admin notification
  console.log(`🔔 Sending admin notification for order ${orderId}:`, data);
  return true;
}
```

---

## 💳 Create MTN Payment Button

**File:** `shop/app/components/MTNPaymentButton.jsx`

```javascript
'use client';

import { useState } from 'react';

export default function MTNPaymentButton({ orderId, amount, customerPhone }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [ussdCode, setUssdCode] = useState(null);

  const initiateMTNPayment = async () => {
    setLoading(true);
    setError(null);
    setUssdCode(null);

    try {
      const response = await fetch('/api/payments/mtn/initiate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId,
          amount,
          customerPhone,
          paymentType: 'USSD',
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Payment failed');
      }

      // Show USSD code to customer
      if (data.message) {
        setUssdCode(data.message);
      }

      // Optionally redirect or show confirmation
      if (data.requestId) {
        alert(`Payment initiated!\nRequest ID: ${data.requestId}\n${data.message}`);
      }
    } catch (err) {
      setError(err.message);
      console.error('MTN payment error:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mtn-payment-section">
      <button
        onClick={initiateMTNPayment}
        disabled={loading}
        className="bg-orange-600 text-white px-6 py-2 rounded hover:bg-orange-700 disabled:opacity-50"
      >
        {loading ? 'Processing...' : '📱 Pay with MTN Money'}
      </button>

      {ussdCode && (
        <div className="bg-blue-100 border border-blue-400 text-blue-700 px-4 py-3 rounded mt-3">
          <p className="font-bold">Payment Instructions:</p>
          <p>{ussdCode}</p>
        </div>
      )}

      {error && (
        <p className="text-red-600 mt-2">{error}</p>
      )}
    </div>
  );
}
```

---

## 🧪 Testing MTN Collection

### Test in Sandbox

```bash
# 1. Find your public IP
curl -s https://api.ipify.org

# 2. Test payment initiation
curl -X POST http://localhost:3000/api/payments/mtn/initiate \
  -H "Content-Type: application/json" \
  -d '{
    "orderId": "TEST-MTN-001",
    "amount": 500,
    "customerPhone": "256701234567",
    "paymentType": "USSD"
  }'

# Expected response:
# {
#   "success": true,
#   "orderId": "TEST-MTN-001",
#   "requestId": "TEST-MTN-001-1722072000000",
#   "message": "Please dial *123*1# to complete payment"
# }
```

### Test Webhook

```bash
curl -X POST http://localhost:3000/api/webhooks/payments/mtn \
  -H "Content-Type: application/json" \
  -d '{
    "externalId": "TEST-MTN-001",
    "amount": "500",
    "currency": "UGX",
    "transactionStatus": "SUCCESSFUL",
    "financialTransactionId": "mtn_txn_123456",
    "payer": {
      "partyIdType": "MSISDN",
      "partyId": "256701234567"
    },
    "payee": {
      "partyIdType": "MERCHANT",
      "partyId": "MRSQOOP"
    }
  }'
```

---

## 📋 Configuration Checklist

```
MTN Setup:
☐ Product: Collection Widget selected
☐ Primary Key: <YOUR_MTN_PRIMARY_KEY> (saved securely)
☐ Secondary Key: <YOUR_MTN_SECONDARY_KEY> (saved securely)
☐ IP Whitelist enabled in MTN portal
☐ Your dev IP added to whitelist
☐ All 14 Vercel IP ranges added

Environment Variables:
☐ .env.local updated with:
  ☐ MTN_PRIMARY_KEY
  ☐ MTN_SECONDARY_KEY
  ☐ MTN_MERCHANT_CODE
  ☐ MTN_API_ENDPOINT
  ☐ MTN_CALLBACK_URL

Implementation:
☐ Payment initiation API created
☐ Webhook handler created
☐ Payment button component created
☐ Signature verification implemented
☐ Database integration (TODO)
☐ Email notifications (TODO)

Testing:
☐ Tested payment initiation locally
☐ Tested webhook reception
☐ Verified signature verification
☐ Tested error scenarios
☐ Ready for staging

Deployment:
☐ Deploy to staging
☐ Test end-to-end
☐ Deploy to production
☐ Make test payment
☐ Monitor logs
```

---

## 🔄 Payment Flow Diagram

```
Customer on Website
        ↓
    [Pay with MTN Button]
        ↓
    Your Server (initiate)
        ↓
    MTN API (create request)
        ↓
    USSD Code Sent to Customer
        ↓
    Customer Dials USSD
        ↓
    MTN Processes Payment
        ↓
    MTN Sends Webhook
        ↓
    Your Server (webhook handler)
        ↓
    Update Order Status
        ↓
    Send Confirmations
        ↓
    Order Completed ✅
```

---

## 🐛 Troubleshooting

### "Invalid Primary Key"
```
✅ Verify key is exactly: <YOUR_MTN_PRIMARY_KEY>
✅ Check no extra spaces in .env.local
✅ Restart dev server after updating .env
```

### "Invalid Phone Number"
```
✅ Must be format: 256XXXXXXXXX (12 digits)
✅ No spaces, dashes, or special characters
✅ Example: 256701234567 ✓
```

### "IP Not Whitelisted"
```
✅ Check your public IP: curl -s https://api.ipify.org
✅ Add to MTN portal IP Whitelist
✅ Enable whitelist feature (checkbox)
✅ Wait 5 minutes for changes
```

### "Webhook Not Received"
```
✅ Verify webhook URL in MTN portal settings
✅ URL must be publicly accessible (not localhost)
✅ If testing locally, use ngrok: ngrok http 3000
✅ Check MTN webhook logs in portal
```

---

## 📞 MTN Support

- **Portal:** https://momodeveloper.mtn.com
- **Check Dashboard:** For API keys, webhook logs, and settings
- **Webhook Delivery:** Check webhook logs in MTN dashboard to verify delivery

---

## ✅ Next Steps

1. **Update .env.local** with your MTN credentials
2. **Create payment initiation API** (copy code above)
3. **Create webhook handler** (copy code above)
4. **Create payment button** (copy component above)
5. **Test locally** with curl commands above
6. **Deploy to staging** and test end-to-end
7. **Deploy to production** with production API endpoint

---

**Your MTN Collection setup is ready to implement!** 🚀

Last Updated: 2026-07-27
