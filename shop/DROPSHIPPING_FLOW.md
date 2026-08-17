# MrSqoopExpress - Complete Dropshipping Flow

## 🏪 Your Business Model

```
Customer visits mrsqoopexpress.com (Uganda)
    ↓
Sees products with UGX prices (AliExpress price + 35% markup)
    ↓
Adds to cart and checks out
    ↓
Pays via Airtel Money or MTN Mobile Money
    ↓
[CUSTOMER SIDE] Order shows "CONFIRMED" ✅
[YOUR BACKEND] Order marked as "PENDING PAYMENT" ⏳
    ↓
Payment webhook received from Airtel/MTN
    ↓
Payment verified and confirmed
    ↓
Automatically forwards order to AliExpress with YOUR WAREHOUSE ADDRESS
    ↓
AliExpress ships to your warehouse in Uganda
    ↓
You deliver to customer (or they pick up)
    ↓
Money earned = (Customer Price - AliExpress Cost - Shipping - Fees)
```

---

## 💰 Pricing Strategy Example

| Component | USD | UGX (÷3700) | UGX Final |
|-----------|-----|------------|-----------|
| AliExpress Cost | $20 | 74,000 | 74,000 |
| Your Markup (35%) | $7 | 25,900 | 25,900 |
| Subtotal | $27 | 99,900 | 99,900 |
| Shipping (est) | $5 | 18,500 | 18,500 |
| **Customer Pays** | **$32** | **≈118,400** | **118,400 UGX** |
| **Your Profit** | **$7** | **≈25,900** | **25,900 UGX** |

---

## 🔄 Complete Order Flow

### Phase 1: Product Display
```
GET /api/products/with-markup?keyword=phone
Response:
{
  "products": [
    {
      "id": "123",
      "title": "iPhone Case",
      "originalPriceUSD": 5.99,
      "markupPercentage": 35,
      "finalPriceUGX": 29,190,  ← Display this to customer
      "currency": "UGX",
      "image": "..."
    }
  ]
}
```

### Phase 2: Checkout
```
POST /api/orders/create
Body:
{
  "customerName": "John Doe",
  "customerEmail": "john@example.com",
  "customerPhone": "+256-7XX-XXX-XXX",
  "deliveryAddress": { ... }, // Will be replaced with warehouse
  "items": [
    {"productId": "123", "quantity": 1, "priceUGX": 29190}
  ],
  "paymentMethod": "airtel",  // or "mtn"
  "totalAmountUGX": 29190
}

Response (CUSTOMER SEES):
{
  "frontendStatus": "confirmed",
  "message": "Order Confirmed! Please complete payment."
}

BACKEND STORES:
{
  "orderStatus": "pending_payment",  ← Not yet forwarded to AliExpress
  "paymentStatus": "awaiting_confirmation",
  "aliexpressOrderId": null
}
```

### Phase 3: Payment Processing
```
Customer dials payment USSD code (provided in order)
Airtel/MTN processes payment
Payment webhook sent to YOUR APP

POST /api/webhooks/payments/airtel-mtn
{
  "provider": "airtel",
  "status": "success",
  "transactionId": "TXN123456",
  "amount": 29190,
  "orderId": "ORD-1001"
}

YOUR SYSTEM AUTOMATICALLY:
1. Marks order as "paid" ✅
2. Forwards to AliExpress API ⏭️
3. Gets AliExpress order ID 📦
4. Sends confirmation to customer 📧
```

### Phase 4: Auto-Forward to AliExpress
```
Your system forwards order with:
- AliExpress product IDs
- Quantity
- WAREHOUSE ADDRESS (not customer address)

Order Flow:
✅ Payment confirmed
→ 📦 Order sent to AliExpress supplier
→ 🚚 Supplier ships to your warehouse
→ 📍 You deliver to customer (or they pick up)
```

---

## 🗂️ Database Schema (You Need to Create)

### Products Table
```sql
CREATE TABLE products (
  id VARCHAR(255) PRIMARY KEY,
  aliexpress_id VARCHAR(255),
  title VARCHAR(500),
  description TEXT,
  aliexpress_price_usd DECIMAL(10, 2),
  your_markup_percentage INT DEFAULT 35,
  final_price_ugx INT,
  image_url VARCHAR(500),
  category VARCHAR(100),
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### Orders Table
```sql
CREATE TABLE orders (
  id VARCHAR(255) PRIMARY KEY,
  customer_id VARCHAR(255),
  customer_name VARCHAR(255),
  customer_email VARCHAR(255),
  customer_phone VARCHAR(20),
  total_amount_ugx INT,
  total_amount_usd DECIMAL(10, 2),
  order_status VARCHAR(50),  -- pending_payment, paid, processing, shipped, delivered
  payment_status VARCHAR(50), -- awaiting_confirmation, confirmed, failed
  payment_method VARCHAR(20), -- airtel, mtn
  transaction_id VARCHAR(255),
  aliexpress_order_id VARCHAR(255),
  delivery_address JSON,
  warehouse_address JSON,
  created_at TIMESTAMP DEFAULT NOW(),
  paid_at TIMESTAMP,
  shipped_at TIMESTAMP
);
```

### Order Items Table
```sql
CREATE TABLE order_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  order_id VARCHAR(255),
  product_id VARCHAR(255),
  quantity INT,
  price_ugx INT,
  FOREIGN KEY (order_id) REFERENCES orders(id)
);
```

---

## 🚀 Implementation Checklist

### Backend
- [ ] Create products API with markup pricing (`/api/products/with-markup`)
- [ ] Create orders API (`/api/orders/create`)
- [ ] Connect to database (PostgreSQL, MongoDB, etc.)
- [ ] Implement payment webhook receiver (`/api/webhooks/payments/airtel-mtn`)
- [ ] Integrate with Airtel Money API
- [ ] Integrate with MTN Mobile Money API
- [ ] Create AliExpress order forwarding logic
- [ ] Set up email notifications
- [ ] Create admin dashboard for order tracking

### Frontend
- [ ] Product listing page with UGX prices
- [ ] Product detail page
- [ ] Shopping cart
- [ ] Checkout page with payment method selection
- [ ] Order confirmation page
- [ ] Order tracking page
- [ ] Customer account/order history

### Payment Integration
- [ ] Register with Airtel Money API
- [ ] Register with MTN Mobile Money API
- [ ] Get API credentials and merchant codes
- [ ] Implement webhook signature verification
- [ ] Set up payment timeout handling
- [ ] Create payment retry logic

### AliExpress Integration
- [ ] Get production API access approval from AliExpress
- [ ] Implement order creation on AliExpress
- [ ] Map your warehouse address to AliExpress
- [ ] Create order tracking integration
- [ ] Handle shipping notifications

---

## 📋 API Endpoints You Need

### Products
```
GET /api/products/with-markup
  Query: keyword, limit
  Returns: Products with UGX prices + markup
