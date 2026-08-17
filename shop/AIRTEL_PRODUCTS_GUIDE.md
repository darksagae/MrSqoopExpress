# Airtel Developer Portal - Products Guide for MrSqoopExpress

This guide explains which Airtel products to enable for your e-commerce shop.

## Overview

Airtel Developer Portal offers multiple products that you can add to your application. For **MrSqoopExpress** (dropshipping/e-commerce), you need specific products to handle payments.

## Airtel Uganda's Available Products

The Airtel Uganda Developer Portal offers many products for different business types. Here are ALL available products:

**Payment & Money Movement:**
- MERCHANT COLLECTION ⭐ (SELECT THIS)
- Collection APIs
- Disbursement APIs
- Cash in APIs
- Cash out APIs
- Remittance APIs
- Remittance APIs v2
- IMT Remittance
- Remx

**Notifications & Callbacks:**
- Notification API ⭐ (SELECT THIS)
- Topup notification
- Billers callback
- IMT callback

**Loan Products:**
- Loan lifecycle management
- Term loans
- Overdraft loans
- Loan user KYC

**Other Services:**
- Account
- KYC
- ATM withdrawal API
- Partner portal
- Sandbox (testing environment)

---

## For MrSqoopExpress: SELECT THESE ONLY

### 1. MERCHANT COLLECTION (CORE REQUIREMENT) ⭐
**What it does**: Accepts payments from Airtel Money users into your merchant wallet

**For MrSqoopExpress**: 
- Customers pay for orders using Airtel Money
- Money goes directly to your business account
- Instant or near-instant settlement
- Easiest option for e-commerce shops

**When to add**: Immediately (required for shop to work)

**Configuration**:
```
Product: MERCHANT COLLECTION
Country: Uganda
Currency: UGX
Merchant Account: Your Airtel Money business wallet
Settlement: Instant or Daily (configurable)
```

**API Endpoints**:
```
POST /payments/
  → Initiate payment from customer

GET /payments/{transaction_id}/
  → Check payment status
```

**Alternative**: If "MERCHANT COLLECTION" is not available, use "Collection APIs" instead (same functionality, just API version).

---

### 2. Notification API (HIGHLY RECOMMENDED) ⭐
**What it does**: Sends real-time notifications when payment events occur

**For MrSqoopExpress**:
- Get instant alerts when customer pays
- Know when payment fails
- Webhook notifications to your system
- Makes payment processing more reliable

**When to add**: Immediately (same time as MERCHANT COLLECTION)

**Configuration**:
```
Product: Notification API
Events to Subscribe:
  ✅ payment.success
  ✅ payment.failed
  ✅ payment.pending
  ✅ payment.cancelled

Webhook URL: https://your-domain.com/api/webhooks/payments/airtel-mtn
```

**How it works**:
```
1. Customer pays for order
2. Airtel processes payment
3. Notification API sends webhook to your server
4. Your server updates order status
5. Customer gets confirmation email
```

---

### 3. Disbursement APIs (OPTIONAL - Add Later)
**What it does**: Send money from your wallet to other Airtel Money users

**For MrSqoopExpress**:
- Refund customer if order is cancelled
- Pay suppliers/warehouse staff
- Send commissions or bonuses
- Instant transfers to Airtel users

**When to add**: After MERCHANT COLLECTION is working (Week 3+)

**Use Cases**:
```
Refund Customer Order:
  Your Wallet → Customer's Airtel Wallet
  Amount: Full or partial refund

Pay Warehouse Staff:
  Your Wallet → Staff Airtel Wallet
  Purpose: Salary, bonus, commission

Pay Supplier:
  Your Wallet → Supplier Airtel Wallet
  Purpose: Restock payment
```

**Configuration**:
```
Product: Merchant Payments / Disbursements
Country: Uganda
Currency: UGX
Source Account: Your merchant wallet
Recipient: Any Airtel Money user
Batch Processing: Yes/No (for bulk payouts)
```

