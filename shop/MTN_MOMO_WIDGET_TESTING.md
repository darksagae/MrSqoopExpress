# MTN MoMo Widget - Testing Guide

Complete guide for testing MTN MoMo Widget (Checkout) payments locally and in sandbox.

---

## 🧪 Testing Environments

### Sandbox (Testing)
```
Environment: https://sandbox.momodeveloper.mtn.com
Status: For development & testing
Cost: FREE
Real money: NO (test only)
```

### Production (Live)
```
Environment: https://api.momodeveloper.mtn.com
Status: For real customers
Cost: Actual charges
Real money: YES (real customers)
```

**For now:** Use Sandbox only!

---

## 📋 Pre-Testing Checklist

Before you test, make sure you have:

```
☐ MTN credentials (from MTN portal):
  ☐ Primary Key
  ☐ Secondary Key
  ☐ Merchant Code
  
☐ Environment configured:
  ☐ .env.local updated with credentials
  ☐ Callback URL configured (for sandbox: localhost)
  ☐ IP Whitelist configured (add your dev IP)

☐ Code implemented:
  ☐ Payment initiation API created
  ☐ Webhook handler created
  ☐ Payment button component created

☐ Dev server running:
  ☐ npm run dev (from shop/ directory)
```

---

## 🚀 Testing Steps

### Step 1: Check Your Dev Server is Running

```bash
cd shop
npm run dev

# You should see:
# ▲ Next.js 16.2.11
# - Local: http://localhost:3000
```

### Step 2: Find Your Public IP

```bash
curl -s https://api.ipify.org

# Save this for later: e.g., 203.0.113.42
```

### Step 3: Verify IP Whitelist

**In MTN Portal:**
1. Go to: Settings → IP Whitelist
2. Check: Your dev IP is in the list (e.g., 203.0.113.42/32)
3. Verify: IP Whitelist is ENABLED (checkbox)

### Step 4: Test Payment Initiation

**Option A: Using Your Website**

1. Go to: `http://localhost:3000`
2. Find: "Pay with MTN Money" button
3. Click it
4. Enter test data:
   - Order ID: TEST-001
   - Amount: 500 (UGX)
   - Phone: 256701234567

**Option B: Using cURL (Command Line)**

```bash
curl -X POST http://localhost:3000/api/payments/mtn/initiate \
  -H "Content-Type: application/json" \
  -d '{
    "orderId": "TEST-001",
    "amount": 500,
    "customerPhone": "256701234567"
  }'

# Expected response:
# {
#   "success": true,
#   "orderId": "TEST-001",
#   "requestId": "TEST-001-1722072000000",
#   "message": "Payment initiated successfully"
# }
```

### Step 5: Check Payment Status

```bash
# Check if order was created in your system
curl http://localhost:3000/api/orders/TEST-001 \
  -H "Content-Type: application/json"

# Should show order status
```

### Step 6: Test Webhook Reception (Simulate MTN Notification)

```bash
# Simulate MTN sending a successful payment notification
curl -X POST http://localhost:3000/api/webhooks/payments/mtn \
  -H "Content-Type: application/json" \
  -d '{
    "externalId": "TEST-001",
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

# Expected response:
# {
#   "success": true,
#   "message": "Payment confirmed",
#   "orderId": "TEST-001"
# }

# Check order status - should now be "paid"
```

---

## 🎯 Testing Scenarios

### Scenario 1: Successful Payment

**Steps:**
1. Initiate payment with valid data
2. Verify request ID returned
3. Simulate successful webhook
4. Verify order status = "paid"
5. Check customer email sent
6. Check admin notification sent

**Commands:**
```bash
# 1. Initiate
curl -X POST http://localhost:3000/api/payments/mtn/initiate \
  -H "Content-Type: application/json" \
  -d '{
    "orderId": "TEST-SUCCESS-001",
    "amount": 1000,
    "customerPhone": "256701234567"
  }'

# 2. Simulate successful payment
curl -X POST http://localhost:3000/api/webhooks/payments/mtn \
  -H "Content-Type: application/json" \
  -d '{
    "externalId": "TEST-SUCCESS-001",
    "amount": "1000",
    "currency": "UGX",
    "transactionStatus": "SUCCESSFUL",
    "financialTransactionId": "mtn_success_123"
  }'

# 3. Check order
curl http://localhost:3000/api/orders/TEST-SUCCESS-001
# Should show: paymentStatus: "confirmed"
```