```

### Orders
```
POST /api/orders/create
  Body: Customer info, items, payment method
  Returns: Order confirmation (frontend status)

GET /api/orders/:orderId
  Returns: Order status and details
```

### Payments
```
POST /api/webhooks/payments/airtel-mtn
  Receives: Payment confirmation from gateway
  Actions: Auto-forward to AliExpress
```

---

## 🔑 Environment Variables Needed

```env
# AliExpress
NEXT_PUBLIC_ALIEXPRESS_APP_KEY=540522
ALIEXPRESS_APP_SECRET=Q9x1o3yjwZ0Ds8MAbnaijodGLCjZ9Sow

# Currency & Markup
MARKUP_PERCENTAGE=35
USD_TO_UGX_RATE=3700

# Airtel Money
AIRTEL_API_KEY=your_airtel_key
AIRTEL_MERCHANT_CODE=MRSQOOP
AIRTEL_WEBHOOK_SECRET=your_webhook_secret

# MTN Mobile Money
MTN_API_KEY=your_mtn_key
MTN_MERCHANT_CODE=MRSQOOP
MTN_WEBHOOK_SECRET=your_webhook_secret

# Warehouse Address
WAREHOUSE_NAME=MrSqoopExpress Warehouse
WAREHOUSE_ADDRESS=Plot 100, Industrial Area
WAREHOUSE_CITY=Kampala
WAREHOUSE_PHONE=+256-XXX-XXX-XXX

# Database
DATABASE_URL=postgresql://user:password@localhost/mrsqoopexpress

# Email
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_app_password
```

---

## 💡 Pro Tips

### 1. Warehouse Address
Always use your warehouse address on AliExpress orders, not customer's address:
```javascript
deliveryAddress: {
  name: "MrSqoopExpress Warehouse",
  address: "Plot 100, Industrial Area",
  city: "Kampala",
  region: "Central",
  country: "Uganda",
  postalCode: "256",
  phone: "+256-XXX-XXX-XXX"
}
```

### 2. Exchange Rate Management
Update exchange rate daily or weekly:
```javascript
// Call this periodically
async function updateExchangeRate() {
  const rate = await fetchLatestUSDtoUGXRate();
  process.env.USD_TO_UGX_RATE = rate;
}
```

### 3. Payment Timeout Handling
If payment not received within 30 minutes:
```javascript
// Auto-cancel order and refund if customer paid but webhook didn't fire
const paymentDeadline = orderCreatedAt + 30 minutes;
if (now > paymentDeadline && paymentNotConfirmed) {
  cancelOrder(orderId);
}
```

### 4. Order Status Tracking
Always show customer what they need to see:
```javascript
// Customer sees
{ status: "confirmed" } ✅

// You track internally
{ 
  frontendStatus: "confirmed",
  backendStatus: "pending_payment",
  aliexpressStatus: "not_yet_forwarded"
}
```

---

## 📞 Integration Resources

### Airtel Money API
- Documentation: https://airtel.africa/business/
- USSD Code: *185*50#
- Webhook Format: Check their API docs

### MTN Mobile Money API
- Documentation: https://www.mtn.com/business
- USSD Code: *165#
- Webhook Format: Check their API docs

### AliExpress API
- Documentation: https://open.aliexpress.com/docs
- Your credentials: Provided after approval

---

## 🎯 Next Steps

1. **Set up database** (PostgreSQL recommended)
2. **Register with Airtel Money & MTN** to get API credentials
3. **Update payment webhook receiver** with real signatures verification
4. **Build checkout page** with payment method selection
5. **Implement order dashboard** to track everything
6. **Test entire flow** with small amounts
7. **Deploy to Vercel**
8. **Go live!**

---

## ⚠️ Important Warnings

🚫 **Don't:**
- Display AliExpress address to customers (use warehouse only)
- Manually process orders (automate everything)
- Store payment credentials on your server
- Charge customer before payment confirmed
- Send AliExpress tracking number directly to customer

✅ **Do:**
- Show "pending" on backend until payment confirmed
- Show "confirmed" to customer immediately (for UX)
- Automatically forward to AliExpress after payment
- Send your own tracking updates to customer
- Log all transactions for accounting

---

You're ready to build a full dropshipping platform! 🚀
