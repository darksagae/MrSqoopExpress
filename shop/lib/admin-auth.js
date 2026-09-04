/**
 * Shared guard for operator-only endpoints.
 *
 * These routes either disclose operational state or spend AliExpress API quota
 * on demand, so they must not be open to the internet just because they sit
 * under /api/admin. There is no session middleware in this app yet, so the
 * check is a shared secret — weaker than real auth, but the difference between
 * "operator only" and "anyone with the URL".
 */
export function isAdminRequest(request) {
  const secret = process.env.ADMIN_API_SECRET;
  // Refusing everything when unset is the safe default: an unset secret must
  // never read as "no protection required".
  if (!secret) return false;

  const header = request.headers.get('authorization') || '';
  if (header === `Bearer ${secret}`) return true;

  // Convenience for browser checks, where setting a header is awkward.
  const url = new URL(request.url);
  return url.searchParams.get('key') === secret;
}

export function adminDenied() {
  return Response.json(
    { error: 'Unauthorized. Pass the admin secret as a Bearer token or ?key=.' },
    { status: 401 }
  );
}