**API Endpoints**:
```
POST /disbursements/
  → Send money to Airtel user

GET /disbursements/{transaction_id}/
  → Check disbursement status
```

---

## Products to AVOID (Not for E-Commerce)

These products are for OTHER business types, NOT for your shop:

### ❌ Loan Products (NOT NEEDED)
- **Loan lifecycle management**
- **Term loans**
- **Overdraft loans**
- **Loan user KYC**
- **Why skip**: These are for lending/fintech businesses, not e-commerce
- **Your shop**: Does NOT do lending

### ❌ Remittance Products (NOT NEEDED)
- **Remittance APIs**
- **Remittance APIs v2**
- **IMT Remittance**
- **Remx**
- **Why skip**: These are for money transfer businesses, not e-commerce
- **Your shop**: Does NOT do international money transfers

### ❌ Cash/ATM Products (NOT NEEDED)
- **Cash out APIs**
- **ATM withdrawal API**
- **Cash in APIs** (unless specifically needed)
- **Why skip**: These are for cash withdrawal services, not e-commerce
- **Your shop**: Does NOT do ATM or cash services

### ❌ Other Services (NOT NEEDED)
- **Topup notification** - For mobile airtime sales (not your shop)
- **Account** - General account management (not specific enough)
- **Billers callback** - For bill payment services (not your shop)
- **IMT callback** - International transfer callbacks (not your shop)
- **Partner portal** - Administrative tool (not a product)
- **Sandbox** - Testing environment (automatically included)
- **KYC** - Only if you need customer ID verification later

---

### 3. Bill Payments (NOT NEEDED)
**What it does**: Allow customers to pay bills through your platform

**For MrSqoopExpress**: ❌ Not needed for order payments
- Skip this unless you also handle utility bills
- Focus on Payment Collection first

---

### 4. Subscription Management (NOT NEEDED)
**What it does**: Handle recurring payments (subscriptions)

**For MrSqoopExpress**: ❌ Not needed initially
- Use if implementing subscription boxes later
- Skip for now

---

### 5. International Remittance (OPTIONAL)
**What it does**: Send money to Airtel users in other countries

**For MrSqoopExpress**: ❌ Not needed
- Skip unless you do international payments

---

## Recommended Setup Timeline

### Phase 1: Launch (Week 1-2)
```
✅ MUST ADD (SELECT BOTH):
  1. MERCHANT COLLECTION
     └─ Receive customer payments for orders
  
  2. Notification API
     └─ Get webhook notifications of payment status

❌ DO NOT ADD:
  - Any loan products
  - Any remittance APIs
  - Cash out/ATM APIs
  - Any other products
```

### Phase 2: Enhanced Features (Week 3+)
```
✅ ADD AFTER PHASE 1 (If needed):
  - Disbursement APIs (for refunds & payouts)

❌ STILL DO NOT ADD:
  - Loan products
  - Remittance APIs
  - Cash services
  - Other unrelated products
```

---

## Step-by-Step: Adding Products

### Creating Your Application

1. **Login** to https://developers.airtel.africa
2. **Navigate** to **My Apps**
3. **Click** **Create New Application**

### Fill Application Form

```
Application Name:        MrSqoopExpress
Application Type:        Merchant / Commerce
Business Category:       E-commerce / Online Retail
Country:                 Uganda
Business Description:    Dropshipping platform for importing 
                        and reselling products with Airtel 
                        Money payment integration
Website:                 https://mrsqoopexpress.com (optional)
Contact Email:           your-email@mrsqoopexpress.com
Support Phone:           +256XXXXXXXXX
```

### Select Products

#### Product 1: Payment Collection (REQUIRED)