**Expected Result:** ✅ Order marked as paid

---

### Scenario 2: Failed Payment

**Steps:**
1. Initiate payment
2. Simulate failed webhook
3. Verify order marked as failed
4. Check customer notified

**Commands:**
```bash
# 1. Initiate
curl -X POST http://localhost:3000/api/payments/mtn/initiate \
  -H "Content-Type: application/json" \
  -d '{
    "orderId": "TEST-FAILED-001",
    "amount": 500,
    "customerPhone": "256701234567"
  }'

# 2. Simulate failed payment
curl -X POST http://localhost:3000/api/webhooks/payments/mtn \
  -H "Content-Type: application/json" \
  -d '{
    "externalId": "TEST-FAILED-001",
    "amount": "500",
    "currency": "UGX",
    "transactionStatus": "FAILED",
    "reason": "Insufficient funds"
  }'

# 3. Check order
curl http://localhost:3000/api/orders/TEST-FAILED-001
# Should show: paymentStatus: "failed", orderStatus: "cancelled"
```

**Expected Result:** ✅ Order cancelled, customer notified

---

### Scenario 3: Pending Payment

**Steps:**
1. Initiate payment
2. Simulate pending webhook
3. Verify order status = pending

**Commands:**
```bash
# 1. Initiate
curl -X POST http://localhost:3000/api/payments/mtn/initiate \
  -H "Content-Type: application/json" \
  -d '{
    "orderId": "TEST-PENDING-001",
    "amount": 500,
    "customerPhone": "256701234567"
  }'

# 2. Simulate pending payment
curl -X POST http://localhost:3000/api/webhooks/payments/mtn \
  -H "Content-Type: application/json" \
  -d '{
    "externalId": "TEST-PENDING-001",
    "amount": "500",
    "currency": "UGX",
    "transactionStatus": "PENDING"
  }'

# 3. Check order
curl http://localhost:3000/api/orders/TEST-PENDING-001
# Should show: paymentStatus: "pending"
```

**Expected Result:** ✅ Order waiting for confirmation

---

### Scenario 4: Invalid Phone Number

**Steps:**
1. Try to initiate with bad phone
2. Verify error returned

**Commands:**
```bash
# Try with invalid phone
curl -X POST http://localhost:3000/api/payments/mtn/initiate \
  -H "Content-Type: application/json" \
  -d '{
    "orderId": "TEST-INVALID-PHONE",
    "amount": 500,
    "customerPhone": "12345"
  }'

# Expected response:
# {
#   "error": "Invalid phone. Use format: 256XXXXXXXXX"
# }
```

**Expected Result:** ✅ Error message returned

---

### Scenario 5: Invalid Amount

**Steps:**
1. Try with invalid amount
2. Verify error

**Commands:**
```bash
# Try with negative amount
curl -X POST http://localhost:3000/api/payments/mtn/initiate \
  -H "Content-Type: application/json" \
  -d '{
    "orderId": "TEST-INVALID-AMOUNT",
    "amount": -500,
    "customerPhone": "256701234567"
  }'

# Try with missing amount
curl -X POST http://localhost:3000/api/payments/mtn/initiate \
  -H "Content-Type: application/json" \
  -d '{
    "orderId": "TEST-NO-AMOUNT",
    "customerPhone": "256701234567"
  }'

# Expected response:
# {
#   "error": "Missing required fields: orderId, amount, customerPhone"
# }
```

**Expected Result:** ✅ Validation error returned

---

## 🔍 Monitoring During Tests

### View Console Logs

In the terminal where you ran `npm run dev`, you should see logs:

