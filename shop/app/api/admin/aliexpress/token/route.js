import { NextResponse } from 'next/server';
import { isAdminRequest, adminDenied } from '@/lib/admin-auth';
import { aliexpressDS } from '@/lib/aliexpress';
import { initTokenSchema, readTokens } from '@/lib/ali-tokens';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/aliexpress/token — is the AliExpress connection healthy?
 *
 * Reports lifetimes and the last refresh error so a dying authorization is
 * visible before it takes the catalogue down, rather than after. Never returns
 * the tokens themselves.
 */
export async function GET(request) {
  if (!isAdminRequest(request)) return adminDenied();

  if (!aliexpressDS.hasCredentials()) {
    return NextResponse.json(
      { connected: false, reason: 'missing app credentials', missing: aliexpressDS.missingConfig() },
      { status: 503 }
    );
  }

  try {
    await initTokenSchema();
    const row = await readTokens({ fresh: true });

    if (!row) {
      return NextResponse.json(
        {
          connected: false,
          reason: 'not authorized yet',
          action: 'Visit /api/auth/aliexpress to connect the AliExpress account.',
        },
        { status: 503 }
      );
    }

    const hoursLeft = (d) =>
      d == null ? null : Math.round(((new Date(d).getTime() - Date.now()) / 3_600_000) * 10) / 10;

    const accessHours = hoursLeft(row.access_expires_at);
    const refreshHours = hoursLeft(row.refresh_expires_at);

    // The refresh token is the link that cannot be repaired automatically: once
    // AliExpress rejects it the grant is gone and a human must re-authorize.
    const needsReauthorization =
      row.needs_reauth === true || (refreshHours != null && refreshHours <= 0);

    return NextResponse.json({
      // Holding a token string is not the same as being able to use it — a
      // rejected grant means offline, whatever is sitting in the column.
      connected:
        Boolean(row.access_token) && !needsReauthorization && (accessHours == null || accessHours > 0),
      needsReauthorization,
      reauthorizeUrl: needsReauthorization ? '/api/auth/aliexpress' : undefined,
      accessExpiresAt: row.access_expires_at,
      accessHoursLeft: accessHours,
      refreshExpiresAt: row.refresh_expires_at,
      refreshHoursLeft: refreshHours,
      lastRefreshAt: row.last_refresh_at,
      lastError: row.last_error,
    });
  } catch (error) {
    return NextResponse.json({ connected: false, error: error.message }, { status: 500 });
  }
}
