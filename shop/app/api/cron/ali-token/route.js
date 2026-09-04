import { NextResponse } from 'next/server';
import { aliexpressDS } from '@/lib/aliexpress';
import { initTokenSchema, readTokens, needsRefresh, REFRESH_MARGIN_MS } from '@/lib/ali-tokens';

// Token work must not be served from a cache.
export const dynamic = 'force-dynamic';

/**
 * GET /api/cron/ali-token — keep-alive for the AliExpress authorization.
 *
 * Refreshing on demand is not enough on its own. A refresh token has its own
 * expiry, so a quiet stretch with no traffic — a slow week, an off-season — can
 * outlast it, and once it lapses the only cure is a human re-authorizing in a
 * browser. Renewing on a schedule keeps the chain alive whether or not anyone
 * is shopping, which is the actual difference between "works" and "stays up".
 */
export async function GET(request) {
  // Vercel Cron signs its invocations; anything else must present the secret.
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get('authorization');
  const isVercelCron = request.headers.get('x-vercel-cron') !== null;
  if (secret && !isVercelCron && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    await initTokenSchema();
    const before = await readTokens({ fresh: true });

    if (!before) {
      return NextResponse.json(
        { ok: false, action: 'none', reason: 'AliExpress has never been authorized.' },
        { status: 503 }
      );
    }

    // Renew well before expiry rather than at it: a cron that only fires every
    // few hours must not leave a window where the token has already lapsed.
    const due = needsRefresh(before, REFRESH_MARGIN_MS * 4);
    if (!due) {
      return NextResponse.json({
        ok: true,
        action: 'skipped',
        reason: 'token still has comfortable life left',
        accessExpiresAt: before.access_expires_at,
      });
    }

    const after = await aliexpressDS.forceRefresh();
    return NextResponse.json({
      ok: true,
      action: 'refreshed',
      accessExpiresAt: after.access_expires_at,
      refreshExpiresAt: after.refresh_expires_at,
    });
  } catch (error) {
    // Loud, because a persistently failing refresh ends in an outage that only
    // a manual re-authorization can fix.
    console.error('[cron/ali-token] refresh failed:', error.message);
    return NextResponse.json(
      { ok: false, action: 'failed', error: error.message, code: error.code || 'REFRESH_FAILED' },
      { status: 500 }
    );
  }
}