```
📱 MTN Collection initiated: {
  orderId: 'TEST-001',
  amount: 500,
  phone: '256701234567'
}

✅ MTN payment request accepted: {
  requestId: 'TEST-001-1722072000000',
  status: 200
}

📨 MTN Webhook received: {
  externalId: 'TEST-001',
  status: 'SUCCESSFUL',
  amount: '500'
}

✅ MTN Payment SUCCESS: { externalId: 'TEST-001', amount: 500 }

📝 Updating order TEST-001: {
  paymentStatus: 'confirmed',
  orderStatus: 'awaiting_admin_confirmation'
}

📧 Sending payment_confirmed email for order TEST-001
🔔 Sending admin notification for order TEST-001
```

### Check Database

If you have database integration, verify:
- Order created with correct amount
- Payment method = "MTN"
- Status updates correctly
- Timestamps recorded

---

## 🌐 Testing with ngrok (For Real Webhook Testing)

If you want to test webhooks from MTN (not just simulated):

### Step 1: Install ngrok

```bash
npm install -g ngrok
```

### Step 2: Start ngrok

```bash
# In new terminal
ngrok http 3000

# Output will show:
# Forwarding: https://abc123.ngrok.io -> http://localhost:3000
```

### Step 3: Update Callback URL in MTN Portal

1. Go to MTN Dashboard
2. Settings → API Settings
3. Update Callback URL:
   ```
   https://abc123.ngrok.io/api/webhooks/payments/mtn
   ```

### Step 4: Test Payment Flow

1. Click "Pay with MTN" button
2. Get redirected to MTN checkout (in sandbox)
3. Complete test payment
4. MTN sends webhook to your ngrok URL
5. Check console logs for webhook receipt

---

## 📊 Testing Checklist

```
Basic Tests:
☐ Payment initiation works (returns request ID)
☐ Valid order created
☐ Invalid phone rejected
☐ Invalid amount rejected
☐ Missing fields rejected

Webhook Tests:
☐ Success webhook processed correctly
☐ Failed webhook handled properly
☐ Pending webhook recorded
☐ Order status updated correctly
☐ Customer email sent
☐ Admin notification sent

Error Handling:
☐ Network timeout handled
☐ API error handled
☐ Invalid webhook signature rejected
☐ Duplicate payment handled
☐ Malformed JSON rejected

Security:
☐ IP whitelist working (blocks unauthorized IPs)
☐ Signature verification working
☐ Credentials not logged
☐ No sensitive data in logs

Edge Cases:
☐ Same order ID twice (idempotency)
☐ Very large amount
☐ Very small amount
☐ Empty phone number
☐ Webhook arrives before order created
```

---

## 🐛 Debugging Tips

### If Payment Initiation Fails

**Check:**
1. Dev server running? (`npm run dev`)
2. Credentials correct? (Check .env.local)
3. IP whitelisted? (Check MTN portal)
4. Network reachable? (`curl -I https://sandbox.momodeveloper.mtn.com`)
5. API endpoint correct? (Should be sandbox URL)

**Fix:**
```bash
# Verify environment variables
grep MTN .env.local

# Verify dev server
curl http://localhost:3000

# Check logs in terminal
# Look for error messages
```

### If Webhook Not Received

**Check:**
1. Webhook handler exists? (`app/api/webhooks/payments/mtn/route.js`)
2. Route correct? (`/api/webhooks/payments/mtn`)
3. Using ngrok? (Need for MTN to reach you)
4. Callback URL updated in MTN? (To ngrok URL)
5. ngrok still running? (Check terminal)

**Fix:**
```bash
# Start ngrok if not running
ngrok http 3000

# Verify URL in MTN portal
# Update to ngrok URL

# Check webhook logs in MTN dashboard
```

### If Signature Verification Fails

**Check:**
1. Webhook Secret correct? (From MTN portal)
2. Signature algorithm correct? (Should be HMAC-SHA256)
3. Content format correct? (Exact format as MTN specifies)
4. Timing issue? (Old timestamps might fail)

**Fix:**
```bash
# Temporarily disable signature verification
// In webhook handler:
// const isValid = true; // Skip verification for debugging

# Enable debug logging
console.log('Provided signature:', signature);
console.log('Expected signature:', expectedSignature);
console.log('Content signed:', signedContent);

# Re-enable after debugging
```

---

## ✅ Successful Test Result

When everything works, you'll see:

