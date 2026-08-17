# Complete Airtel Uganda Setup Guide - MrSqoopExpress

This is your complete step-by-step guide to set up Airtel Money payments with all security configurations.

## 📋 Complete Setup Checklist

### PHASE 1: Airtel Portal Registration & Configuration (Day 1-2)

#### Step 1: Register Airtel Account
- [ ] Go to: https://developers.airtel.africa
- [ ] Click: Sign Up
- [ ] Email: your-business@email.com
- [ ] Password: Strong password
- [ ] Business Name: MrSqoopExpress
- [ ] Country: **Uganda**
- [ ] Complete KYC verification (upload documents)
- [ ] Wait for approval (24-48 hours)

#### Step 2: Create Application
- [ ] Login to Airtel Developer Portal
- [ ] Go to: My Apps → Create New Application
- [ ] Name: `MrSqoopExpress`
- [ ] Type: Merchant / Commerce
- [ ] Country: **Uganda**
- [ ] Currency: **UGX**
- [ ] Website: https://mrsqoopexpress.com
- [ ] Callback URL: `https://your-domain.com/api/webhooks/payments/airtel-mtn`

#### Step 3: Select Products (CRITICAL)
- [ ] **Select ONLY 2 products**:
  - [ ] ☑ **MERCHANT COLLECTION** (for receiving customer payments)
  - [ ] ☑ **Notification API** (for payment notifications)
- [ ] ❌ Uncheck/skip everything else (loans, remittance, cash out, etc.)
- [ ] Save Application

#### Step 4: Configure IP Whitelist (SECURITY)
- [ ] Find your public IP: `curl -s https://api.ipify.org`
- [ ] Go to: Settings → IP Whitelist
- [ ] ☑ **Enable IP Whitelist** (important!)
- [ ] Add your development IP:
  ```
  203.0.113.42/32  (replace with your actual IP)
  ```
- [ ] Add Vercel production IPs (copy all 14 ranges):
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
- [ ] Save

#### Step 5: Get Credentials
- [ ] Go to: My Apps → MrSqoopExpress → API Keys
- [ ] Copy:
  - [ ] API Key
  - [ ] API Secret
  - [ ] Merchant Code
- [ ] Go to: Webhooks
- [ ] Copy:
  - [ ] Webhook Secret

#### Step 6: Configure Webhook URL
- [ ] Go to: My Apps → MrSqoopExpress → Webhooks
- [ ] Register webhook URL: `https://your-domain.com/api/webhooks/payments/airtel-mtn`
- [ ] Select events:
  - [ ] ☑ payment.success
  - [ ] ☑ payment.failed
  - [ ] ☑ payment.pending
- [ ] Save webhook secret

---

### PHASE 2: Local Development Setup (Day 3-4)

#### Step 1: Update Environment Variables
- [ ] Open: `shop/.env.local`
- [ ] Add/update:
  ```env
  # Airtel Configuration
  AIRTEL_API_KEY=[copy from Airtel portal]
  AIRTEL_API_SECRET=[copy from Airtel portal]
  AIRTEL_MERCHANT_CODE=MRSQOOP
  AIRTEL_MERCHANT_NAME=MrSqoopExpress
  AIRTEL_WEBHOOK_SECRET=[copy from Airtel portal]
  AIRTEL_COUNTRY=UG
  AIRTEL_CURRENCY=UGX
  AIRTEL_API_ENDPOINT=https://uat.airtel.africa/merchant/v1/
  AIRTEL_CALLBACK_URL=http://localhost:3000/api/webhooks/payments/airtel-mtn
  ```
- [ ] Save and close file

#### Step 2: Create Payment Initiation API
- [ ] Create file: `shop/app/api/payments/airtel/initiate/route.js`
- [ ] Copy code from AIRTEL_QUICK_START.md or AIRTEL_PAYMENT_INTEGRATION.md
- [ ] Verify code is correct
- [ ] Save

#### Step 3: Create Payment Button Component
- [ ] Create file: `shop/app/components/AirtelPaymentButton.jsx`
- [ ] Copy code from AIRTEL_QUICK_START.md
- [ ] Update with your API endpoint
- [ ] Save

#### Step 4: Update Webhook Handler
- [ ] Edit: `shop/app/api/webhooks/payments/airtel-mtn/route.js`
- [ ] Update `verifyAirtelSignature()` function with correct logic
- [ ] Verify signature verification is implemented
- [ ] Test signature verification

#### Step 5: Start Development Server
- [ ] Open terminal
- [ ] Run: `cd shop && npm run dev`
- [ ] Verify: Server starts on http://localhost:3000
- [ ] Keep terminal open

---

### PHASE 3: Testing Setup (Day 4-5)

