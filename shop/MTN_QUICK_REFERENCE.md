# MTN Collection Widget - Quick Reference

Your MTN credentials and quick setup guide.

## 🎯 Your MTN Credentials

```
Product: Collection Widget (receive mobile money payments)
Primary Key: <YOUR_MTN_PRIMARY_KEY>
Secondary Key: <YOUR_MTN_SECONDARY_KEY>
Country: Uganda
Currency: UGX
```

---

## ⚠️ SECURITY WARNING

**NEVER share these keys!**
- ❌ Don't commit to GitHub
- ❌ Don't share in Slack/emails
- ❌ Don't hardcode in code
- ✅ Keep in `.env.local` only
- ✅ Use `.gitignore` to exclude .env.local
- ✅ Set in Vercel dashboard for production

---

## 🔧 Add to `.env.local`

Copy this to `shop/.env.local`:

```env
# ===== MTN COLLECTION WIDGET =====
MTN_PRIMARY_KEY=<YOUR_MTN_PRIMARY_KEY>
MTN_SECONDARY_KEY=<YOUR_MTN_SECONDARY_KEY>
MTN_MERCHANT_CODE=MRSQOOP
MTN_MERCHANT_NAME=MrSqoopExpress
MTN_CURRENCY=UGX
MTN_COUNTRY=UG

# API Endpoints
MTN_API_ENDPOINT=https://sandbox.momodeveloper.mtn.com/collection/v1_0
# Production (later):
# MTN_API_ENDPOINT=https://api.momodeveloper.mtn.com/collection/v1_0

# Webhook
MTN_CALLBACK_URL=http://localhost:3000/api/webhooks/payments/mtn

# Use Primary Key as API Key
MTN_API_KEY=<YOUR_MTN_PRIMARY_KEY>
MTN_API_SECRET=<YOUR_MTN_SECONDARY_KEY>
```

---

## 🔐 IP Whitelisting

### Add These IPs to MTN Portal

**Your Development IP:**
```bash
# Find it:
curl -s https://api.ipify.org

# Add to MTN: [result]/32
# Example: 203.0.113.42/32
```

**Vercel Production IPs (copy all 14):**
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

**Steps:**
1. Go to: https://momodeveloper.mtn.com
2. Settings or Security Settings
3. IP Whitelist section
4. ☑ Enable IP Whitelist
5. Add your dev IP
6. Add all 14 Vercel ranges
7. Save

---

## 🚀 Quick Setup (Copy-Paste Commands)

### 1. Update Environment
```bash
cd shop
# Edit .env.local and add credentials above
```

### 2. Test Connection
```bash
# Replace with your public IP
curl -s https://api.ipify.org

# Test MTN API
curl -X POST http://localhost:3000/api/payments/mtn/initiate \
  -H "Content-Type: application/json" \
  -d '{
    "orderId": "TEST-001",
    "amount": 500,
    "customerPhone": "256701234567"
  }'
```

### 3. Start Development
```bash
npm run dev
# Server starts at http://localhost:3000
```

### 4. Test Webhook (in another terminal)
```bash
curl -X POST http://localhost:3000/api/webhooks/payments/mtn \
  -H "Content-Type: application/json" \
  -d '{
    "externalId": "TEST-001",
    "amount": "500",
    "currency": "UGX",
    "transactionStatus": "SUCCESSFUL",
    "financialTransactionId": "mtn_123"
  }'
```

---

## 📊 API Endpoints

### Sandbox (Testing)
```
Base: https://sandbox.momodeveloper.mtn.com/collection/v1_0
Request Payment: POST /requesttopay
Check Status: GET /requesttopay/{reference_id}
```

### Production (Live)
```
Base: https://api.momodeveloper.mtn.com/collection/v1_0
(Same endpoints, just different domain)
```

---

## 💡 Key Information

| Item | Value |
|------|-------|
| **Product** | Collection Widget |
| **Payment Type** | USSD + QR Code |
| **Primary Key** | 94a80678... |
| **Secondary Key** | cff21631... |
| **Currency** | UGX |
| **Country** | Uganda |
| **Portal** | https://momodeveloper.mtn.com |
| **Environment** | Sandbox (testing) |

---

## 📋 Implementation Files

| File | Purpose |
|------|---------|
| **MTN_COLLECTION_SETUP.md** | Complete setup guide (read this!) |
| **MTN_QUICK_REFERENCE.md** | This file (quick reference) |
| **AIRTEL_MTN_PRODUCT_COMPARISON.md** | Compare Airtel vs MTN |
| **PAYMENT_INTEGRATION_SUMMARY.md** | Overview of both providers |

---

## ✅ Checklist

```
Setup:
☐ Credentials copied from MTN portal
☐ Added to .env.local
☐ IP whitelist configured
☐ Development IP added
☐ Vercel IPs added (all 14)

Development:
☐ Payment API created
☐ Webhook handler created
☐ Payment button created
☐ Tested locally with curl
☐ Tested webhook with curl

Testing:
☐ Tested in sandbox environment
☐ All error cases tested
☐ Ready for staging

Deployment:
☐ Deploy to Vercel staging
☐ Test end-to-end
☐ Deploy to production
☐ Verify IP whitelist
☐ Make test payment
```

---

## 🎯 Next Steps

1. **Right now:**
   - [ ] Copy credentials to `.env.local`
   - [ ] Configure IP whitelist in MTN portal

2. **Today:**
   - [ ] Read: MTN_COLLECTION_SETUP.md
   - [ ] Create payment API
   - [ ] Create webhook handler

3. **This week:**
   - [ ] Test locally
   - [ ] Test in staging
   - [ ] Deploy to production

---

## 📞 MTN Support

- **Portal:** https://momodeveloper.mtn.com
- **Dashboard:** Check for API logs, webhook delivery status
- **Documentation:** Available in portal

---

## 🔄 Primary vs Secondary Key

**When to use:**
- **Primary:** Normal API calls (production)
- **Secondary:** Backup if primary is compromised

**For now:** Use Primary key in everything

**If compromised:** Switch to Secondary in .env while you regenerate Primary

---

## ⚡ Test Phone Numbers

Use these for testing in sandbox:

```
Test Numbers (for sandbox):
- 256701234567 (MTN Uganda)
- 256702345678 (Alternative test)

Test PIN/Code:
- 0000 (usually works in sandbox)

Test Amounts:
- Any amount (won't actually charge)
- Try: 100, 500, 1000, 5000 UGX
```

---

**Your MTN setup is ready!** 🎉

Next: Follow **MTN_COLLECTION_SETUP.md** for complete implementation

Last Updated: 2026-07-27
