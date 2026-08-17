# Airtel vs MTN - Product Selection Comparison

Complete comparison of products available from both payment providers for Uganda.

## 🎯 At a Glance

### What You Need to Select

| Business Need | Airtel | MTN |
|---------------|--------|-----|
| **Receive customer payments** | MERCHANT COLLECTION | Collection |
| **Get payment notifications** | Notification API | (Built into Collection) |
| **Refund customers** | Disbursement APIs | Disbursements |
| **International transfers** | (N/A) | Remittance |
| **Testing environment** | Sandbox | Sandbox |

---

## 📋 AIRTEL Products Available

### For MrSqoopExpress (E-commerce Shop)

```
Core Products:
✅ MERCHANT COLLECTION
   └─ Receive customer payments
   └─ Required for shop to work
   └─ Select: YES (Week 1)

✅ Notification API
   └─ Get payment event notifications
   └─ Recommended for reliability
   └─ Select: YES (Week 1)

⏭️ Disbursement APIs
   └─ Send refunds and payouts
   └─ Select: LATER (Week 3+)
   └─ Only if you need refunds

Other Products (Don't Need):
❌ Cash out APIs - For ATM services
❌ ATM withdrawal API - For cash withdrawals
❌ Loan products - For lending businesses
❌ Remittance APIs - For money transfers
❌ Topup notification - For airtime sales
❌ Account - General account management
❌ Billers callback - For bill payments
❌ KYC - Customer verification (optional)
❌ IMT Remittance - International transfers
```

---

## 📋 MTN Products Available

### For MrSqoopExpress (E-commerce Shop)

```
Core Products:
✅ Collection
   └─ Receive customer payments
   └─ Required for shop to work
   └─ Select: YES (Week 1)

✅ Sandbox
   └─ Testing environment
   └─ Usually auto-included
   └─ Select: YES (Week 1)

⏭️ Disbursements
   └─ Send refunds and payouts
   └─ Select: LATER (Week 3+)
   └─ Only if you need refunds

Other Products (Don't Need for Now):
❌ Remittance
   └─ International money transfers
   └─ Not for e-commerce shops
   └─ Skip for now

❌ User provisioning
   └─ User account creation/management
   └─ Might be for KYC or staff accounts
   └─ Skip for now (can add later if needed)
```

---

## 🔄 Product Selection Timeline

### AIRTEL Timeline

```
Week 1-2: Launch
SELECT:
  ✅ MERCHANT COLLECTION
  ✅ Notification API
TEST:
  - Payment initiation
  - Webhook delivery
  - Signature verification

Week 3+: Enhancement
ADD:
  ✅ Disbursement APIs
  - Implement refunds
  - Implement payouts
```

### MTN Timeline

```
Week 1-2: Launch
SELECT:
  ✅ Collection
  ✅ Sandbox
TEST:
  - Payment initiation
  - Webhook delivery
  - Signature verification

Week 3+: Enhancement
ADD:
  ✅ Disbursements
  - Implement refunds
  - Implement payouts
```

---

## 📊 Detailed Comparison

### 1. Payment Collection

#### Airtel
```
Product Name: MERCHANT COLLECTION
Purpose: Accept customer payments
Type: Merchant-focused
Configuration: Country, Currency, Settlement
API: POST /payments/, GET /payments/{id}
Webhooks: Yes (via Notification API)
```

#### MTN
```
Product Name: Collection
Purpose: Accept customer payments
Type: General collection
Configuration: Country, Currency, Account
API: POST /collection/token/, POST /transaction/
Webhooks: Yes (built-in)
```

**For your shop**: Either works. Both let you receive customer payments.

---

### 2. Notifications & Webhooks

#### Airtel
```
Product Name: Notification API
Separate Product: YES (must add both)
Events: payment.success, payment.failed, payment.pending
Webhook: Yes, to your server
Configuration: Register webhook URL + Secret

How it works:
1. Select: MERCHANT COLLECTION
2. Select: Notification API
3. Both enable payment webhooks
```

