import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { createAssistServer } from '@/lib/assist/server';
import { signedInUser } from '@/lib/session';

/**
 * POST /api/mcp
 *
 * Sqoop Assist: the MCP server (spec 2025-11-25, Streamable HTTP) that lets
 * Alexa+ search products, quote delivered prices, track orders and read deals.
 * For a customer signed in on this site (the /assist page) it can also list
 * their orders, place orders and check their payments.
 * Stateless: every request gets a fresh server, so it runs fine on serverless.
 */
export const dynamic = 'force-dynamic';

// Act for the signed-in customer only when the call comes from our own pages,
// so another site can't use a visitor's session to order in their name.
function sameSite(request) {
  const host = request.headers.get('host');
  const from = request.headers.get('origin') || request.headers.get('referer');
  if (!host || !from) return false;
  try {
    return new URL(from).host === host;
  } catch {
    return false;
  }
}

export async function POST(request) {
  // ASSIST_STORE_URL lets a local dev server read from production data.
  const base = process.env.ASSIST_STORE_URL || new URL(request.url).origin;
  const account = sameSite(request) ? await signedInUser() : null;
  const server = createAssistServer(base, { account });
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  try {
    await server.connect(transport);
    return await transport.handleRequest(request);
  } catch (error) {
    console.error('[mcp] request failed:', error);
    return Response.json(
      { jsonrpc: '2.0', error: { code: -32603, message: 'Internal server error' }, id: null },
      { status: 500 }
    );
  } finally {
    // JSON responses are complete once handleRequest resolves.
    await transport.close().catch(() => {});
    await server.close().catch(() => {});
  }
}

// No SSE stream or session to open or close on a stateless server.
const notAllowed = () =>
  Response.json({ jsonrpc: '2.0', error: { code: -32000, message: 'Method not allowed.' }, id: null }, { status: 405 });

export const GET = notAllowed;
export const DELETE = notAllowed;
