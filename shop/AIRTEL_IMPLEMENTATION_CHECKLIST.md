# Airtel Payment Integration - Quick Checklist

## Phase 1: Preparation (1-2 days)

- [ ] **Register with Airtel Uganda Developer Portal**
  - [ ] Visit https://developers.airtel.africa
  - [ ] Sign up with business email
  - [ ] Complete KYC verification (business documents)
  - [ ] Wait for approval (24-48 hours)

- [ ] **Get Credentials**
  - [ ] Copy API Key to `.env.local` as `AIRTEL_API_KEY`
  - [ ] Copy API Secret to `.env.local` as `AIRTEL_API_SECRET`
  - [ ] Set `AIRTEL_MERCHANT_CODE` (e.g., MRSQOOP)
  - [ ] Copy Webhook Secret to `.env.local` as `AIRTEL_WEBHOOK_SECRET`

- [ ] **Register Webhook URL**
  - [ ] In Airtel Dashboard: Settings → Webhooks
  - [ ] Add: `https://your-domain.com/api/webhooks/payments/airtel-mtn`
  - [ ] Enable events: `payment.success`, `payment.failed`, `payment.pending`

## Phase 1.5: Security Configuration (Same day as registration)

### IP Whitelisting Setup

- [ ] **Configure IP Whitelist in Airtel Portal**
  - [ ] Find your public IP: `curl -s https://api.ipify.org`
  - [ ] Add your public IP as: `203.0.113.42/32`
  - [ ] Enable IP Whitelist feature in Airtel Dashboard
  - [ ] Verify whitelist is ENABLED (not just IPs added)

- [ ] **Add Vercel IP Ranges (for production later)**
  - [ ] Copy all 14 Vercel IP ranges (see AIRTEL_IP_WHITELIST_QUICK_REF.md)
  - [ ] Add to Airtel portal (one per line)
  - [ ] Save configuration

---

## Phase 2: Development (3-5 days)

### Backend Implementation

- [ ] **Update Environment Variables** (`.env.local`)
  ```env
  AIRTEL_API_KEY=prod_xxx
  AIRTEL_API_SECRET=secret_xxx
  AIRTEL_MERCHANT_CODE=MRSQOOP
  AIRTEL_MERCHANT_NAME=MrSqoopExpress
  AIRTEL_WEBHOOK_SECRET=webhook_secret_xxx
  AIRTEL_API_ENDPOINT=https://uat.airtel.africa/merchant/v1/
  AIRTEL_CALLBACK_URL=http://localhost:3000/api/webhooks/payments/airtel-mtn
  ```

- [ ] **Create Payment Initiation API**
  - [ ] Create: `shop/app/api/payments/airtel/initiate/route.js`
  - [ ] Implement phone number validation (256XXXXXXXXX format)
  - [ ] Call Airtel API with order data
  - [ ] Save transaction to database (TODO: implement)
  - [ ] Return redirect URL or transaction ID

- [ ] **Update Webhook Handler**
  - [ ] Edit: `shop/app/api/webhooks/payments/airtel-mtn/route.js`
  - [ ] Implement `verifyAirtelSignature()` function
  - [ ] Test webhook signature verification
  - [ ] Ensure payment handlers update database correctly

- [ ] **Database Schema** (if using MongoDB)
  ```javascript
  // AirtelTransaction collection
  {
    _id: ObjectId,
    orderId: String,
    transactionId: String,
    airtelTransactionId: String,
    amount: Number,
    currency: String,
    status: String, // PENDING, SUCCESS, FAILED
    subscriber: {
      msisdn: String,
      email: String
    },
    createdAt: Date,
    webhookReceivedAt: Date,
    lastStatusUpdate: Date
  }
  ```

### Frontend Implementation

- [ ] **Create Payment Button Component**
  - [ ] Create: `shop/app/components/AirtelPaymentButton.jsx`
  - [ ] Add phone number input validation
  - [ ] Call payment initiation API
  - [ ] Handle redirect or polling for status
  - [ ] Show error messages

- [ ] **Integrate into Checkout Page**
  - [ ] Add AirtelPaymentButton component
  - [ ] Show alongside MTN and other payment methods
  - [ ] Add payment method description
  - [ ] Test mobile responsiveness

## Phase 3: Testing (2-3 days)

### Sandbox Testing

- [ ] **Setup Ngrok for Local Testing**
  ```bash
  ngrok http 3000
  # Update AIRTEL_CALLBACK_URL to ngrok URL
  ```

- [ ] **Test Payment Initiation**
  - [ ] Use test phone: 256701234567
  - [ ] Test with various amounts (100, 500, 10000)
  - [ ] Verify API returns transaction ID or redirect URL
  - [ ] Check logs for API responses

- [ ] **Test Webhook Reception**
  - [ ] Send test webhook manually (see cURL examples)
  - [ ] Verify webhook signature verification works
  - [ ] Check order status update in database
  - [ ] Verify customer email sent
  - [ ] Verify admin notification sent

- [ ] **Test Payment Statuses**
  - [ ] SUCCESS: Order marked as paid
  - [ ] FAILED: Order marked as payment_failed
  - [ ] PENDING: Order marked as pending_confirmation
  - [ ] REVERSED: Order marked as reversed

- [ ] **Error Handling**
  - [ ] Invalid phone number
  - [ ] Invalid amount
  - [ ] Network timeout
  - [ ] API authentication failure
  - [ ] Duplicate transaction

