import { NextResponse } from 'next/server';

export async function POST(request, { params }) {
  const orderId = params.orderId;

  try {
    const { reason } = await request.json();

    console.log('⏸️  Placing order on hold:', orderId, 'Reason:', reason);

    // Update order status
    await updateOrderInDatabase(orderId, {
      orderStatus: 'on_hold',
      holdReason: reason || 'Awaiting admin action',
      heldAt: new Date().toISOString(),
    });

    // Send notification to admin
    console.log('🔔 Order placed on hold - awaiting further action');

    return NextResponse.json({
      success: true,
      message: '⏸️  Order placed on hold',
      orderId,
      reason: reason || 'Awaiting admin action',
    });
  } catch (error) {
    console.error('Error holding order:', error);
    return NextResponse.json(
      { error: 'Failed to hold order' },
      { status: 500 }
    );
  }
}

async function updateOrderInDatabase(orderId, updates) {
  // TODO: Replace with actual database update
  console.log(`📝 Updating order ${orderId}:`, updates);
  return true;
}