```
Step 1: Add Product
  └─ Click: "+ Add Product"

Step 2: Select Product Type
  └─ Choose: "Payment Collection" or "Collections"

Step 3: Configure
  ├─ Product Name: "Customer Payments"
  ├─ Country: Uganda
  ├─ Currency: UGX (Uganda Shilling)
  ├─ Settlement Type: Instant / Daily
  │  (Select based on Airtel's offerings)
  └─ Merchant Account: [Your Airtel Money Account]

Step 4: Webhook Configuration
  ├─ Webhook URL: https://your-domain.com/api/webhooks/payments/airtel-mtn
  ├─ Select Events:
  │  ├─ payment.success
  │  ├─ payment.failed
  │  ├─ payment.pending
  │  └─ payment.cancelled
  ├─ Webhook Secret: [COPY THIS TO .env.local]
  └─ Test Webhook: (Click to verify)

Step 5: Save & Verify
  └─ Click: "Create Product"
```

#### Product 2: Merchant Payments (OPTIONAL - Add Later)

```
Step 1: Add Product
  └─ Click: "+ Add Product"

Step 2: Select Product Type
  └─ Choose: "Merchant Payments" or "Disbursements"

Step 3: Configure
  ├─ Product Name: "Customer Refunds & Payouts"
  ├─ Country: Uganda
  ├─ Currency: UGX
  ├─ Source Account: [Your Airtel Money Account]
  ├─ Batch Processing: Enable (for multiple payouts)
  └─ Fee Coverage: You cover / Recipient covers

Step 4: Save
  └─ Click: "Create Product"
```

---

## Getting Your Credentials

After adding products, you'll get credentials:

### From Payment Collection Product

```
Location: My Apps → MrSqoopExpress → Payment Collection

Copy these to .env.local:

AIRTEL_MERCHANT_CODE=MRSQOOP        (Unique identifier)
AIRTEL_API_KEY=prod_xxxxx...        (API Key)
AIRTEL_API_SECRET=secret_xxx...     (API Secret)
AIRTEL_WEBHOOK_SECRET=webhook_xxx   (Webhook signature)
```

### From Merchant Payments Product (if added)

```
Location: My Apps → MrSqoopExpress → Merchant Payments

Credentials:
AIRTEL_DISBURSEMENT_KEY=...
AIRTEL_DISBURSEMENT_SECRET=...
(Usually same as Payment Collection)
```

---

## Configuration Summary for MrSqoopExpress

### Minimum Configuration (Week 1)
```env
# .env.local

# Payment Collection (Customer Payments)
AIRTEL_API_ENDPOINT=https://uat.airtel.africa/merchant/v1/
AIRTEL_API_KEY=prod_xxxxx...
AIRTEL_API_SECRET=secret_xxx...
AIRTEL_MERCHANT_CODE=MRSQOOP
AIRTEL_MERCHANT_NAME=MrSqoopExpress
AIRTEL_WEBHOOK_SECRET=webhook_xxx
AIRTEL_CALLBACK_URL=https://your-domain.com/api/webhooks/payments/airtel-mtn
```

### Enhanced Configuration (Week 3+)
```env
# Add if implementing refunds/payouts

AIRTEL_DISBURSEMENT_ENABLED=true
AIRTEL_DISBURSEMENT_KEY=prod_xxxxx...
AIRTEL_DISBURSEMENT_SECRET=secret_xxx...
```

---

## Testing Your Products

### Test Payment Collection

```bash
# 1. Get payment initiation link
curl -X POST https://uat.airtel.africa/merchant/v1/payments/ \
  -H "Authorization: Bearer $AIRTEL_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "reference": "TEST-001",
    "subscriber": {
      "msisdn": "256701234567"
    },
    "transaction": {
      "amount": 500,
      "currency": "UGX",
      "id": "txn_test_001"
    },
    "merchant": {
      "code": "MRSQOOP",
      "name": "MrSqoopExpress"
    }
  }'

# 2. Check response
# You should get a transaction ID and checkout URL (if available)
```

### Test Webhook Reception

```bash
# Register webhook in Airtel Dashboard, then test:

curl -X POST http://localhost:3000/api/webhooks/payments/airtel-mtn \
  -H "Content-Type: application/json" \
  -H "X-Airtel-Signature: test_signature" \
  -d '{
    "id": "txn_test_001",
    "reference": "TEST-001",
    "status": "SUCCESS",
    "amount": 500,
    "currency": "UGX",
    "timestamp": "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'"
  }'
```

