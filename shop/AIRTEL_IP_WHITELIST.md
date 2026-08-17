# Airtel Uganda - IP Whitelisting Security Configuration

This guide explains how to configure IP whitelisting in your Airtel Developer application for maximum security.

## 🔒 What is IP Whitelisting?

IP whitelisting restricts API access to only specific IP addresses. If a request comes from an IP address NOT on your whitelist, Airtel will reject it - even if credentials are correct.

**Benefit**: Prevents unauthorized access to your payment APIs even if someone steals your API key.

---

## 📋 IPs to Whitelist for MrSqoopExpress

### 1. LOCAL DEVELOPMENT (Your Computer)

Find your current IP address:

**Windows (Command Prompt)**:
```bash
ipconfig
# Look for "IPv4 Address" (e.g., 192.168.1.100 or your public IP)
```

**Mac/Linux (Terminal)**:
```bash
curl -s https://api.ipify.org
# Returns your public IP (e.g., 203.0.113.42)
```

**For testing locally**:
- Use your **public IP address** (not 192.168.x.x)
- Find it: https://whatismyip.com or `curl https://api.ipify.org`

### 2. VERCEL PRODUCTION (Your Deployed App)

Vercel has multiple data centers. Whitelist these Vercel IP ranges:

**Vercel Edge Network IPs** (North America & Europe):
```
# US East
76.76.19.0/24
76.76.20.0/24
76.76.21.0/24
76.76.22.0/24

# US West
76.76.112.0/24
76.76.113.0/24
76.76.114.0/24
76.76.115.0/24

# Europe
76.76.48.0/24
76.76.49.0/24
76.76.50.0/24
76.76.51.0/24
```

**Vercel Functions (Default Runtime)**:
```
# Vercel's primary function execution IPs
185.254.30.0/24
185.254.31.0/24
```

**Alternative: Use Vercel's documented IP ranges**:
Visit: https://vercel.com/docs/concepts/edge-network/regions-and-providers
Look for "Vercel Edge Network IPs"

### 3. NGROK (For Testing Webhooks Locally)

If using ngrok for webhook testing:

**Ngrok's server IPs** (these are static):
```
ngrok.io servers are hosted on AWS, so whitelist:
# Check: https://ngrok.com/docs/secure-tunnels/ngrok-agents/ngrok-agent/
# Or use your ngrok agent's outbound IP

# Quick way: When you run ngrok, it shows the forwarding URL
# Example: https://abc123.ngrok.io

# Whitelist the IP shown by: curl -s https://api.ipify.org
# (while running ngrok)
```

---

## 📍 Where to Configure in Airtel Portal

### Step-by-Step: Add Whitelisted IPs

1. **Login** to https://developers.airtel.africa
2. **Navigate** to **My Apps** → **[MrSqoopExpress]**
3. **Go to** Settings or API Settings (location may vary)
4. **Find** "IP Whitelist" or "Allowed IPs" section
5. **Click** "+ Add IP Address" or "+ Add IP Range"
6. **Enter** IP address or CIDR range
7. **Save**

### Configuration in Portal

```
Security Settings:
├── IP Whitelisting
│   ├── ☑ Enable IP Whitelist
│   ├── IP/CIDR Range 1: [Your Local Public IP]
│   ├── IP/CIDR Range 2: 76.76.19.0/24 (Vercel US East)
│   ├── IP/CIDR Range 3: 76.76.20.0/24 (Vercel US East)
│   └── ... (add other Vercel ranges)
│
└── Save Settings
```

---

## 🎯 Recommended Configuration Timeline

### Phase 1: Local Development (Week 1-2)

**Whitelist**:
```
Your public IP: 203.0.113.42 (example)
Ngrok test IP: When you run ngrok, note its IP and add it
```

**Find your IP**:
```bash
# Option 1: Online tool
https://whatismyip.com

# Option 2: Command line
curl -s https://api.ipify.org

# Option 3: When using ngrok
# It shows in the terminal output
```

### Phase 2: Staging Deployment (Week 2-3)

**Whitelist**:
```
Your public IP: 203.0.113.42 (still testing)
Vercel staging IPs: (get from Vercel docs)
```

### Phase 3: Production Deployment (Week 3+)

**Whitelist**:
```
Vercel production IPs: All Vercel ranges
Your local IP: Only if you'll debug from home
Backup IPs: Optional additional IPs
```

---

## 📝 IP Configuration Format

### Single IP Address
```
203.0.113.42
```
(Allows only this single IP)

### CIDR Range
```
76.76.19.0/24
```
(Allows 76.76.19.0 to 76.76.19.255)

### Multiple Entries
```
203.0.113.42
76.76.19.0/24
76.76.20.0/24
185.254.30.0/24
```
(Add each one separately in Airtel portal)

---

## 🚀 Complete IP Whitelist for MrSqoopExpress