#### Step 1: Setup Ngrok (for webhook testing)
- [ ] Install ngrok: `npm install -g ngrok` (if not installed)
- [ ] Open new terminal
- [ ] Run: `ngrok http 3000`
- [ ] Copy the HTTPS URL (e.g., `https://abc123.ngrok.io`)
- [ ] Add ngrok IP to Airtel whitelist (if testing live webhooks)

#### Step 2: Test Payment Initiation (Sandbox)
- [ ] In browser, go to: http://localhost:3000
- [ ] Find your payment button (or use cURL below)
- [ ] Test amount: 500 UGX
- [ ] Test phone: 256701234567
- [ ] Click: "Pay with Airtel Money"
- [ ] Expected: Transaction ID returned

**Or use cURL**:
```bash
curl -X POST http://localhost:3000/api/payments/airtel/initiate \
  -H "Content-Type: application/json" \
  -d '{
    "orderId": "TEST-001",
    "amount": 500,
    "customerPhone": "256701234567"
  }'

# Expected response:
# {"success": true, "transactionId": "txn_abc123", "status": "PENDING"}
```

#### Step 3: Test Webhook Reception
- [ ] Send test webhook:
  ```bash
  curl -X POST http://localhost:3000/api/webhooks/payments/airtel-mtn \
    -H "Content-Type: application/json" \
    -d '{
      "id": "txn_test_001",
      "reference": "TEST-001",
      "status": "SUCCESS",
      "amount": 500,
      "currency": "UGX",
      "subscriber": {"msisdn": "256701234567"},
      "merchant": {"code": "MRSQOOP"},
      "timestamp": "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'"
    }'
  ```
- [ ] Expected: HTTP 200 response
- [ ] Check logs: Order status should be updated

#### Step 4: Test Error Scenarios
- [ ] Test invalid phone number
- [ ] Test negative amount
- [ ] Test duplicate payment
- [ ] Test payment failure
- [ ] Test timeout scenario

---

### PHASE 4: Staging Deployment (Day 5-6)

#### Step 1: Prepare for Deployment
- [ ] Review all code for security issues
- [ ] Remove console.log debugging statements (optional)
- [ ] Verify environment variables are set
- [ ] Test locally one more time

#### Step 2: Deploy to Vercel Staging
- [ ] Create git branch: `git checkout -b airtel-payment`
- [ ] Commit changes: `git add . && git commit -m "Add Airtel payment integration"`
- [ ] Push: `git push origin airtel-payment`
- [ ] Create PR on GitHub
- [ ] Deploy to Vercel staging (automatic or via CLI)

#### Step 3: Configure Staging Environment
- [ ] Go to Vercel Dashboard → Project Settings → Environment Variables
- [ ] Add all AIRTEL_* variables (same as .env.local)
- [ ] Set `AIRTEL_API_ENDPOINT=https://uat.airtel.africa/merchant/v1/` (sandbox)
- [ ] Set `AIRTEL_CALLBACK_URL=https://staging.your-domain.com/api/webhooks/...`
- [ ] Redeploy

#### Step 4: Test on Staging
- [ ] Go to: https://staging.your-domain.com
- [ ] Test payment flow end-to-end
- [ ] Verify order creation
- [ ] Verify payment confirmation email
- [ ] Verify admin notification
- [ ] Monitor logs for errors

#### Step 5: Verify IP Whitelist
- [ ] Check Airtel portal: IP Whitelist section
- [ ] Confirm Vercel IPs are added
- [ ] Confirm development IP is added
- [ ] Test payment works from staging

---

### PHASE 5: Production Deployment (Day 6-7)

#### Step 1: Update Production Credentials
- [ ] Go to Vercel Dashboard → Production Environment
- [ ] Update AIRTEL_* variables:
  ```env
  AIRTEL_API_ENDPOINT=https://api.airtel.africa/merchant/v1/
  AIRTEL_CALLBACK_URL=https://mrsqoopexpress.com/api/webhooks/payments/airtel-mtn
  ```
- [ ] Keep API Key, Secret, Merchant Code, Webhook Secret
- [ ] Verify: All variables are correct (no sandbox URLs)

#### Step 2: Verify IP Whitelist (Final Check)
- [ ] Go to Airtel Portal → Settings → IP Whitelist
- [ ] Verify all 14 Vercel IP ranges are added
- [ ] Verify whitelist is ENABLED
- [ ] Verify your dev IP is there (for emergencies)

#### Step 3: Deploy to Production
- [ ] Merge PR to main branch
- [ ] Deploy: `vercel --prod` (or merge triggers auto-deploy)
- [ ] Wait for deployment to complete
- [ ] Verify deployment succeeded (check Vercel Dashboard)

