import { NextResponse } from 'next/server';
import { resolveProvider, NETWORKS } from '@/lib/payments/resolve';
import { settlePayment } from '@/lib/orders';

/**
 * GET /api/orders/status?network=mtn|airtel&reference=<id>
 *
 * Authoritative payment outcome, read straight from the provider.
 *
 * This exists because provider callbacks cannot be relied on: MTN sends theirs
 * exactly once with no retry, so a single dropped request would otherwise
 * strand the order as pending forever. Polling here closes that hole, and
 * doubles as the verification step for the unsigned callback.
 */
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const network = searchParams.get('network');
  const reference = searchParams.get('reference');

  if (!NETWORKS.includes(network)) {
    return NextResponse.json({ error: 'network must be mtn or airtel' }, { status: 400 });
  }
  if (!reference) {
    return NextResponse.json({ error: 'reference is required' }, { status: 400 });
  }

  const { provider, ready, label } = resolveProvider(network);
  if (!ready) {
    return NextResponse.json({ error: `${label} is not connected yet.` }, { status: 503 });
  }

  try {
    const raw = await provider.getPaymentStatus(reference);
    const status = String(raw || 'UNKNOWN').toUpperCase();
    const settled = status === 'SUCCESSFUL' || status === 'FAILED' || status === 'REJECTED';

    // Write the outcome down. This is the path that saves us when a callback is
    // dropped — MTN sends it once and never retries, so without persisting here
    // the order would stay PENDING even though we just learned it settled.
    if (settled) {
      try {
        await settlePayment(reference, status === 'SUCCESSFUL' ? 'SUCCESSFUL' : 'FAILED', {
          failureReason: status === 'SUCCESSFUL' ? null : status,
        });
      } catch (dbError) {
        // Reporting the true status still beats failing the request outright.
        console.error('Could not persist settled status for', reference, dbError.message);
      }
    }

    return NextResponse.json({ reference, network, status, settled, paid: status === 'SUCCESSFUL' });
  } catch (error) {
    console.error('Status check failed:', error);
    return NextResponse.json(
      { error: 'Could not read payment status.', code: error.code || 'STATUS_ERROR' },
      { status: 502 }
    );
  }
}