### DEVELOPMENT Setup (Week 1-2)

```env
# Local machine (replace with your actual public IP)
WHITELISTED_IPS_DEV=203.0.113.42/32

# Ngrok test server (when using ngrok)
WHITELISTED_IPS_NGROK=ngrok_ip_shown_in_terminal/32
```

**Add to Airtel Portal**:
```
☑ IP Whitelisting Enabled

IP Addresses:
1. 203.0.113.42/32
2. [Your ngrok test IP]/32
```

### PRODUCTION Setup (Vercel)

```env
# Vercel US East
76.76.19.0/24
76.76.20.0/24
76.76.21.0/24
76.76.22.0/24

# Vercel US West
76.76.112.0/24
76.76.113.0/24
76.76.114.0/24
76.76.115.0/24

# Vercel Europe
76.76.48.0/24
76.76.49.0/24
76.76.50.0/24
76.76.51.0/24

# Vercel Functions
185.254.30.0/24
185.254.31.0/24

# Your office/home IP (optional, for debugging)
203.0.113.42/32
```

**Add all to Airtel Portal**:
```
☑ IP Whitelisting Enabled

IP Addresses:
1. 76.76.19.0/24
2. 76.76.20.0/24
3. 76.76.21.0/24
4. 76.76.22.0/24
5. 76.76.112.0/24
6. 76.76.113.0/24
7. 76.76.114.0/24
8. 76.76.115.0/24
9. 76.76.48.0/24
10. 76.76.49.0/24
11. 76.76.50.0/24
12. 76.76.51.0/24
13. 185.254.30.0/24
14. 185.254.31.0/24
15. 203.0.113.42/32 (optional: your IP)
```

---

## 🧪 Testing Your Whitelist Configuration

### Test 1: From Whitelisted IP

```bash
# From your home/office IP
curl -X POST https://uat.airtel.africa/merchant/v1/payments/ \
  -H "Authorization: Bearer $AIRTEL_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"...": "..."}'

# Expected: ✅ SUCCESS (200)
```

### Test 2: From Non-Whitelisted IP

```bash
# Use a VPN or proxy to test from different IP
# Expected: ❌ REJECTED (403 Forbidden or similar)
```

### Test 3: Vercel Deployment

```bash
# Deploy to Vercel
vercel --prod

# Make a payment from your shop
# Expected: ✅ SUCCESS (Vercel IP is whitelisted)

# If fails, check:
# 1. Vercel IPs are whitelisted
# 2. No typos in IP ranges
# 3. Whitelist is actually enabled in Airtel portal
```

---

## 🆘 Troubleshooting IP Whitelist Issues

### Issue: "Unauthorized" or "Access Denied"

**Possible Causes**:
1. ❌ Your IP is not whitelisted
2. ❌ Whitelist feature is disabled
3. ❌ Wrong CIDR notation (e.g., /24 instead of /32)
4. ❌ IP address changed (ISP changed your IP)

**Solution**:
```bash
# 1. Check your current IP
curl -s https://api.ipify.org

# 2. Verify it's in Airtel whitelist
# Check Airtel Developer Portal → Settings → IP Whitelist

# 3. Add missing IP if needed
# Re-add to Airtel portal

# 4. Wait 5 minutes for changes to propagate
```

### Issue: "Works Locally But Not on Vercel"

**Cause**: Vercel IP not whitelisted

**Solution**:
```
1. Add Vercel IP ranges to whitelist
2. Verify all 14 Vercel ranges are added
3. Redeploy to Vercel
4. Test again
```

### Issue: "Works on Vercel But Not Locally"

**Cause**: Your local IP not whitelisted

**Solution**:
```
1. Get your public IP: curl -s https://api.ipify.org
2. Add to Airtel whitelist
3. Test from local dev server
```

### Issue: ISP Changed Your IP

**Happens When**: You restart your router or ISP reassigns

**Prevention**:
```
Option 1: Use static IP from ISP
Option 2: Whitelist your entire ISP range (e.g., /16 or /20)
Option 3: Use VPN with static IP
Option 4: Only use Vercel in production (recommended)
```

---

## 📊 IP Whitelist Checklist

### Development Phase

```
☐ Find your public IP: https://whatismyip.com
☐ Add your IP to Airtel whitelist
☐ Test API call from your machine
☐ Verify success (HTTP 200)

☐ Setup ngrok for webhook testing
☐ Note ngrok's IP address
☐ Add ngrok IP to whitelist
☐ Test webhook delivery
```

### Before Production Deployment

```
☐ Get Vercel IP ranges
☐ Add all Vercel US East ranges (4 IPs)
☐ Add all Vercel US West ranges (4 IPs)
☐ Add all Vercel Europe ranges (4 IPs)
☐ Add Vercel Functions ranges (2 IPs)
☐ Total: 14+ IP ranges whitelisted

☐ Verify whitelist is ENABLED
☐ Test payment from staging
☐ Deploy to production
☐ Test payment from production
☐ Monitor for rejections
```

