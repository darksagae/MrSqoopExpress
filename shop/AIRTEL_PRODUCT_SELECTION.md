# Airtel Uganda - Product Selection Quick Reference

## 🎯 For MrSqoopExpress - SELECT ONLY 2 PRODUCTS

When you see the product list in Airtel Developer Portal, select:

### ✅ SELECT THESE:

```
☑ MERCHANT COLLECTION
  └─ Receive customer payments for orders

☑ Notification API
  └─ Get webhooks when payments happen
```

**That's it!** 

---

## ❌ DO NOT SELECT

Uncheck/Skip ALL of these:

| Category | Products to SKIP |
|----------|-----------------|
| **Loan Products** | Loan lifecycle management, Term loans, Overdraft loans, Loan user KYC |
| **Remittance** | Remittance APIs, Remittance APIs v2, IMT Remittance, Remx |
| **Cash/ATM** | Cash out APIs, ATM withdrawal API |
| **Other** | Topup notification, Account, Billers callback, KYC, IMT callback, Partner portal, Sandbox |

---

## 🚀 Step-by-Step in Portal

When creating your application in https://developers.airtel.africa:

1. **See the products list**
2. **Checkmark** ✅ MERCHANT COLLECTION
3. **Checkmark** ✅ Notification API
4. **Uncheck everything else** (or leave them unchecked)
5. **Click** Save/Create

---

## 📋 Checklist

```
Product Selection Checklist:
☐ Find the products list in Airtel Developer Portal
☐ Select: MERCHANT COLLECTION
☐ Select: Notification API
☐ Verify: Everything else is unchecked
☐ Save/Create Application
☐ Copy credentials to .env.local
☐ Test payment flow
```

---

## ⏭️ Later (Week 3+)

After your shop is working, you can add:
- ✅ **Disbursement APIs** (for refunds & payouts)

---

## 🎓 Why These 2?

| Product | Why? |
|---------|------|
| **MERCHANT COLLECTION** | Core product - this is how you receive customer payments |
| **Notification API** | Know when payments succeed/fail via webhooks |

---

## 🚫 Why NOT the Others?

- **Loan products** → You're not a bank/lending company
- **Remittance APIs** → You're not doing money transfers
- **Cash/ATM APIs** → You're not providing cash withdrawal services
- **Other products** → Not relevant to e-commerce shops

---

**Simple Rule**: Select MERCHANT COLLECTION + Notification API. Everything else is for different business types.

---

**Last Updated**: 2026-07-27
