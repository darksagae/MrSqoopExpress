# Airtel IP Whitelist - Quick Reference

## 🎯 Copy-Paste Ready IP Ranges for Vercel

When configuring IP whitelist in Airtel Developer Portal, add these IPs in order:

### Step 1: Find Your Public IP (for development)

```bash
# Run this command to find your IP
curl -s https://api.ipify.org
# Example output: 203.0.113.42
```

**Add to Airtel portal**: `203.0.113.42/32` (your public IP)

---

### Step 2: Add Vercel IP Ranges (for production)

**Copy-paste these 14 IP ranges into Airtel portal** (one per line):

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

---

## 📋 Where to Add in Airtel Portal

1. Login: https://developers.airtel.africa
2. Go to: **My Apps** → **[MrSqoopExpress]** → **Settings**
3. Find: **IP Whitelist** or **Allowed IPs**
4. **Enable** the feature (checkbox)
5. **Add** each IP/range above
6. **Save**

---

## ✅ Checklist

```
Development (Week 1-2):
☐ Get public IP: curl -s https://api.ipify.org
☐ Add: 203.0.113.42/32 (replace with your IP)
☐ Enable whitelist
☐ Test API call

Production (Week 3+):
☐ Add 14 Vercel IP ranges above
☐ Enable whitelist
☐ Deploy to Vercel
☐ Test payment
```

---

## 🚀 Quick Setup (Copy-Paste Steps)

### In Airtel Developer Portal:

**Step 1: Enable Whitelist**
- Find: Settings → IP Whitelist
- Check: ☑ Enable IP Whitelist

**Step 2: Add Your Development IP (Replace 203.0.113.42 with your actual IP)**
```
203.0.113.42/32
```

**Step 3: Add Vercel Production IPs**
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

**Step 4: Save**

---

## ⚡ Commands to Run

```bash
# 1. Find your public IP (for development)
curl -s https://api.ipify.org

# 2. Test if API works (after adding whitelist)
curl -X POST https://uat.airtel.africa/merchant/v1/payments/ \
  -H "Authorization: Bearer $AIRTEL_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"reference":"TEST","subscriber":{"msisdn":"256701234567"},"transaction":{"amount":100,"currency":"UGX","id":"txn_test"},"merchant":{"code":"MRSQOOP","name":"MrSqoopExpress"}}'
```

---

## 🎓 What Each Range Means

| IP Range | Location | Purpose |
|----------|----------|---------|
| 76.76.19-22.0/24 | Vercel US East | API calls from US East |
| 76.76.112-115.0/24 | Vercel US West | API calls from US West |
| 76.76.48-51.0/24 | Vercel Europe | API calls from Europe |
| 185.254.30-31.0/24 | Vercel Functions | Serverless functions |
| 203.0.113.42/32 | Your Machine | Development testing |

---

## 🐛 Troubleshooting

### "Access Denied" or "Unauthorized"
```
1. Check your IP: curl -s https://api.ipify.org
2. Verify it's in whitelist
3. If not, add it
4. Wait 5 minutes
5. Test again
```

### "Works locally but not on Vercel"
```
1. Add all 14 Vercel IP ranges above
2. Make sure whitelist is ENABLED
3. Deploy to Vercel
4. Test
```

### "ISP changed my IP"
```
1. Find new IP: curl -s https://api.ipify.org
2. Remove old IP from whitelist
3. Add new IP
4. Test
```

---

## 📍 Summary

**Minimum IPs to add**:

For **development only**:
- Your public IP: `203.0.113.42/32` (replace with your actual IP)

For **production on Vercel**:
- All 14 Vercel IP ranges (copy-pasted above)

For **maximum security**:
- Enable whitelist
- Add ONLY trusted IPs
- Monitor logs
- Update monthly

---

**That's it!** Copy the 14 IP ranges above into your Airtel portal settings.

For detailed info, see: **AIRTEL_IP_WHITELIST.md**

**Last Updated**: 2026-07-27