### After Production Launch

```
☐ Monitor API logs for rejected requests
☐ Check if any legitimate IPs are being blocked
☐ Add missing IPs if needed
☐ Update whitelist documentation
☐ Review whitelist quarterly
```

---

## 🔄 Updating Your IP Whitelist

### When to Update

```
Event                           | Action
─────────────────────────────────────────────────────────
Changed ISP                     | Update to new IP
Moved office                    | Update office IP
Added new Vercel region         | Add new IP range
Switched payment processing     | Add new provider IP
Testing with new VPN            | Add VPN exit IP
```

### How to Update

1. **Login** to Airtel Developer Portal
2. **Go to** Settings → IP Whitelist
3. **Remove** old IP (if applicable)
4. **Add** new IP
5. **Save**
6. **Wait** 5 minutes for propagation
7. **Test**

---

## 🎯 Recommended IP Whitelist Strategy

### SAFE (Recommended)
```
✅ Enable IP whitelist
✅ Whitelist only Vercel IPs (production)
✅ Whitelist only your office IP (development)
✅ Rotate credentials monthly
✅ Monitor access logs
```

### MODERATE
```
✅ Enable IP whitelist
✅ Whitelist Vercel IPs
✅ Whitelist your home IP
⚠️ Whitelist ISP range (larger range)
✅ Monitor access logs
```

### RISKY (NOT RECOMMENDED)
```
❌ Disable IP whitelist
❌ Whitelist 0.0.0.0/0 (everyone)
❌ Only rely on API key
❌ No log monitoring
```

---

## 📞 Getting Help

### From Airtel

If you're unsure about IP whitelisting:

1. **Check Docs**: https://developer.airtel.africa/docs
2. **Contact Support**: developer-support@airtel.africa
3. **Example Email**:
```
Subject: Help with IP Whitelisting Configuration

I'm setting up IP whitelist for my application MrSqoopExpress.
Should I whitelist individual IPs or CIDR ranges?
For Vercel deployment, which IP ranges should I use?

Thanks!
```

### From Vercel

If unsure about Vercel IPs:

1. **Check Docs**: https://vercel.com/docs/concepts/edge-network/regions-and-providers
2. **Contact Support**: support@vercel.com
3. **Vercel Dashboard**: Look under "Deployment" → "Network" (if available)

---

## ✅ Quick Reference Table

| Environment | IP/Range | Status |
|------------|----------|--------|
| Your Home | 203.0.113.42/32 | ✅ Add for dev |
| Your Office | 203.0.113.50/32 | ✅ Add if needed |
| Vercel US East | 76.76.19-22.0/24 | ✅ Add for prod |
| Vercel US West | 76.76.112-115.0/24 | ✅ Add for prod |
| Vercel Europe | 76.76.48-51.0/24 | ✅ Add for prod |
| Vercel Functions | 185.254.30-31.0/24 | ✅ Add for prod |
| Ngrok (test) | Dynamic | ✅ Add during test |
| Everyone (0.0.0.0/0) | 0.0.0.0/0 | ❌ NEVER |

---

## 🚀 Implementation Order

### Week 1-2: Local Development
1. Find your public IP
2. Add to Airtel whitelist
3. Enable whitelist feature
4. Test API calls locally
5. Set up ngrok for webhooks
6. Add ngrok IP to whitelist

### Week 2-3: Staging
1. Get Vercel staging IPs (if different from production)
2. Add to whitelist
3. Deploy to Vercel staging
4. Test payment flow
5. Verify webhooks work

### Week 3+: Production
1. Add all Vercel production IPs
2. Double-check all ranges
3. Enable whitelist (if not already)
4. Deploy to Vercel production
5. Make test payment
6. Monitor logs for 24 hours
7. Document whitelist in your records

---

## 📝 Whitelist Documentation Template

Save this in your project:

```markdown
# Airtel Whitelist Configuration - MrSqoopExpress

## Enabled
- [ ] IP Whitelist: ENABLED
- [ ] API Signature Verification: ENABLED
- [ ] Webhook Signature Verification: ENABLED

## Whitelisted IPs
- 76.76.19.0/24 (Vercel US East)
- 76.76.20.0/24 (Vercel US East)
- 76.76.21.0/24 (Vercel US East)
- 76.76.22.0/24 (Vercel US East)
- [continue with all ranges...]

## Last Updated
- Date: 2026-07-27
- Updated by: [Your Name]
- Changes: Initial production setup

## Next Review
- Date: 2026-08-27 (monthly review)
```

---

**Key Takeaway**: IP whitelisting is a critical security layer. Always enable it and keep the whitelist up-to-date!

**Last Updated**: 2026-07-27
