import { aliexpressDS } from '@/lib/aliexpress';
import { initTokenSchema } from '@/lib/ali-tokens';

/**
 * GET /api/auth/aliexpress/callback?code=...
 *
 * AliExpress redirects here after the account owner authorizes. The code is
 * exchanged for a token pair which is written straight to the token store —
 * nothing is copied into an env var by hand. That matters: AliExpress rotates
 * the refresh token on every renewal, so a token pinned in the environment goes
 * stale the first time it is refreshed and the shop drops offline for good.
 */
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const error = searchParams.get('error') || searchParams.get('error_description');

  if (error) {
    return page('❌ Authorization failed', `<p>${escapeHtml(error)}</p>`);
  }
  if (!code) {
    return page('❌ No code returned', '<p>AliExpress did not send an authorization code.</p>');
  }

  try {
    // Safe to call on every authorization; it is CREATE TABLE IF NOT EXISTS.
    await initTokenSchema();

    const { resp, parsed, stored } = await aliexpressDS.exchangeCodeForToken(code);

    if (!stored) {
      return page(
        '⚠️ No access token in response',
        `<p>The exchange returned, but no access_token was found, so nothing was saved.</p>
         <pre>${escapeHtml(redact(resp))}</pre>`
      );
    }

    const until = (d) => (d ? new Date(d).toUTCString() : 'not reported by AliExpress');

    return page(
      '✅ Connected',
      `<p>The token pair is saved in the database and will renew itself automatically.
          Nothing needs to be copied anywhere.</p>
       <table>
         <tr><td>Access token valid until</td><td>${escapeHtml(until(parsed.accessExpiresAt))}</td></tr>
         <tr><td>Refresh token valid until</td><td>${escapeHtml(until(parsed.refreshExpiresAt))}</td></tr>
       </table>
       <p class="muted">Connection health is available to operators at
          <code>/api/admin/aliexpress/token</code>.</p>`
    );
  } catch (e) {
    return page(
      '❌ Token exchange error',
      `<p>${escapeHtml(e.message)}</p>${e.raw ? `<pre>${escapeHtml(e.raw)}</pre>` : ''}`
    );
  }
}

/**
 * Tokens must never be rendered into a page — this callback URL ends up in
 * browser history, and the whole point of the store is that no human handles
 * the secret. Show the response shape, not its credentials.
 */
function redact(resp) {
  const clone = JSON.parse(JSON.stringify(resp ?? {}));
  const walk = (o) => {
    for (const k of Object.keys(o || {})) {
      if (/token/i.test(k) && typeof o[k] === 'string') o[k] = `«${o[k].length}-char value hidden»`;
      else if (o[k] && typeof o[k] === 'object') walk(o[k]);
    }
  };
  walk(clone);
  return JSON.stringify(clone, null, 2);
}

function page(title, bodyHtml) {
  const html = `<!doctype html><html><head><meta charset="utf-8">
    <title>${title}</title>
    <style>
      body{font-family:system-ui,sans-serif;max-width:720px;margin:40px auto;padding:0 16px;color:#222}
      pre{background:#f4f4f4;padding:12px;border-radius:6px;overflow-x:auto;white-space:pre-wrap;word-break:break-all}
      code{background:#f4f4f4;padding:2px 5px;border-radius:4px}
      h1{font-size:1.5em}
      table{border-collapse:collapse;margin:16px 0}
      td{border:1px solid #ddd;padding:6px 10px}
      td:first-child{color:#666}
      .muted{color:#666;font-size:.9em}
    </style></head>
    <body><h1>${title}</h1>${bodyHtml}</body></html>`;
  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
