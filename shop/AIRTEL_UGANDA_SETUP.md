# Airtel Uganda - Setup Quick Reference

## 🇺🇬 Uganda-Specific Configuration

### Portal & Resources

| Resource | URL |
|----------|-----|
| **Developer Portal** | https://developers.airtel.africa |
| **API Docs** | https://developer.airtel.africa/docs |
| **Community Forum** | https://developers.airtel.africa (logged in) |
| **Support** | developer-support@airtel.africa |
| **Status** | https://status.airtel.africa |

### API Configuration for Uganda

| Setting | Value |
|---------|-------|
| **Country** | Uganda (UG) |
| **Currency** | UGX (Uganda Shilling) |
| **Phone Format** | 256XXXXXXXXX (12 digits) |
| **Production Base URL** | `https://api.airtel.africa/merchant/v1/` |
| **Sandbox Base URL** | `https://uat.airtel.africa/merchant/v1/` |

## 📝 Environment Variables for Uganda

Copy this to your `shop/.env.local`:

```env
# ===== AIRTEL UGANDA CONFIGURATION =====
AIRTEL_API_KEY=your_airtel_api_key
AIRTEL_API_SECRET=your_airtel_api_secret
AIRTEL_MERCHANT_CODE=MRSQOOP
AIRTEL_MERCHANT_NAME=MrSqoopExpress
AIRTEL_WEBHOOK_SECRET=your_webhook_secret
AIRTEL_COUNTRY=UG
AIRTEL_CURRENCY=UGX

# Start with SANDBOX for testing
AIRTEL_API_ENDPOINT=https://uat.airtel.africa/merchant/v1/
AIRTEL_CALLBACK_URL=http://localhost:3000/api/webhooks/payments/airtel-mtn

# Switch to PRODUCTION when ready
# AIRTEL_API_ENDPOINT=https://api.airtel.africa/merchant/v1/
# AIRTEL_CALLBACK_URL=https://your-domain.com/api/webhooks/payments/airtel-mtn
```

## 🚀 Registration Steps

### 1. Access Developer Portal
- Go to: https://developers.airtel.africa
- Click **Sign Up**

### 2. Create Account
- Email: Your business email
- Password: Strong password
- Business Name: MrSqoopExpress
- Country: **Uganda**

### 3. Complete KYC Verification
- Upload business registration documents
- Upload business license
- Upload ID documents
- Wait for approval (24-48 hours)

### 4. Create Application
1. Go to **My Apps** → **Create New Application**
2. Application Name: `MrSqoopExpress`
3. Application Type: `Merchant`
4. Country: **Uganda**
5. Currency: **UGX**
6. Callback URL: `https://your-domain.com/api/webhooks/payments/airtel-mtn`

### 5. Get Credentials
1. Go to **My Apps** → Your Application
2. Copy the following to `.env.local`:
   - **API Key** (looks like: `prod_xxxxx...`)
   - **API Secret**
   - **Merchant Code**
3. Go to **Webhooks** tab:
   - Copy **Webhook Secret**

## 💰 Phone Number Validation for Uganda

All customer phone numbers must be:
- **Format**: `256XXXXXXXXX`
- **Length**: 12 digits
- **Prefix**: `256` (Uganda country code)
- **Operators**: 
  - Airtel: 256701-706, 256775-778
  - MTN: 256701-703, 256770-774
  - Vodafone: 256704-705, 256780-781
  - Others: Various ranges

### Validation Code
```javascript
function validateUgandaPhone(phone) {
  const clean = phone.replace(/\D/g, '');
  
  // Must be 12 digits starting with 256
  if (!/^256\d{9}$/.test(clean)) {
    throw new Error('Invalid Uganda phone number. Format: 256XXXXXXXXX');
  }
  
  // Optional: Check if Airtel number
  const airtelPrefixes = ['256701', '256702', '256703', '256704', '256705', '256706', '256775', '256776', '256777', '256778'];
  const prefix = clean.substring(0, 6);
  
  if (!airtelPrefixes.includes(prefix)) {
    console.warn('Note: This may not be an Airtel number, but API will accept it');
  }
  
  return clean;
}
```

## 🧪 Testing in Uganda

### Test Credentials (Sandbox)
```
API Key: (from your sandbox app)
API Secret: (from your sandbox app)
Test Phone: 256701234567
Test PIN: 0000
Test Amount: 100-10000 UGX
```

### Test Workflow
```bash
# 1. Start dev server
cd shop
npm run dev

# 2. Start ngrok for webhooks
ngrok http 3000
# Note the URL: https://abc123.ngrok.io

# 3. Update webhook URL
# In .env.local:
AIRTEL_CALLBACK_URL=https://abc123.ngrok.io/api/webhooks/payments/airtel-mtn

# 4. Register webhook in Airtel Dashboard
# My Apps → [Your App] → Webhooks
# Add the ngrok URL above

# 5. Test payment
curl -X POST http://localhost:3000/api/payments/airtel/initiate \
  -H "Content-Type: application/json" \
  -d '{
    "orderId": "TEST-001",
    "amount": 500,
    "customerPhone": "256701234567"
  }'
```