### Security Testing

- [ ] **Signature Verification**
  - [ ] Test with valid signature ✓
  - [ ] Test with invalid signature ✗
  - [ ] Test with modified payload ✗
  - [ ] Verify no bypass possible

- [ ] **Input Validation**
  - [ ] SQL injection attempts
  - [ ] XSS in descriptions
  - [ ] CSRF protection
  - [ ] Rate limiting on payment initiation

## Phase 4: Deployment (1-2 days)

### Staging Environment

- [ ] **Deploy to Staging**
  ```bash
  git commit -m "Add Airtel payment integration"
  git push origin airtel-payment
  # Create PR and merge to staging branch
  ```

- [ ] **Configure Staging Environment**
  - [ ] Update `.env` in Vercel staging:
    - `AIRTEL_API_ENDPOINT=https://uat.airtel.africa/...` (still sandbox)
    - But use real test credentials
  - [ ] Register webhook: `https://staging.mrsqoopexpress.com/api/webhooks/...`

- [ ] **Full End-to-End Test**
  - [ ] Complete payment flow from start to finish
  - [ ] Test with real phone (if Airtel allows)
  - [ ] Monitor logs and error tracking
  - [ ] Verify emails sent correctly

### Production Deployment

- [ ] **Update Production Environment**
  - [ ] Update `.env.prod` in Vercel:
    ```
    AIRTEL_API_ENDPOINT=https://apis.airtel.africa/merchant/v1/
    AIRTEL_API_KEY=prod_key
    AIRTEL_API_SECRET=prod_secret
    AIRTEL_WEBHOOK_SECRET=prod_webhook_secret
    AIRTEL_CALLBACK_URL=https://mrsqoopexpress.com/api/webhooks/payments/airtel-mtn
    ```

- [ ] **Pre-Launch Checklist**
  - [ ] Verify all credentials are production (not sandbox)
  - [ ] Webhook URL is public-facing
  - [ ] Database backup created
  - [ ] Error monitoring setup (Sentry, etc.)
  - [ ] Alert configured for payment failures

- [ ] **Deploy to Production**
  ```bash
  git tag v1.0.0-airtel
  # Merge to main branch
  vercel --prod
  ```

- [ ] **Post-Launch Verification**
  - [ ] Make test payment with small amount
  - [ ] Verify webhook received and processed
  - [ ] Check order status updated correctly
  - [ ] Verify customer received confirmation email
  - [ ] Monitor error logs for 24 hours

## Phase 5: Monitoring & Optimization (Ongoing)

### Daily Monitoring

- [ ] **Check Payment Metrics**
  - [ ] Total transactions per day
  - [ ] Success rate (target: >95%)
  - [ ] Average payment time
  - [ ] Failed payment rate

- [ ] **Check Logs**
  - [ ] Any API errors?
  - [ ] Any webhook delivery failures?
  - [ ] Any customer complaints?

### Weekly Review

- [ ] **Payment Reports**
  - [ ] Total revenue via Airtel
  - [ ] Compare with MTN performance
  - [ ] Identify patterns in failures
  - [ ] Calculate success rate by hour

- [ ] **User Feedback**
  - [ ] Check customer support tickets
  - [ ] Review payment method preference
  - [ ] Identify UX issues

### Monthly Optimization

- [ ] **Performance Tuning**
  - [ ] Reduce payment initiation timeout if possible
  - [ ] Optimize webhook processing
  - [ ] Add retry logic for failed webhooks

- [ ] **Feature Enhancements**
  - [ ] Add payment confirmation page
  - [ ] Add payment receipt to email
  - [ ] Add payment history to customer dashboard
  - [ ] Add refund capability

## Troubleshooting Guide

### Payment Won't Initiate
```
❌ Error: "Invalid phone number"
✅ Solution: Ensure format is 256XXXXXXXXX (12 digits)

❌ Error: "API authentication failed"
✅ Solution: Check AIRTEL_API_KEY and AIRTEL_API_SECRET in .env.local

❌ Error: "Timeout"
✅ Solution: Verify internet connection, check Airtel API status
```

### Webhook Not Received
```
✅ Check Airtel Merchant Dashboard → Webhooks → Logs
✅ Verify webhook URL is correct and publicly accessible
✅ Test webhook delivery with cURL (see docs)
✅ Ensure firewall isn't blocking inbound requests
```

### Signature Verification Fails
```
✅ Verify AIRTEL_WEBHOOK_SECRET is correct
✅ Check payload format matches Airtel's documentation
✅ Test with known-good signature
✅ Enable verbose logging to see expected vs actual signature
```

### Order Not Updating
```
✅ Check database connection
✅ Verify database query is correct
✅ Check database permissions
✅ Review error logs for database errors
```

## Quick Links

- **Airtel Documentation:** https://developer.airtel.africa/docs
- **Merchant Portal:** https://merchant.airtel.africa
- **Status Page:** https://status.airtel.africa
- **Support Email:** developer-support@airtel.africa

## Contact & Escalation

- **Internal:** Document issues in GitHub
- **Airtel Support:** Create ticket in Merchant Portal
- **Emergency:** Call Airtel support hotline

---

**Estimated Total Time:** 7-12 days (depending on approval time)

Start with Phase 1 to get credentials, then you can proceed with development in parallel!