---

## Product Comparison: Airtel vs MTN

If you're comparing with MTN products:

| Capability | Airtel | MTN |
|-----------|--------|-----|
| **Payment Collection** | ✅ | ✅ |
| **Disbursements** | ✅ | ✅ |
| **Bill Payments** | ✅ | ✅ |
| **Subscriptions** | ✅ | ✅ |
| **API Documentation** | ⭐⭐⭐ | ⭐⭐⭐ |
| **Sandbox Testing** | ✅ | ✅ |
| **Uganda Support** | ✅ Excellent | ✅ Excellent |

---

## Troubleshooting

### Problem: Can't Find Payment Collection Product

**Solution:**
1. Verify you're logged in to https://developers.airtel.africa
2. Verify application is created and approved
3. Check that country is set to Uganda
4. Try refreshing the page
5. Contact Airtel support if still missing

### Problem: Product Shows as "Pending Approval"

**Solution:**
- Products often require approval (24-48 hours)
- Check Dashboard for approval status
- You can use Sandbox even if product is pending
- Contact support@airtel.africa if delayed

### Problem: Can't Add Multiple Products

**Solution:**
- Add Payment Collection first
- Wait 30 minutes
- Then add Merchant Payments
- Don't try to add everything at once

### Problem: Webhook Not Receiving Events

**Solution:**
1. Verify webhook URL is publicly accessible
2. Use ngrok for testing locally: `ngrok http 3000`
3. Register the ngrok URL in Airtel Dashboard
4. Check Airtel's webhook delivery logs
5. Ensure your endpoint returns HTTP 200

---

## FAQ

### Q: Do I need Merchant Payments for my shop to work?
**A:** No. Payment Collection is enough to receive customer payments. Add Merchant Payments later if you need refunds.

### Q: Can I test with Payment Collection before it's approved?
**A:** Yes. The Sandbox environment usually works even during approval.

### Q: Should I add Bill Payments?
**A:** No, unless your shop also handles utility bill payments. Focus on Payment Collection for orders.

### Q: Can I add products after deployment?
**A:** Yes. You can add Merchant Payments later. Update .env variables and redeploy.

### Q: How often should I test my products?
**A:** 
- Test Payment Collection daily during development
- Test in Sandbox before moving to Production
- Test Webhook delivery thoroughly
- Test error scenarios (failed payments, timeouts)

---

## Checklist: Products to Add

### Phase 1: Launch (WEEK 1)
```
☐ Create Application: MrSqoopExpress
☐ Add Product: Payment Collection
  ☐ Country: Uganda
  ☐ Currency: UGX
  ☐ Register Webhook
  ☐ Test Payment Initiation
  ☐ Test Webhook Reception
☐ Copy Credentials to .env.local
☐ Deploy to Staging
☐ Test End-to-End
```

### Phase 2: Enhancements (WEEK 3+)
```
☐ Add Product: Merchant Payments (if needed)
  ☐ For Refunds
  ☐ For Staff Payouts
☐ Update .env with new credentials
☐ Implement Refund API Route
☐ Test Refund Workflow
☐ Deploy to Production
```

---

## Need More Products Later?

If you expand MrSqoopExpress to:

| Expansion | Product to Add |
|-----------|---|
| **Subscription boxes** | Subscription Management |
| **International shipping** | International Remittance |
| **Utility bill payments** | Bill Payments |
| **Staff salary management** | Batch Payroll (Disbursements) |
| **B2B wholesale** | Corporate Payments |

---

## Support

- **Airtel Developer**: https://developers.airtel.africa
- **API Docs**: https://developer.airtel.africa/docs
- **Support Email**: developer-support@airtel.africa
- **Status Page**: https://status.airtel.africa

---

**Summary**: Add **Payment Collection** for your shop. Add **Merchant Payments** later if you need refunds. That's it!

**Last Updated**: 2026-07-27
