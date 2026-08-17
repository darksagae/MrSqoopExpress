import { NextResponse } from 'next/server';

// In-memory storage (replace with database)
const pendingOrders = new Map();

export async function GET(request) {
  try {
    // Get all orders awaiting admin confirmation
    const orders = Array.from(pendingOrders.values())
      .filter(order => order.orderStatus === 'awaiting_admin_confirmation')
      .sort((a, b) => new Date(b.paidAt) - new Date(a.paidAt));

    return NextResponse.json({
      success: true,
      count: orders.length,
      totalAmount: orders.reduce((sum, order) => sum + order.totalAmountUGX, 0),
      orders: orders.map(order => ({
        id: order.id,
        customerName: order.customerName,
        customerEmail: order.customerEmail,
        customerPhone: order.customerPhone,
        amount: order.totalAmountUGX,
        currency: 'UGX',
        amountUSD: order.totalAmountUSD,
        paymentMethod: order.paymentMethod,
        transactionId: order.transactionId,
        paidAt: order.paidAt,
        items: order.items,
        itemCount: order.items.length,
        status: order.orderStatus,
        paymentConfirmed: order.paymentStatus === 'confirmed',
        actions: {
          confirmAndForward: `/api/admin/orders/${order.id}/confirm-forward`,
          hold: `/api/admin/orders/${order.id}/hold`,
          cancel: `/api/admin/orders/${order.id}/cancel`,
        },
      })),
    });
  } catch (error) {
    console.error('Error fetching pending orders:', error);
    return NextResponse.json(
      { error: 'Failed to fetch orders' },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
    const { action, orderId } = await request.json();

    if (action === 'confirm_and_forward') {
      return await confirmAndForwardOrder(orderId);
    } else if (action === 'hold') {
      return await holdOrder(orderId);
    } else if (action === 'cancel') {
      return await cancelOrder(orderId);
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    console.error('Error processing admin action:', error);
    return NextResponse.json(
      { error: 'Failed to process action' },
      { status: 500 }
    );
  }
}

async function confirmAndForwardOrder(orderId) {
  const order = pendingOrders.get(orderId);

  if (!order) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 });
  }

  console.log('🔄 Admin confirming & forwarding order:', orderId);

  // Update order status
  order.orderStatus = 'forwarded_to_supplier';
  order.adminAction = {
    status: 'confirmed',
    confirmedAt: new Date().toISOString(),
    confirmedBy: 'admin',
  };

  // Forward to AliExpress
  const aliexpressResult = await forwardToAliExpress(order);

  if (aliexpressResult.success) {
    order.aliexpressOrderId = aliexpressResult.aliexpressOrderId;
    order.trackingNumber = aliexpressResult.trackingNumber;

    // Send email to customer that order is being processed
    await sendCustomerEmail(orderId, 'order_forwarded', {
      message: 'Your order has been sent to our supplier and is being processed.',
      estimatedDelivery: '7-21 days',
    });

    return NextResponse.json({
      success: true,
      message: 'Order confirmed and forwarded to AliExpress',
      orderId,
      aliexpressOrderId: aliexpressResult.aliexpressOrderId,
      trackingNumber: aliexpressResult.trackingNumber,
    });
  } else {
    return NextResponse.json({
      success: false,
      error: 'Failed to forward to AliExpress',
      message: aliexpressResult.error,
    }, { status: 500 });
  }
}

async function holdOrder(orderId) {
  const order = pendingOrders.get(orderId);

  if (!order) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 });
  }

  console.log('⏸️  Admin holding order:', orderId);

  order.orderStatus = 'on_hold';
  order.adminAction = {
    status: 'held',
    heldAt: new Date().toISOString(),
    reason: 'Awaiting additional admin action',
  };

  return NextResponse.json({
    success: true,
    message: 'Order placed on hold',
    orderId,
  });
}

async function cancelOrder(orderId) {
  const order = pendingOrders.get(orderId);

  if (!order) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 });
  }

  console.log('❌ Admin cancelling order:', orderId);

  order.orderStatus = 'cancelled';
  order.adminAction = {
    status: 'cancelled',
    cancelledAt: new Date().toISOString(),
    reason: 'Cancelled by admin',
  };

  // Send refund notification to customer
  await sendCustomerEmail(orderId, 'order_cancelled', {
    message: 'Your order has been cancelled. A refund will be processed.',
    refundTime: '1-3 business days',
  });

  return NextResponse.json({
    success: true,
    message: 'Order cancelled',
    orderId,
  });
}

async function forwardToAliExpress(order) {
  // TODO: Call actual AliExpress API
  console.log('📦 Forwarding order to AliExpress:', order.id);

  const mockAliExpressOrderId = `AE-${Date.now()}`;

  return {
    success: true,
    aliexpressOrderId: mockAliExpressOrderId,
    trackingNumber: `TRACK-${Date.now()}`,
  };
}

async function sendCustomerEmail(orderId, emailType, details) {
  console.log(`📧 Email sent to customer (${emailType}):`, orderId, details);
  return true;
}