## 📊 Currency Conversion

For international customers, use this rate:

```env
# Update daily for best rates
NEXT_PUBLIC_USD_TO_UGX_RATE=3700
```

**Current Rates (as of 2026):**
- 1 USD = ~3,600-3,800 UGX
- 1 GBP = ~4,500-4,800 UGX
- 1 EUR = ~4,000-4,300 UGX

Update these regularly in your `.env.local` or database.

## ✅ Pre-Launch Checklist

Before going live with Uganda:

- [ ] Developer account created on https://developers.airtel.africa
- [ ] KYC verification approved
- [ ] Application created (Country: Uganda)
- [ ] API Key and Secret copied to `.env.local`
- [ ] Webhook Secret copied
- [ ] Phone validation working (256XXXXXXXXX format)
- [ ] Tested payment initiation in sandbox
- [ ] Tested webhook reception with ngrok
- [ ] Tested signature verification
- [ ] Tested with actual Airtel Uganda numbers
- [ ] Tested error handling
- [ ] Database schema ready
- [ ] Email notifications configured
- [ ] Logging and monitoring set up
- [ ] Switched AIRTEL_API_ENDPOINT to production
- [ ] Deployed to Vercel with production credentials
- [ ] Made test payment with small amount (100-500 UGX)
- [ ] Verified order status updated
- [ ] Verified customer email received
- [ ] Verified admin notification received

## 🐛 Troubleshooting Uganda-Specific Issues

### Issue: "Invalid Phone Number"
```
❌ Error: Phone validation failed
✅ Solution: Ensure format is exactly 256XXXXXXXXX (12 digits)
✅ Check: No spaces, dashes, or parentheses
✅ Example: 256701234567 ✓, 256-701-234-567 ✗
```

### Issue: "API Endpoint Not Responding"
```
❌ Error: Connection timeout to Airtel API
✅ Solution: Verify you're using correct URL:
   - Sandbox: https://uat.airtel.africa/merchant/v1/
   - Production: https://api.airtel.africa/merchant/v1/
✅ Check: Your internet connection is working
✅ Check: Airtel API status page: https://status.airtel.africa
```

### Issue: "Authentication Failed"
```
❌ Error: API key or secret invalid
✅ Solution: Copy credentials directly from Developer Portal
✅ Check: No extra spaces in .env.local
✅ Restart: Restart dev server after updating .env.local
```

### Issue: "Webhook Not Received"
```
❌ Error: Webhook deliveries showing failed in dashboard
✅ Solution: Register webhook URL in Developer Portal:
   My Apps → [Your App] → Webhooks → Add webhook
✅ Solution: If testing locally, use ngrok:
   ngrok http 3000
   Update AIRTEL_CALLBACK_URL with ngrok URL
✅ Check: Webhook URL is publicly accessible
```

## 📞 Support Contacts

### Airtel Developer Support
- **Email**: developer-support@airtel.africa
- **Portal**: https://developers.airtel.africa
- **Community**: https://developers.airtel.africa (forum)

### Airtel Uganda Customer Service
- **Phone**: +256-800-200-200 (toll-free)
- **Website**: https://www.airtel.ug
- **Support**: https://www.airtel.ug/support

### Useful Links
- [Airtel Uganda Homepage](https://www.airtel.ug)
- [Airtel Money Services](https://www.airtel.ug/about-us/airtel-money)
- [Developer Documentation](https://developer.airtel.africa/docs)

## 🚨 Important Notes for Uganda Operations

1. **Currency**: Always use UGX (Uganda Shilling) in API requests
2. **Phone Numbers**: Must include Uganda country code (256)
3. **Tax Compliance**: Keep records for Ugandan tax authorities
4. **Compliance**: Ensure adherence to Uganda's Payment Systems Regulations
5. **KYC**: Complete customer KYC as per NIRA guidelines where applicable
6. **Rates**: Update USD to UGX rates daily for accurate pricing
7. **Support**: Contact Airtel developer support via email for Uganda-specific issues

## 📋 Next Steps

1. ✅ Go to https://developers.airtel.africa
2. ✅ Sign up with your business email
3. ✅ Complete KYC verification
4. ✅ Create application (select Uganda)
5. ✅ Copy credentials to `.env.local`
6. ✅ Follow AIRTEL_QUICK_START.md for implementation
7. ✅ Test in sandbox with ngrok
8. ✅ Deploy to production

---

**Last Updated:** 2026-07-27  
**Region:** Uganda  
**Status:** Ready to implement
