import { NextResponse } from 'next/server';
import { aliexpressDS } from '@/lib/aliexpress';

/**
 * GET /api/auth/aliexpress
 * Kicks off AliExpress authorization by redirecting to their login/consent page.
 */
export async function GET() {
  if (!aliexpressDS.appKey) {
    return NextResponse.json(
      { error: 'NEXT_PUBLIC_ALIEXPRESS_APP_KEY not configured' },
      { status: 500 }
    );
  }
  if (!process.env.ALIEXPRESS_CALLBACK_URL) {
    return NextResponse.json(
      {
        error: 'ALIEXPRESS_CALLBACK_URL not set in .env.local',
        hint: 'Set it to the exact callback URL you registered on your AliExpress app, e.g. http://localhost:3000/api/auth/aliexpress/callback',
      },
      { status: 500 }
    );
  }
  return NextResponse.redirect(aliexpressDS.getAuthorizeUrl());
}