#### Step 4: Smoke Test Production
- [ ] Go to: https://mrsqoopexpress.com
- [ ] Make test payment with small amount (100-500 UGX)
- [ ] Use test phone: 256701234567 (if available in production)
- [ ] Verify payment succeeds
- [ ] Verify order created in database
- [ ] Verify customer email sent
- [ ] Verify admin notification received

#### Step 5: Monitor for 24 Hours
- [ ] Watch error logs
- [ ] Monitor payment success rate
- [ ] Check for IP whitelist rejections
- [ ] Respond to any customer issues
- [ ] Document any issues found

---

### PHASE 6: Post-Launch (Day 7+)

#### Day 7: Document Everything
- [ ] Document IP whitelist configuration
- [ ] Document API credentials (secure)
- [ ] Document webhook events
- [ ] Create runbook for troubleshooting
- [ ] Create incident response plan

#### Week 2: Monitoring
- [ ] Review payment success rates
- [ ] Check for patterns in failures
- [ ] Monitor webhook delivery
- [ ] Review customer feedback
- [ ] Update documentation as needed

#### Week 3: Enhancement
- [ ] Add Disbursement APIs (for refunds)
- [ ] Implement refund logic
- [ ] Add more payment methods (MTN if desired)
- [ ] Optimize payment flow
- [ ] Add analytics/reporting

---

## 🎯 Quick Command Reference

### Find Your Public IP
```bash
curl -s https://api.ipify.org
```

### Test Payment API (Sandbox)
```bash
curl -X POST https://uat.airtel.africa/merchant/v1/payments/ \
  -H "Authorization: Bearer $AIRTEL_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "reference": "TEST-001",
    "subscriber": {"msisdn": "256701234567"},
    "transaction": {"amount": 500, "currency": "UGX", "id": "txn_001"},
    "merchant": {"code": "MRSQOOP", "name": "MrSqoopExpress"}
  }'
```

### Start Dev Server
```bash
cd shop && npm run dev
```

### Start Ngrok
```bash
ngrok http 3000
```

### Deploy to Vercel
```bash
vercel --prod
```

---

## 📚 Documentation Files in Order

1. **AIRTEL_PRODUCT_SELECTION.md** - Which 2 products to select
2. **AIRTEL_IP_WHITELIST_QUICK_REF.md** - IP addresses to whitelist
3. **AIRTEL_UGANDA_SETUP.md** - Uganda-specific configuration
4. **AIRTEL_QUICK_START.md** - 30-minute implementation
5. **AIRTEL_PAYMENT_INTEGRATION.md** - Complete technical guide
6. **AIRTEL_IMPLEMENTATION_CHECKLIST.md** - Detailed checklist
7. **AIRTEL_IP_WHITELIST.md** - Detailed IP whitelisting guide
8. **AIRTEL_PRODUCTS_GUIDE.md** - All products explained

---

## 🆘 Common Issues & Quick Fixes

### "Authorization Failed"
- Check: API Key and Secret are correct
- Check: IP whitelist includes your IP
- Check: Whitelist is ENABLED
- Solution: Copy credentials directly from Airtel portal again

### "Access Denied from IP"
- Problem: Your IP isn't whitelisted
- Solution: 
  1. Find IP: `curl -s https://api.ipify.org`
  2. Add to Airtel IP whitelist
  3. Wait 5 minutes
  4. Test again

### "Webhook Not Received"
- Check: Webhook URL is registered in Airtel portal
- Check: URL is publicly accessible (not localhost)
- Check: If testing locally, use ngrok: `ngrok http 3000`
- Check: Webhook event type is enabled

### "Works Locally But Not on Vercel"
- Problem: Vercel IPs not whitelisted
- Solution:
  1. Add all 14 Vercel IP ranges to Airtel
  2. Redeploy to Vercel
  3. Test payment

---

## ✅ Success Criteria

### Development Complete ✅
- [ ] Payment button works locally
- [ ] Payment API responds with transaction ID
- [ ] Webhook can be received via ngrok
- [ ] Signature verification passes
- [ ] Order status updates on payment

### Staging Complete ✅
- [ ] Payment works on staging URL
- [ ] End-to-end flow works
- [ ] Emails are sent correctly
- [ ] Admin is notified
- [ ] No console errors

### Production Complete ✅
- [ ] Payment works on production
- [ ] Test payment succeeds
- [ ] Customer receives confirmation
- [ ] Admin receives notification
- [ ] Logs show success
- [ ] IP whitelist is protecting APIs

---

## 📞 Support Contacts

- **Airtel Developer Support**: developer-support@airtel.africa
- **Vercel Support**: support@vercel.com
- **Your Team**: Document your own support process

---

**Total Time Estimate**: 7-10 days (including approval time)

**Last Updated**: 2026-07-27

**Version**: 1.0 - Complete Setup Guide
