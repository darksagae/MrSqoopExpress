import { NextResponse } from 'next/server';
import { WAREHOUSE } from '@/lib/shipping-destination';

// This would connect to your database
// Using in-memory storage for now (replace with DB)
const orders = new Map();
let orderCounter = 1000;

export async function POST(request) {
  try {
    const {
      customerId,
      customerName,
      customerEmail,
      customerPhone,
      deliveryAddress, // Customer's address (will be replaced with warehouse)
      items, // Array of {productId, quantity, priceUGX}
      paymentMethod, // 'airtel' or 'mtn'
      totalAmountUGX,
    } = await request.json();

    // Validate input
    if (!customerName || !customerEmail || !items || items.length === 0) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Create order with PENDING status in backend
    const orderId = `ORD-${orderCounter++}`;
    const order = {
      id: orderId,
      customerId,
      customerName,
      customerEmail,
      customerPhone,
      // The supplier ships to the Deira receiving house, not to the customer:
      // that is the address every freight quote was priced against, and the
      // goods are forwarded on to Uganda from there.
      deliveryAddress: {
        name: 'MrSqoopExpress',
        address: WAREHOUSE.addressLine,
        city: WAREHOUSE.city,
        region: WAREHOUSE.province,
        country: WAREHOUSE.country,
        countryCode: WAREHOUSE.countryCode,
      },
      items,
      totalAmountUGX,
      totalAmountUSD: Math.round(totalAmountUGX / 3700),
      paymentMethod,
      orderStatus: 'pending_payment', // Backend status
      frontendStatus: 'confirmed', // What customer sees
      paymentStatus: 'awaiting_confirmation',
      createdAt: new Date().toISOString(),
      paymentDeadline: new Date(Date.now() + 30 * 60 * 1000).toISOString(), // 30 min to pay
      aliexpressOrderId: null, // Will be set after payment confirmed
      notes: 'Waiting for payment confirmation from Airtel/MTN gateway',
    };

    // Store order
    orders.set(orderId, order);

    console.log('✅ Order created (pending payment):', {
      orderId,
      customerName,
      amount: totalAmountUGX,
      paymentMethod,
      status: order.orderStatus,
    });

    // Return CONFIRMED status to customer
    return NextResponse.json({
      success: true,
      frontendMessage: 'Order Confirmed! Please complete payment.',
      frontendStatus: 'confirmed', // Customer sees this
      orderId,
      paymentDetails: {
        method: paymentMethod.toUpperCase(),
        amount: totalAmountUGX,
        currency: 'UGX',
        instructions: getPaymentInstructions(paymentMethod, totalAmountUGX),
      },
      estimatedDelivery: '7-21 business days',
      // Internal backend info (not sent to customer)
      _backendStatus: 'pending_payment',
      _aliexpressStatus: 'not_yet_forwarded',
    }, { status: 201 });

  } catch (error) {
    console.error('Error creating order:', error);
    return NextResponse.json(
      { error: 'Failed to create order', message: error.message },
      { status: 500 }
    );
  }
}

function getPaymentInstructions(method, amount) {
  if (method === 'airtel') {
    return {
      provider: 'Airtel Money Uganda',
      ussd: '*185*50#', // Dial this code
      steps: [
        `1. Dial *185*50#`,
        `2. Select "Pay Merchant"`,
        `3. Enter merchant code: MRSQOOP`,
        `4. Enter amount: ${amount} UGX`,
        `5. Confirm and complete payment`,
        `6. You will receive confirmation SMS`,
      ],
      note: 'Charges apply per Airtel Money rates',
    };
  } else if (method === 'mtn') {
    return {
      provider: 'MTN Mobile Money Uganda',
      ussd: '*165#', // Dial this code
      steps: [
        `1. Dial *165#`,
        `2. Select "Pay Merchant"`,
        `3. Enter merchant code: MRSQOOP`,
        `4. Enter amount: ${amount} UGX`,
        `5. Confirm with your PIN`,
        `6. You will receive confirmation SMS`,
      ],
      note: 'Charges apply per MTN rates',
    };
  }
}

// GET endpoint to check order status
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const orderId = searchParams.get('orderId');

  if (!orderId) {
    return NextResponse.json({ error: 'orderId required' }, { status: 400 });
  }

  const order = orders.get(orderId);
  if (!order) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 });
  }

  return NextResponse.json({
    orderId: order.id,
    frontendStatus: order.frontendStatus, // What customer sees
    paymentStatus: order.paymentStatus,
    estimatedDelivery: order.estimatedDelivery,
    items: order.items,
    totalAmount: order.totalAmountUGX,
  });
}
