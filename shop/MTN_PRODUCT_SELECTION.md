# MTN Mobile Money - Product Selection Quick Reference

For MrSqoopExpress Uganda, here's which MTN products to select.

## 🎯 For MrSqoopExpress - SELECT ONLY 2 PRODUCTS

From the MTN products list, select **ONLY these 2**:

### ✅ SELECT:
1. **Collection** ← Your #1 product
   - Receive customer payments for orders
   - Customer → Your Wallet (UGX)

2. **Sandbox** ← Testing environment
   - For development and testing
   - (Usually auto-included, but verify it's enabled)

### ⏭️ SELECT LATER (Week 3+):
3. **Disbursements** (Optional)
   - For refunding customers
   - For paying staff/suppliers
   - Add after Collection is working

### ❌ DO NOT SELECT:
- ❌ **Remittance** - For international money transfers (not your shop)
- ❌ **User provisioning** - For user account management (not needed initially)

---

## 📋 Why These Products?

| Product | For E-Commerce? | Purpose |
|---------|-----------------|---------|
| **Collection** | ✅ YES | Receive customer payments |
| **Sandbox** | ✅ YES | Testing environment |
| **Disbursements** | ⏭️ LATER | Refunds & payouts |
| **Remittance** | ❌ NO | Money transfers (not for shops) |
| **User provisioning** | ❌ NO | User account setup (not needed) |

---

## 🚀 Step-by-Step: Selecting Products

When you see the MTN products list:

1. **Check**: ✅ Collection
2. **Check**: ✅ Sandbox
3. **Leave unchecked**: Remittance
4. **Leave unchecked**: User provisioning
5. **Leave unchecked**: Disbursements (for now)
6. **Save/Create Application**

---

## ⏭️ After Week 2 (Add Disbursements)

Once Collection is working and generating revenue:

1. **Add**: ✅ Disbursements
   - For customer refunds
   - For staff payouts
   - For supplier payments

---

## 📊 Comparison: Airtel vs MTN

| Feature | Airtel | MTN |
|---------|--------|-----|
| **Core Payment Product** | MERCHANT COLLECTION | Collection |
| **Notification** | Notification API | (Included in Collection) |
| **Refunds/Payouts** | Disbursement APIs | Disbursements |
| **Transfers** | (Included) | Remittance |
| **Testing** | Sandbox (separate) | Sandbox (product) |
| **User Management** | KYC (separate) | User provisioning |

---

## ✅ Quick Checklist

```
Product Selection for MTN:
☑ Collection (MUST)
☑ Sandbox (MUST)
☐ Disbursements (Later)
☐ Remittance (Skip)
☐ User provisioning (Skip)
```

---

## 🔄 Timeline

### Week 1-2: Development
```
SELECT:
✅ Collection
✅ Sandbox

TEST:
- Payment initiation
- Webhook reception
- Signature verification
```

### Week 3+: Enhancement
```
ADD:
✅ Disbursements

IMPLEMENT:
- Refund functionality
- Staff payout system
```

---

## 📝 MTN vs Airtel Summary

### Airtel
- MERCHANT COLLECTION (payment collection)
- Notification API (webhooks)
- Disbursement APIs (refunds)

### MTN
- Collection (payment collection)
- Sandbox (testing)
- Disbursements (refunds)
- Remittance (money transfers)
- User provisioning (user management)

**For your shop**: Only need Collection initially. Add Disbursements later if you need refunds.

---

**Last Updated**: 2026-07-27
