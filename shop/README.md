# MrSqoopExpress - AliExpress Dropshipping Platform

A Next.js-powered dropshipping platform that integrates with the AliExpress API for product management and order synchronization.

## Features

- 🛍️ Product catalog integration with AliExpress
- 🔄 Real-time webhook callbacks for order updates
- 📦 Image management and storage
- 💰 Price and inventory synchronization
- 🚀 Deployed on Vercel with custom domain support

## Setup Instructions

### 1. Prerequisites

- Node.js 18+ installed
- npm or yarn package manager
- AliExpress API credentials

### 2. Environment Variables

Create a `.env.local` file in the root directory and add:

```env
NEXT_PUBLIC_ALIEXPRESS_APP_KEY=your_app_key_here
ALIEXPRESS_APP_SECRET=your_app_secret_here
ALIEXPRESS_API_ENDPOINT=https://api.aliexpress.com
NEXT_PUBLIC_API_URL=https://mrsqoopexpress.com
```

### 3. Install Dependencies

```bash
npm install
```

### 4. Development

Start the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### 5. Build for Production

```bash
npm run build
npm start
```

## API Routes

### Webhooks

**POST** `/api/webhooks/aliexpress`
- Receives callbacks from AliExpress
- Handles order status changes, product updates, inventory changes
- Requires HMAC signature verification

**Callback URL for AliExpress Registration:**
```
https://mrsqoopexpress.com/api/webhooks/aliexpress
```

### Products

**GET** `/api/products`
- Query Parameters:
  - `keyword`: Search keyword (optional)
  - `limit`: Number of products to fetch (default: 20)
- Returns: Array of product objects

## Getting AliExpress API Credentials

1. Go to [AliExpress Open Platform](https://open.aliexpress.com/)
2. Register as a seller/developer
3. Create a new application with:
   - **App Name:** MrSqoopExpress Dropshipping
   - **App Description:** Dropshipping platform for importing and reselling products
   - **Category:** Dropshipping
   - **Callback URL:** `https://mrsqoopexpress.com/api/webhooks/aliexpress`
4. Copy your App Key and App Secret to `.env.local`

## Deployment to Vercel

### 1. Connect to Vercel

```bash
vercel
```

### 2. Set Environment Variables

```bash
vercel env add NEXT_PUBLIC_ALIEXPRESS_APP_KEY
vercel env add ALIEXPRESS_APP_SECRET
```

Or in Vercel Dashboard:
- Go to Project Settings → Environment Variables
- Add all variables from `.env.local`

### 3. Deploy

```bash
vercel --prod
```

### 4. Configure Custom Domain

- Go to Vercel Dashboard → Project Settings → Domains
- Add `mrsqoopexpress.com`
- Update your domain DNS settings to point to Vercel

## Project Structure

```
shop/
├── app/
│   ├── api/
│   │   ├── products/
│   │   │   └── route.js          # Products API
│   │   └── webhooks/
│   │       └── aliexpress/
│   │           └── route.js      # AliExpress webhook
│   ├── layout.js                 # Root layout
│   ├── page.js                   # Home page
│   └── globals.css               # Global styles
├── public/                       # Static assets
├── .env.local                    # Environment variables
├── next.config.js                # Next.js config
├── package.json
└── README.md
```

## Payment Integration

### Payment Provider Selection

**📊 Compare Airtel vs MTN:**
- **[AIRTEL_MTN_PRODUCT_COMPARISON.md](./AIRTEL_MTN_PRODUCT_COMPARISON.md)** - 🆕 Complete comparison (Airtel vs MTN)

### Airtel Money 💚 Setup Guides

**📍 Quick Start:**
- **[AIRTEL_COMPLETE_SETUP_GUIDE.md](./AIRTEL_COMPLETE_SETUP_GUIDE.md)** - Complete step-by-step (Day 1-7)
- **[AIRTEL_PRODUCT_SELECTION.md](./AIRTEL_PRODUCT_SELECTION.md)** - Which 2 products to select
- **[AIRTEL_IP_WHITELIST_QUICK_REF.md](./AIRTEL_IP_WHITELIST_QUICK_REF.md)** - Copy-paste Vercel IPs

**📚 Detailed Guides:**
- **[AIRTEL_UGANDA_SETUP.md](./AIRTEL_UGANDA_SETUP.md)** - Uganda-specific configuration 🇺🇬
- **[AIRTEL_QUICK_START.md](./AIRTEL_QUICK_START.md)** - Get started in 30 minutes
- **[AIRTEL_PAYMENT_INTEGRATION.md](./AIRTEL_PAYMENT_INTEGRATION.md)** - Technical implementation
- **[AIRTEL_PRODUCTS_GUIDE.md](./AIRTEL_PRODUCTS_GUIDE.md)** - All Airtel products explained
- **[AIRTEL_IP_WHITELIST.md](./AIRTEL_IP_WHITELIST.md)** - IP whitelisting security
- **[AIRTEL_IMPLEMENTATION_CHECKLIST.md](./AIRTEL_IMPLEMENTATION_CHECKLIST.md)** - Detailed checklist
- **[AIRTEL_VS_MTN_GUIDE.md](./AIRTEL_VS_MTN_GUIDE.md)** - API & workflow comparison

### MTN Mobile Money 🟠 Setup Guides

**📍 IMPORTANT - READ FIRST:**
- **[MTN_PRODUCTS_CLARIFICATION.md](./MTN_PRODUCTS_CLARIFICATION.md)** - 🆕 **WHICH PRODUCT TO USE** (Critical!)
  - Collection Widget vs MoMo Widget (Checkout) vs Collection API
  - **Recommendation: Use MoMo Widget for e-commerce** ✅

**📍 Implementation & Testing:**
- **[MTN_MOMO_WIDGET_TESTING.md](./MTN_MOMO_WIDGET_TESTING.md)** - 🆕 **HOW TO TEST** (Step-by-step)
- **[MTN_QUICK_REFERENCE.md](./MTN_QUICK_REFERENCE.md)** - Your credentials & quick setup
- **[MTN_COLLECTION_SETUP.md](./MTN_COLLECTION_SETUP.md)** - Complete implementation guide
- **[MTN_PRODUCT_SELECTION.md](./MTN_PRODUCT_SELECTION.md)** - Which products available

### Quick Links

**Airtel:**
- **[Airtel Developer Portal](https://developers.airtel.africa)** - Register and get credentials
- [Airtel API Documentation](https://developer.airtel.africa/docs)
- [Airtel Status Page](https://status.airtel.africa)
- Email: developer-support@airtel.africa

**MTN:**
- [MTN Developer Portal](https://momodeveloper.mtn.com) - Register and get credentials
- MTN API Documentation (in developer portal)
- Email: developer support (check MTN dashboard)

## Next Steps

1. ✅ Set up Next.js with API routes
2. 📝 Register with AliExpress API
3. 🔑 Add API credentials to environment variables
4. 🧪 Test webhooks locally with ngrok or similar
5. 🚀 Deploy to Vercel
6. 📊 Build product catalog page
7. 💳 Add payment processing (Airtel Money, MTN Mobile Money)

## Support

### AliExpress Integration
- [AliExpress Open Platform Docs](https://open.aliexpress.com/docs)
- [Next.js Documentation](https://nextjs.org/docs)

### Payment Integration
- [Airtel Developer Docs](https://developer.airtel.africa/docs)
- [Airtel Merchant Support](https://merchant.airtel.africa)
- Email: developer-support@airtel.africa

## License

MIT
