# MTN Testing - Quick Start (Copy-Paste Commands)

Use these commands to test MTN MoMo Widget right now!

---

## 🚀 Quick 5-Minute Test

### Terminal 1: Start Your Dev Server

```bash
cd shop
npm run dev

# Wait for:
# ▲ Next.js 16.2.11
# - Local: http://localhost:3000
```

Keep this terminal open.

---

### Terminal 2: Run Tests

In a new terminal, copy-paste these commands one by one:

#### Test 1: Verify Dev Server Works

```bash
curl http://localhost:3000

# Should return HTML (website loads)
```

#### Test 2: Test Payment Initiation

```bash
curl -X POST http://localhost:3000/api/payments/mtn/initiate \
  -H "Content-Type: application/json" \
  -d '{
    "orderId": "TEST-QUICK-001",
    "amount": 500,
    "customerPhone": "256701234567"
  }'

# Should return:
# {
#   "success": true,
#   "orderId": "TEST-QUICK-001",
#   "requestId": "TEST-QUICK-001-1234567890000"
# }
```

#### Test 3: Test Successful Payment Webhook

```bash
curl -X POST http://localhost:3000/api/webhooks/payments/mtn \
  -H "Content-Type: application/json" \
  -d '{
    "externalId": "TEST-QUICK-001",
    "amount": "500",
    "currency": "UGX",
    "transactionStatus": "SUCCESSFUL",
    "financialTransactionId": "mtn_test_success_123"
  }'

# Should return:
# {
#   "success": true,
#   "message": "Payment confirmed",
#   "orderId": "TEST-QUICK-001"
# }
```

#### Test 4: Test Failed Payment Webhook

```bash
curl -X POST http://localhost:3000/api/webhooks/payments/mtn \
  -H "Content-Type: application/json" \
  -d '{
    "externalId": "TEST-QUICK-002",
    "amount": "500",
    "currency": "UGX",
    "transactionStatus": "FAILED",
    "reason": "Insufficient funds"
  }'

# Should return:
# {
#   "success": true,
#   "message": "Payment failed - order cancelled",
#   "orderId": "TEST-QUICK-002"
# }
```

#### Test 5: Test Invalid Phone Number

```bash
curl -X POST http://localhost:3000/api/payments/mtn/initiate \
  -H "Content-Type: application/json" \
  -d '{
    "orderId": "TEST-INVALID-PHONE",
    "amount": 500,
    "customerPhone": "invalid"
  }'

# Should return ERROR:
# {
#   "error": "Invalid phone. Use format: 256XXXXXXXXX"
# }
```

---

## ✅ What You Should See

### In Terminal 1 (Dev Server)

```
📱 MTN Collection initiated: {
  orderId: 'TEST-QUICK-001',
  amount: 500,
  phone: '256701234567'
}

✅ MTN payment request accepted

📨 MTN Webhook received: {
  externalId: 'TEST-QUICK-001',
  status: 'SUCCESSFUL'
}

✅ MTN Payment SUCCESS: { externalId: 'TEST-QUICK-001', amount: 500 }

📝 Updating order TEST-QUICK-001: {
  paymentStatus: 'confirmed'
}
```

### In Terminal 2 (cURL Results)

```
Test 1: ✅ HTML response (website works)
Test 2: ✅ {"success": true, "orderId": "TEST-QUICK-001"}
Test 3: ✅ {"success": true, "message": "Payment confirmed"}
Test 4: ✅ {"success": true, "message": "Payment failed"}
Test 5: ✅ {"error": "Invalid phone..."}
```

---

## 🎯 Checklist: All Tests Passing?

```
✅ Test 1 Passed: Dev server responds
✅ Test 2 Passed: Payment initiation works
✅ Test 3 Passed: Successful webhook handled
✅ Test 4 Passed: Failed webhook handled
✅ Test 5 Passed: Validation works

If ALL pass: ✅ YOU'RE READY FOR STAGING!
If any fail: 📍 See Troubleshooting below
```

---

## 🐛 Troubleshooting

### Error: "Connection refused"
```
Problem: Dev server not running
Solution:
1. Go to Terminal 1
2. Run: cd shop && npm run dev
3. Wait for server to start
4. Try curl again
```

### Error: "404 Not Found"
```
Problem: API endpoint doesn't exist
Solution:
1. Check file exists: shop/app/api/payments/mtn/initiate/route.js
2. Check filename: route.js (not route.ts)
3. Restart dev server: Ctrl+C, then npm run dev
```

### Error: "Invalid API Key"
```
Problem: Credentials not in .env.local
Solution:
1. Edit: shop/.env.local
2. Add: MTN_PRIMARY_KEY=your_key_here
3. Save file
4. Restart dev server
```

