import { NextResponse } from 'next/server';

export async function POST(request, { params }) {
  const orderId = params.orderId;

  try {
    const { reason, refundMethod } = await request.json();

    console.log('❌ Cancelling order:', orderId);
    console.log('Reason:', reason);
    console.log('Refund method:', refundMethod || 'original payment method');

    // Update order status
    await updateOrderInDatabase(orderId, {
      orderStatus: 'cancelled',
      cancelledReason: reason || 'Cancelled by admin',
      refundMethod: refundMethod || 'original_payment',
      cancelledAt: new Date().toISOString(),
    });

    // Get customer info and send refund notification
    const order = await getOrderFromDatabase(orderId);

    // Send email to customer
    console.log(`📧 Sending cancellation email to ${order.customerEmail}`);
    console.log(`💰 Refund of ${order.totalAmountUGX} UGX will be processed`);
    console.log(`⏱️  Refund timeline: 1-3 business days`);

    return NextResponse.json({
      success: true,
      message: '❌ Order cancelled',
      orderId,
      refund: {
        amount: order.totalAmountUGX,
        currency: 'UGX',
        method: refundMethod || 'original payment method',
        timeline: '1-3 business days',
      },
      reason: reason || 'Cancelled by admin',
    });
  } catch (error) {
    console.error('Error cancelling order:', error);
    return NextResponse.json(
      { error: 'Failed to cancel order' },
      { status: 500 }
    );
  }
}

async function getOrderFromDatabase(orderId) {
  // TODO: Replace with actual database query
  return {
    id: orderId,
    customerEmail: 'customer@example.com',
    totalAmountUGX: 100000,
  };
}

async function updateOrderInDatabase(orderId, updates) {
  // TODO: Replace with actual database update
  console.log(`📝 Updating order ${orderId}:`, updates);
  return true;
}
