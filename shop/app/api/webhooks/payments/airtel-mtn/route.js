import { NextResponse } from 'next/server';

export async function POST(request) {
  try {
    const payload = await request.json();

    console.log('💰 Payment webhook received:', {
      provider: payload.provider || 'unknown',
      transactionId: payload.transactionId,
      status: payload.status,
      amount: payload.amount,
      orderId: payload.orderId,
    });

    // Verify webhook signature (implement based on provider)
    const isValid = await verifyWebhookSignature(payload);
    if (!isValid) {
      console.warn('❌ Invalid webhook signature');
      return NextResponse.json(
        { error: 'Invalid signature' },
        { status: 401 }
      );
    }

    // Handle different payment statuses
    switch (payload.status?.toLowerCase()) {
      case 'success':
      case 'completed':
        return await handlePaymentSuccess(payload);

      case 'pending':
        return await handlePaymentPending(payload);

      case 'failed':
      case 'declined':
        return await handlePaymentFailed(payload);

      default:
        console.warn('Unknown payment status:', payload.status);
        return NextResponse.json(
          { error: 'Unknown status' },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('❌ Payment webhook error:', error);
    return NextResponse.json(
      { error: 'Webhook processing failed' },
      { status: 500 }
    );
  }
}

async function handlePaymentSuccess(payload) {
  const { orderId, transactionId, amount, provider } = payload;

  console.log('✅ Payment SUCCESS:', { orderId, amount, provider });

  // 1. Update order status from "pending_payment" to "paid"
  // BUT DO NOT forward to AliExpress yet - wait for admin confirmation
  const orderUpdated = await updateOrderStatus(orderId, {
    paymentStatus: 'confirmed',
    orderStatus: 'awaiting_admin_confirmation', // ← NEW: Waiting for admin review
    transactionId,
    paymentMethod: provider,
    paidAt: new Date().toISOString(),
    adminAction: {
      status: 'pending_review',
      message: 'Waiting for admin to confirm & forward to AliExpress',
      allowedActions: ['confirm_and_forward', 'hold', 'cancel'],
    },
  });

  if (!orderUpdated) {
    return NextResponse.json(
      { error: 'Order not found' },
      { status: 404 }
    );
  }

  // 2. Send payment confirmation email to CUSTOMER
  // (Not forwarded yet, but payment is confirmed)
  await sendCustomerEmail(orderId, 'payment_confirmed', {
    message: 'Your payment was successful! We are preparing your order.',
    estimatedProcessing: '1-24 hours',
  });

  // 3. Send notification to ADMIN
  // (Order is ready for review in dashboard)
  await sendAdminNotification(orderId, 'payment_confirmed', {
    amount,
    provider,
    message: `New payment received for order ${orderId}. Review in admin dashboard.`,
  });

  return NextResponse.json({
    success: true,
    message: 'Payment confirmed. Order awaiting admin confirmation.',
    orderId,
    transactionId,
    nextStep: 'Admin will review and forward to AliExpress',
  });
}

async function handlePaymentPending(payload) {
  const { orderId, transactionId } = payload;

  console.log('⏳ Payment PENDING:', orderId);

  await updateOrderStatus(orderId, {
    paymentStatus: 'pending_confirmation',
    transactionId,
  });

  return NextResponse.json({
    success: true,
    message: 'Payment is being processed',
    orderId,
  });
}

async function handlePaymentFailed(payload) {
  const { orderId, transactionId, reason } = payload;

  console.log('❌ Payment FAILED:', { orderId, reason });

  await updateOrderStatus(orderId, {
    paymentStatus: 'failed',
    orderStatus: 'cancelled',
    failureReason: reason,
    cancelledAt: new Date().toISOString(),
  });

  // Send failure notification to customer
  await sendCustomerEmail(orderId, 'payment_failed');

  return NextResponse.json({
    success: true,
    message: 'Payment failed - order cancelled',
    orderId,
  });
}

async function verifyWebhookSignature(payload) {
  // Implement based on your payment provider's signature verification
  // For Airtel Money and MTN, check their API documentation

  // Example:
  const secret = process.env.PAYMENT_WEBHOOK_SECRET;
  if (!secret) {
    console.warn('PAYMENT_WEBHOOK_SECRET not configured');
    return true; // Skip verification in development
  }

  // Verify signature based on provider
  if (payload.provider === 'airtel') {
    // Airtel signature verification
    return verifyAirtelSignature(payload, secret);
  } else if (payload.provider === 'mtn') {
    // MTN signature verification
    return verifyMTNSignature(payload, secret);
  }

  return false;
}

function verifyAirtelSignature(payload, secret) {
  // Implement Airtel's signature verification
  // See: Airtel Money API documentation
  return true; // TODO: Implement
}

function verifyMTNSignature(payload, secret) {
  // Implement MTN's signature verification
  // See: MTN Mobile Money API documentation
  return true; // TODO: Implement
}

async function updateOrderStatus(orderId, updates) {
  // TODO: Implement database update
  console.log(`📝 Updating order ${orderId}:`, updates);
  return true; // Mock response
}

async function forwardToAliExpress(orderId) {
  // TODO: Get order from database
  const order = {
    items: [
      { productId: '1', quantity: 1 },
    ],
    deliveryAddress: {
      name: 'MrSqoopExpress Warehouse',
      address: 'Plot 100, Industrial Area',
      city: 'Kampala',
      country: 'Uganda',
    },
  };

  try {
    // Call AliExpress API to create order
    const aliexpressResponse = await createAliExpressOrder(order);

    return {
      success: true,
      aliexpressOrderId: aliexpressResponse.orderId,
      trackingNumber: aliexpressResponse.trackingNumber,
    };
  } catch (error) {
    console.error('❌ Failed to forward to AliExpress:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}

async function createAliExpressOrder(order) {
  // TODO: Call actual AliExpress API
  // This is where you'd integrate with AliExpress's order creation API

  const mockAliExpressOrderId = `AE-${Date.now()}`;

  console.log('📦 Creating order on AliExpress:', {
    orderId: mockAliExpressOrderId,
    items: order.items,
    deliveryAddress: order.deliveryAddress,
  });

  return {
    orderId: mockAliExpressOrderId,
    trackingNumber: 'TRACKING123456',
    estimatedDelivery: '7-21 days',
  };
}

async function sendCustomerEmail(orderId, emailType) {
  // TODO: Send email via email service (SendGrid, Mailgun, etc.)

  console.log(`📧 Sending ${emailType} email for order ${orderId}`);

  if (emailType === 'payment_confirmed') {
    console.log('Email: Payment confirmed! Your order is being processed.');
  } else if (emailType === 'payment_failed') {
    console.log('Email: Payment failed. Please try again.');
  }

  return true;
}