### Error: "IP not whitelisted"
```
Problem: Your IP not in MTN whitelist
Solution:
1. Find your IP: curl -s https://api.ipify.org
2. Go to MTN Portal
3. Add IP to whitelist
4. Wait 5 minutes
5. Try test again
```

### No logs in Terminal 1
```
Problem: Console output not showing
Solution:
1. Check Terminal 1 is in focus
2. Scroll up to see logs
3. Dev server should show logs from requests
4. If nothing, restart: Ctrl+C, npm run dev
```

---

## 🔄 Full Testing Flow (15 minutes)

```
Step 1 (2 min): Start dev server
  → Terminal 1: npm run dev
  → Wait for "Local: http://localhost:3000"

Step 2 (3 min): Run 5 quick tests
  → Terminal 2: Copy-paste each curl command
  → Verify each returns expected result

Step 3 (5 min): Check console logs
  → Terminal 1: Look for success messages
  → Verify payment processing logs

Step 4 (5 min): Verify locally
  → Open: http://localhost:3000
  → Look for payment button
  → Click to test UI

Result: ✅ Ready for staging!
```

---

## 📊 Test Results Template

Save this and fill in:

```
Date: 2026-07-27
Time Started: 10:00 AM
Time Finished: 10:15 AM

Tests Conducted:
✅ Test 1: Dev server - PASS
✅ Test 2: Payment init - PASS
✅ Test 3: Success webhook - PASS
✅ Test 4: Failed webhook - PASS
✅ Test 5: Validation - PASS

Overall Result: ✅ ALL TESTS PASSED

Next Step: Deploy to staging
Ready: YES
Date: 2026-07-27
```

---

## 🚨 If Tests Fail

1. **Read error message carefully**
2. **Check Troubleshooting section above**
3. **Verify prerequisites:**
   - [ ] .env.local has credentials
   - [ ] Dev server running
   - [ ] Files created in correct locations
   - [ ] npm dependencies installed

4. **Check file structure:**
   ```
   shop/
   ├── app/
   │   ├── api/
   │   │   └── payments/
   │   │       └── mtn/
   │   │           └── initiate/
   │   │               └── route.js ← Must exist!
   │   └── webhooks/
   │       └── payments/
   │           └── mtn/
   │               └── route.js ← Must exist!
   ```

5. **Check .env.local:**
   ```env
   MTN_PRIMARY_KEY=<YOUR_MTN_PRIMARY_KEY>
   MTN_API_ENDPOINT=https://sandbox.momodeveloper.mtn.com/collection/v1_0
   MTN_CALLBACK_URL=http://localhost:3000/api/webhooks/payments/mtn
   ```

---

## 💻 One-Liner Copy-Paste Tests

If you prefer, save this as `test.sh` and run `bash test.sh`:

```bash
#!/bin/bash

echo "Testing MTN MoMo Widget..."
echo ""

echo "1️⃣ Testing payment initiation..."
curl -X POST http://localhost:3000/api/payments/mtn/initiate \
  -H "Content-Type: application/json" \
  -d '{"orderId":"TEST-'$(date +%s)'","amount":500,"customerPhone":"256701234567"}'
echo ""

sleep 1

echo "2️⃣ Testing successful payment..."
curl -X POST http://localhost:3000/api/webhooks/payments/mtn \
  -H "Content-Type: application/json" \
  -d '{"externalId":"TEST-001","amount":"500","currency":"UGX","transactionStatus":"SUCCESSFUL","financialTransactionId":"mtn_test_123"}'
echo ""

sleep 1

echo "3️⃣ Testing failed payment..."
curl -X POST http://localhost:3000/api/webhooks/payments/mtn \
  -H "Content-Type: application/json" \
  -d '{"externalId":"TEST-002","amount":"500","currency":"UGX","transactionStatus":"FAILED","reason":"Insufficient funds"}'
echo ""

echo "✅ Tests complete!"
```

---

## 📱 Browser Test (Optional)

After curl tests pass, test in browser:

```
1. Open: http://localhost:3000
2. Look for: "Pay with MTN Money" button
3. Click button (if implemented)
4. Should show payment form or redirect
5. Don't actually complete payment (sandbox)
```

---

## 🎯 Next After Tests Pass

```
✅ All tests passing locally?

Next steps:
1. Review code for any issues
2. Check database integration (if implemented)
3. Verify email sending (if implemented)
4. Deploy to Vercel staging
5. Test on staging URL
6. Deploy to production

Timeline: Today to tomorrow
```

---

## 📞 Need More Details?

See full testing guide: **MTN_MOMO_WIDGET_TESTING.md**

Full implementation: **MTN_COLLECTION_SETUP.md**

---

## ✨ You're All Set!

Copy-paste the commands above and let me know:
- Did all tests pass? ✅
- What errors did you get? ❌
- Questions? 🤔

I'm here to help! 🚀
