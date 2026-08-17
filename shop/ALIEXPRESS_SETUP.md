# AliExpress API Integration Guide

## ✅ Your Credentials (Configured)

- **App Key:** 540522
- **App Secret:** Q9x1o3yjwZ0Ds8MAbnaijodGLCjZ9Sow
- **API Status:** Test (Limited API calls)
- **Callback URL:** `https://mrsqoopexpress.com/api/webhooks/aliexpress`

## 🔄 API Endpoints You Now Have

### 1. Products API
```
GET /api/products
```
**Query Parameters:**
- `keyword` - Search keyword (optional)
- `limit` - Number of products (default: 20)
- `mock` - Force mock data (true/false)

**Example:**
```bash
curl http://localhost:3000/api/products?keyword=phone&limit=10
```

**Response:**
```json
[
  {
    "id": "1",
    "title": "Wireless Bluetooth Headphones",
    "price": 25.99,
    "image": "https://ae-pic-a1.aliexpress-media.com/images/S/1-G2-0-d41d8cd98f00b204e9800998ecf8427e.png"
  },
  ...
]
```

### 2. Webhook Endpoint
```
POST /api/webhooks/aliexpress
```
**Headers Required:**
- `x-aliexpress-signature` - HMAC-SHA256 signature

**Events Handled:**
- `order_status_change` - Order status updates
- `product_update` - Product information changes
- `inventory_change` - Stock level changes

### 3. Test Endpoint
```
GET /api/test/aliexpress
POST /api/test/aliexpress
```
**POST Body for Search:**
```json
{
  "action": "search",
  "keyword": "smartphone",
  "limit": 20
}
```

## 📊 Current Status

| Component | Status | Details |
|-----------|--------|---------|
| Development Server | ✅ Running | http://localhost:3000 |
| Products API | ✅ Working | Returns mock data in test mode |
| Webhook Handler | ✅ Ready | Listening at `/api/webhooks/aliexpress` |
| Environment Variables | ✅ Configured | App Key & Secret set |
| AliExpress Test API | ⚠️ Limited | Test mode - limited API calls |

## 🚀 Next Steps

### 1. Test Locally
```bash
# Products API
curl http://localhost:3000/api/products

# With search
curl "http://localhost:3000/api/products?keyword=electronics&limit=5"
```

### 2. Test the Home Page
Visit: `http://localhost:3000`

Click "Fetch Products from AliExpress" button

### 3. Deploy to Vercel
```bash
vercel --prod
```

### 4. Set Environment Variables on Vercel
```bash
vercel env add NEXT_PUBLIC_ALIEXPRESS_APP_KEY
vercel env add ALIEXPRESS_APP_SECRET
```

Or in Vercel Dashboard:
1. Go to Project Settings → Environment Variables
2. Add:
   - `NEXT_PUBLIC_ALIEXPRESS_APP_KEY`: 540522
   - `ALIEXPRESS_APP_SECRET`: Q9x1o3yjwZ0Ds8MAbnaijodGLCjZ9Sow
   - `ALIEXPRESS_API_STATUS`: test

### 5. Configure Webhook in AliExpress
1. Go to AliExpress Open Platform
2. App Settings → Webhooks
3. Set Callback URL: `https://mrsqoopexpress.com/api/webhooks/aliexpress`
4. Subscribe to events:
   - Order Status Change
   - Product Update
   - Inventory Change

## ⚠️ Important Notes

### Test Mode Limitations
Your app is currently in **Test Mode** which means:
- ⚠️ **Limited API calls** - Not unlimited
- ⚠️ **Test data only** - Can't access real products yet
- ✅ Webhooks still work for development
- ✅ Can test callback signatures

### Moving to Production
To access real products, you'll need to:
1. Pass AliExpress verification review
2. Request production API access
3. Comply with AliExpress Terms of Service

### Image Handling
Currently using mock image URLs. For production:
1. Download images from AliExpress API
2. Store in Vercel Blob or similar CDN
3. Serve from your own domain

## 🧪 Testing the Webhook

### Using curl to simulate AliExpress webhook:
```bash
# Create test payload
PAYLOAD='{"event_type":"order_status_change","order_id":"123456","status":"shipped"}'

# Generate HMAC signature
SIGNATURE=$(echo -n "$PAYLOAD" | openssl dgst -sha256 -hmac "Q9x1o3yjwZ0Ds8MAbnaijodGLCjZ9Sow" -hex | sed 's/^.*= //')

# Send to webhook
curl -X POST http://localhost:3000/api/webhooks/aliexpress \
  -H "Content-Type: application/json" \
  -H "x-aliexpress-signature: $SIGNATURE" \
  -d "$PAYLOAD"
```

### Using ngrok for local testing with real AliExpress:
```bash
# Install ngrok
npm install -g ngrok

# Start ngrok tunnel
ngrok http 3000

# Use the ngrok URL as callback in AliExpress:
# https://xxxx-xxxx-xxxx.ngrok.io/api/webhooks/aliexpress
```

## 📚 Useful Resources

- [AliExpress Open Platform](https://open.aliexpress.com/)
- [AliExpress API Documentation](https://open.aliexpress.com/docs)
- [API Explorer](https://open.aliexpress.com/explorer)
- [Webhook Testing with Postman](https://www.postman.com/)

## 🔐 Security Checklist

- ✅ API Secret stored in `.env.local` (not committed)
- ✅ Webhook signature verification implemented
- ✅ Environment variables configured for Vercel
- ✅ CORS not needed (backend-to-backend communication)
- ⚠️ TODO: Add rate limiting
- ⚠️ TODO: Add request logging/monitoring
- ⚠️ TODO: Add error alerts

## Troubleshooting

### Products API returns empty
- Check if running in test mode
- Verify credentials in `.env.local`
- Check browser console for errors
- Try with `?mock=true` parameter

### Webhook not receiving callbacks
- Verify callback URL is correct
- Check webhook logs in AliExpress dashboard
- Ensure ngrok tunnel is running (for local testing)
- Verify HMAC signature implementation

### Images not loading
- Images return 403 for cross-origin
- Solution: Download and host images on Vercel Blob
- Set up image proxy in API route

## Questions?

Check the main [README.md](./README.md) for more details on deployment and setup.