#### MTN
```
Product Name: Included in Collection
Separate Product: NO (built-in)
Events: Collection status changes
Webhook: Yes, to your server
Configuration: Webhook URL in Collection settings

How it works:
1. Select: Collection
2. Webhooks are automatically enabled
3. No separate product needed
```

**Advantage MTN**: One product handles both. Simpler setup.

---

### 3. Refunds & Payouts

#### Airtel
```
Product Name: Disbursement APIs
When to Add: Week 3+ (optional)
Use Cases:
  - Refund customers
  - Pay staff
  - Pay suppliers
API: POST /disbursements/

Important: Add AFTER MERCHANT COLLECTION is working
```

#### MTN
```
Product Name: Disbursements
When to Add: Week 3+ (optional)
Use Cases:
  - Refund customers
  - Pay staff
  - Pay suppliers
API: POST /transaction/

Important: Add AFTER Collection is working
```

**Both**: Functionally similar. Add after your main payment system is live.

---

### 4. Other Products

#### Airtel - What NOT to Select
```
❌ Cash out APIs - ATM cash withdrawal services
❌ ATM withdrawal API - Same as above
❌ Loan products - For lending/fintech companies
   - Loan lifecycle management
   - Term loans
   - Overdraft loans
   - Loan user KYC
❌ Remittance APIs - International money transfers
❌ Topup notification - Mobile airtime sales
❌ Account - General account management
❌ Billers callback - Bill payment services
❌ IMT Remittance - International transfers
```

#### MTN - What NOT to Select
```
❌ Remittance
   └─ International money transfers
   └─ Not needed for e-commerce shop
   └─ Skip for now

❌ User provisioning
   └─ User account/KYC management
   └─ Might be needed later
   └─ Skip for now (assess needs in Week 3+)
```

---

## 🎯 Selection Decision Matrix

### If Using Airtel

```
Week 1-2:
┌─────────────────────────────┐
│ MUST SELECT                  │
├─────────────────────────────┤
│ ✅ MERCHANT COLLECTION       │
│ ✅ Notification API          │
└─────────────────────────────┘

Week 3+:
┌─────────────────────────────┐
│ CAN ADD IF NEEDED            │
├─────────────────────────────┤
│ ✅ Disbursement APIs         │
│    (for refunds & payouts)   │
└─────────────────────────────┘
```

### If Using MTN

```
Week 1-2:
┌─────────────────────────────┐
│ MUST SELECT                  │
├─────────────────────────────┤
│ ✅ Collection                │
│ ✅ Sandbox                   │
└─────────────────────────────┘

Week 3+:
┌─────────────────────────────┐
│ CAN ADD IF NEEDED            │
├─────────────────────────────┤
│ ✅ Disbursements             │
│    (for refunds & payouts)   │
│                              │
│ ❓ User provisioning         │
│    (assess if needed)        │
└─────────────────────────────┘
```

---

## 🔄 Migration / Dual Integration Path

If you want to support BOTH Airtel and MTN:

### Month 1: Airtel Only
```
SELECT:
✅ MERCHANT COLLECTION
✅ Notification API

IMPLEMENT:
- Airtel payment flow
- Test thoroughly
- Launch
```

### Month 2: Add MTN

```
SELECT (MTN):
✅ Collection
✅ Sandbox

IMPLEMENT:
- Add MTN payment initiation
- Update webhook handler for both
- Add MTN button to checkout

DEPLOY:
- Update webhook to handle both providers
- Test both flows
- Customer sees both options
```

### Month 3: Add Refunds (Both)

```
ADD:
✅ Airtel: Disbursement APIs
✅ MTN: Disbursements

IMPLEMENT:
- Refund logic for both
- Admin dashboard for refunds
- Testing
```

---

## 📝 Product Selection Checklist

### For AIRTEL