```
Payment Flow:
1. Click "Pay with MTN" ✅
2. Redirected to MTN checkout ✅
3. Enter test details ✅
4. Confirm payment ✅
5. Returned to your site ✅
6. Order marked as paid ✅
7. Confirmation email sent ✅
8. Admin notified ✅

Console shows:
✅ Payment initiated
✅ Order created
✅ Webhook received
✅ Signature verified
✅ Order updated
✅ Emails sent

Database shows:
✅ Order with status "paid"
✅ Transaction ID recorded
✅ Payment method "MTN"
✅ Correct amount
✅ Correct timestamps
```

---

## 📞 Test Phone Numbers & Credentials

For MTN Sandbox:

```
Test Phone: 256701234567
Test PIN: 0000 (usually)
Test Amount: Any amount (won't charge)
Test Names: Any name

Environment: https://sandbox.momodeveloper.mtn.com
Status: For testing only
Money: Simulated (no real charges)
```

---

## 🚀 Testing Timeline

```
Day 1: Basic Setup
☐ Verify env variables
☐ Test payment initiation
☐ Check order creation
☐ Test error scenarios

Day 2: Webhook Testing
☐ Test webhook reception (simulated)
☐ Test payment success flow
☐ Test payment failure flow
☐ Verify status updates

Day 3: Integration Testing
☐ Test with ngrok (real webhooks)
☐ Test end-to-end flow
☐ Verify emails sent
☐ Check database

Day 4: Security Testing
☐ Test IP whitelist
☐ Test signature verification
☐ Test error handling
☐ Verify no sensitive data logged

Day 5: Ready for Staging
☐ All tests passing
☐ Code cleaned up
☐ Logs reviewed
☐ Ready to deploy
```

---

## 📊 Sample cURL Commands Reference

```bash
# Test 1: Initiate Payment
curl -X POST http://localhost:3000/api/payments/mtn/initiate \
  -H "Content-Type: application/json" \
  -d '{
    "orderId": "TEST-001",
    "amount": 500,
    "customerPhone": "256701234567"
  }'

# Test 2: Webhook Success
curl -X POST http://localhost:3000/api/webhooks/payments/mtn \
  -H "Content-Type: application/json" \
  -d '{
    "externalId": "TEST-001",
    "amount": "500",
    "currency": "UGX",
    "transactionStatus": "SUCCESSFUL",
    "financialTransactionId": "mtn_test_123"
  }'

# Test 3: Webhook Failed
curl -X POST http://localhost:3000/api/webhooks/payments/mtn \
  -H "Content-Type: application/json" \
  -d '{
    "externalId": "TEST-001",
    "amount": "500",
    "currency": "UGX",
    "transactionStatus": "FAILED",
    "reason": "Insufficient funds"
  }'

# Test 4: Check Order Status
curl http://localhost:3000/api/orders/TEST-001

# Test 5: Invalid Phone
curl -X POST http://localhost:3000/api/payments/mtn/initiate \
  -H "Content-Type: application/json" \
  -d '{
    "orderId": "TEST-INVALID",
    "amount": 500,
    "customerPhone": "invalid"
  }'
```

---

## 🎯 Quick Test Script

Save this as `test-mtn.sh`:

```bash
#!/bin/bash

echo "🧪 Testing MTN MoMo Widget Integration"
echo ""

# Test 1: Payment Initiation
echo "1️⃣ Testing payment initiation..."
curl -X POST http://localhost:3000/api/payments/mtn/initiate \
  -H "Content-Type: application/json" \
  -d '{
    "orderId": "TEST-'$(date +%s)'",
    "amount": 500,
    "customerPhone": "256701234567"
  }'
echo ""

# Test 2: Webhook
echo "2️⃣ Testing webhook reception..."
curl -X POST http://localhost:3000/api/webhooks/payments/mtn \
  -H "Content-Type: application/json" \
  -d '{
    "externalId": "TEST-001",
    "amount": "500",
    "currency": "UGX",
    "transactionStatus": "SUCCESSFUL",
    "financialTransactionId": "mtn_test_123"
  }'
echo ""

echo "✅ Basic tests completed!"
```

---

**Ready to test!** Follow the steps above and let me know how it goes! 🚀

Last Updated: 2026-07-27
