import { aliexpressDS } from '@/lib/aliexpress';

/**
 * GET /api/auth/aliexpress/callback?code=...
 * AliExpress redirects here after the user authorizes. We exchange the code
 * for an access token and show it so you can paste it into .env.local.
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
    const result = await aliexpressDS.exchangeCodeForToken(code);

    const accessToken = result.access_token || result?.data?.access_token;
    const refreshToken = result.refresh_token || result?.data?.refresh_token;

    if (!accessToken) {
      return page(
        '⚠️ No access token in response',
        `<p>The exchange returned, but no access_token was found. Full response:</p>
         <pre>${escapeHtml(JSON.stringify(result, null, 2))}</pre>`
      );
    }

    return page(
      '✅ Authorization successful',
      `<p>Copy this into your <code>.env.local</code>:</p>
       <pre>ALIEXPRESS_ACCESS_TOKEN=${escapeHtml(accessToken)}</pre>
       ${refreshToken ? `<p>Refresh token (save it too):</p><pre>ALIEXPRESS_REFRESH_TOKEN=${escapeHtml(refreshToken)}</pre>` : ''}
       <p>Then restart the dev server. Real products will start loading.</p>
       <details><summary>Full response</summary><pre>${escapeHtml(JSON.stringify(result, null, 2))}</pre></details>`
    );
  } catch (e) {
    return page(
      '❌ Token exchange error',
      `<p>${escapeHtml(e.message)}</p>${e.raw ? `<pre>${escapeHtml(e.raw)}</pre>` : ''}`
    );
  }
}

function page(title, bodyHtml) {
  const html = `<!doctype html><html><head><meta charset="utf-8">
    <title>${title}</title>
    <style>
      body{font-family:system-ui,sans-serif;max-width:720px;margin:40px auto;padding:0 16px;color:#222}
      pre{background:#f4f4f4;padding:12px;border-radius:6px;overflow-x:auto;white-space:pre-wrap;word-break:break-all}
      code{background:#f4f4f4;padding:2px 5px;border-radius:4px}
      h1{font-size:1.5em}
    </style></head>
    <body><h1>${title}</h1>${bodyHtml}</body></html>`;
  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