```
☐ Account created on Airtel Developer Portal
☐ Application created: MrSqoopExpress
☐ Country set to: Uganda
☐ Currency set to: UGX

Products Selected:
☑ MERCHANT COLLECTION
☑ Notification API
☐ Disbursement APIs (later)

Security:
☑ IP Whitelist enabled
☑ Added development IP
☑ Added Vercel IP ranges

Configured:
☑ Webhook URL registered
☑ API Key copied
☑ API Secret copied
☑ Merchant Code noted
☑ Webhook Secret copied
```

### For MTN

```
☐ Account created on MTN Developer Portal
☐ Application created: MrSqoopExpress
☐ Country set to: Uganda
☐ Currency set to: UGX

Products Selected:
☑ Collection
☑ Sandbox
☐ Disbursements (later)
☐ User provisioning (assess later)
☐ Remittance (skip)

Security:
☑ IP Whitelist enabled (if available)
☑ Added development IP
☑ Added Vercel IP ranges

Configured:
☑ Webhook URL registered
☑ API Key copied
☑ API Secret copied
☑ Merchant Code noted
☑ Webhook Secret copied
```

---

## 🆚 Quick Comparison Table

| Feature | Airtel | MTN |
|---------|--------|-----|
| **Payment Collection Product** | MERCHANT COLLECTION | Collection |
| **Notifications** | Separate API product | Built-in |
| **Number of products to select (Week 1)** | 2 (Collection + API) | 2 (Collection + Sandbox) |
| **Refunds** | Disbursement APIs | Disbursements |
| **Simplicity** | Medium | Medium |
| **Documentation** | Good | Good |
| **Developer support** | Good | Good |
| **Market coverage (Uganda)** | Wide | Wide |

---

## 🎓 What NOT to Do

### ❌ Common Mistakes

1. **Selecting too many products**
   - ❌ Don't select Remittance if you're just doing payments
   - ✅ Do select only Collection/MERCHANT COLLECTION

2. **Selecting loan products**
   - ❌ Don't select Term Loans, Overdraft, etc.
   - ✅ These are for lending companies, not shops

3. **Forgetting Notification API (Airtel)**
   - ❌ Don't skip Notification API with Airtel
   - ✅ Do select both MERCHANT COLLECTION + Notification API

4. **Not enabling IP Whitelist**
   - ❌ Don't leave whitelist disabled
   - ✅ Do enable and add your IPs (security critical)

5. **Selecting Sandbox as only product**
   - ❌ Don't confuse Sandbox (environment) as a full product
   - ✅ Sandbox should be enabled alongside your selected products

---

## 🚀 Implementation Recommendation

### For Your First Integration

**Choose ONE of these:**

**Option A: Start with Airtel (Recommended for simplicity)**
```
✅ MERCHANT COLLECTION
✅ Notification API

Why:
- Merchant-focused product naming is clearer
- Simpler configuration
- Good API documentation
```

**Option B: Start with MTN**
```
✅ Collection
✅ Sandbox

Why:
- Notifications built-in (fewer products)
- Strong Uganda presence
- Mature API platform
```

**Then add the other provider later in Month 2-3.**

---

## 📞 Getting Help

### Airtel Support
- Portal: https://developers.airtel.africa
- Email: developer-support@airtel.africa
- Docs: https://developer.airtel.africa/docs

### MTN Support
- Portal: https://momodeveloper.mtn.com
- Email: support@mtn.com (or developer email)
- Docs: Check your MTN developer dashboard

---

## ✅ Summary for MrSqoopExpress

### AIRTEL: Select These
```
Week 1-2:
✅ MERCHANT COLLECTION
✅ Notification API

Week 3+:
✅ Disbursement APIs (if needed)
```

### MTN: Select These
```
Week 1-2:
✅ Collection
✅ Sandbox

Week 3+:
✅ Disbursements (if needed)
```

### Both: Enable This
```
Security:
✅ IP Whitelist (enable + add IPs)
✅ Webhook Signature Verification
✅ API Signature Verification
```

---

**Key Point**: The selection is straightforward. For e-commerce:
- **Airtel**: MERCHANT COLLECTION + Notification API
- **MTN**: Collection + Sandbox
- Add refund products (Disbursements) later
- Skip everything else

**Last Updated**: 2026-07-27
