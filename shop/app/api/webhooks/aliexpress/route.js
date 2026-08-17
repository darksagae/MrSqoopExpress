import { NextResponse } from 'next/server';
import crypto from 'crypto';

// Health/availability check. AliExpress (and you) can GET this URL to confirm
// the "message receiving service" is alive before subscribing.
export async function GET() {
  return NextResponse.json({ status: 'ok', service: 'aliexpress-webhook' }, { status: 200 });
}

export async function POST(request) {
  try {
    // Read raw body first so an empty verification ping doesn't crash on JSON.parse.
    const raw = await request.text();

    // Availability/verification ping: empty or non-JSON body → just say OK.
    if (!raw || !raw.trim()) {
      return NextResponse.json({ status: 'ok' }, { status: 200 });
    }

    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      // Not JSON — treat as a verification/health ping, respond 200.
      return NextResponse.json({ status: 'ok' }, { status: 200 });
    }

    // Verify the signature from AliExpress
    const signature = request.headers.get('x-aliexpress-signature');
    const isValid = verifySignature(body, signature);

    if (!isValid) {
      // Don't hard-fail unsigned pings (AliExpress's checks may be unsigned);
      // log and acknowledge so the subscription can be saved.
      console.warn('Webhook received without a valid signature — acknowledging as ping.');
      return NextResponse.json({ status: 'ok', note: 'unsigned' }, { status: 200 });
    }

    // Log the webhook data for debugging
    console.log('AliExpress Webhook Received:', {
      timestamp: new Date().toISOString(),
      type: body.event_type,
      data: body,
    });

    // Process webhook based on event type
    switch (body.event_type) {
      case 'order_status_change':
        await handleOrderStatusChange(body);
        break;
      case 'product_update':
        await handleProductUpdate(body);
        break;
      case 'inventory_change':
        await handleInventoryChange(body);
        break;
      default:
        console.log('Unknown event type:', body.event_type);
    }

    return NextResponse.json(
      { success: true, message: 'Webhook processed' },
      { status: 200 }
    );
  } catch (error) {
    console.error('Webhook error:', error);
    return NextResponse.json(
      { error: 'Failed to process webhook' },
      { status: 500 }
    );
  }
}

function verifySignature(body, signature) {
  const secret = process.env.ALIEXPRESS_APP_SECRET;
  if (!secret) {
    console.warn('ALIEXPRESS_APP_SECRET not configured');
    return false;
  }

  const payload = JSON.stringify(body);
  const hash = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');

  return hash === signature;
}

async function handleOrderStatusChange(data) {
  console.log('Processing order status change:', data);
  // TODO: Update order status in database
}

async function handleProductUpdate(data) {
  console.log('Processing product update:', data);
  // TODO: Update product info in database
}

async function handleInventoryChange(data) {
  console.log('Processing inventory change:', data);
  // TODO: Update inventory in database
}
