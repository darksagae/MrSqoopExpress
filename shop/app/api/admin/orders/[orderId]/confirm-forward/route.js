import { NextResponse } from 'next/server';
import { WAREHOUSE_LABEL } from '@/lib/shipping-destination';

export async function POST(request, { params }) {
  const orderId = params.orderId;

  try {
    console.log('🔄 Confirming and forwarding order:', orderId);

    // Get order from database
    const order = await getOrderFromDatabase(orderId);

    if (!order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    if (order.orderStatus !== 'awaiting_admin_confirmation') {
      return NextResponse.json(
        { error: 'Order not in awaiting confirmation status' },
        { status: 400 }
      );
    }

    // Forward to AliExpress
    const aliexpressResult = await forwardToAliExpress(order);

    if (!aliexpressResult.success) {
      return NextResponse.json({
        success: false,
        error: 'Failed to forward to AliExpress',
        details: aliexpressResult.error,
      }, { status: 500 });
    }

    // Update order in database
    await updateOrderInDatabase(orderId, {
      orderStatus: 'forwarded_to_supplier',
      aliexpressOrderId: aliexpressResult.aliexpressOrderId,
      trackingNumber: aliexpressResult.trackingNumber,
      forwardedAt: new Date().toISOString(),
      adminConfirmedAt: new Date().toISOString(),
    });

    // Send notification to customer
    await notifyCustomer(order, 'order_confirmed', aliexpressResult);

    return NextResponse.json({
      success: true,
      message: '✅ Order confirmed and forwarded to AliExpress',
      orderId,
      aliexpressOrderId: aliexpressResult.aliexpressOrderId,
      trackingNumber: aliexpressResult.trackingNumber,
      estimatedDelivery: '7-21 business days',
    });
  } catch (error) {
    console.error('Error confirming order:', error);
    return NextResponse.json(
      { error: 'Failed to confirm order' },
      { status: 500 }
    );
  }
}

async function getOrderFromDatabase(orderId) {
  // TODO: Replace with actual database query
  return {
    id: orderId,
    customerName: 'John Doe',
    customerEmail: 'john@example.com',
    items: [],
    totalAmountUGX: 100000,
  };
}

async function updateOrderInDatabase(orderId, updates) {
  // TODO: Replace with actual database update
  console.log(`📝 Updating order ${orderId}:`, updates);
  return true;
}

async function forwardToAliExpress(order) {
  console.log('📦 Calling AliExpress API to create order');
  console.log('Items:', order.items);
  console.log('Supplier ships to:', WAREHOUSE_LABEL);

  // TODO: Call actual AliExpress API
  const mockOrderId = `AE-${Date.now()}`;

  return {
    success: true,
    aliexpressOrderId: mockOrderId,
    trackingNumber: `UG-TRACK-${Date.now()}`,
    estimatedDelivery: '7-21 days',
  };
}

async function notifyCustomer(order, notificationType, details) {
  console.log(`📧 Sending ${notificationType} email to ${order.customerEmail}`);
  console.log('Message: Your order is being prepared by our supplier');
  console.log('Estimated delivery: 7-21 days');
  return true;
}
