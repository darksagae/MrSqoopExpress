import { NextResponse } from 'next/server';
import { verifyEmailCode } from '@/lib/users';

/**
 * POST /api/auth/verify-code  { email, code }
 * Confirms an email from the 6-digit code the user received. On success the
 * account is activated and the client can sign in.
 */
export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  const email = (body.email || '').trim();
  const code = (body.code || '').trim();
  if (!email || !code) {
    return NextResponse.json({ error: 'Enter the code we emailed you.' }, { status: 400 });
  }

  const result = await verifyEmailCode(email, code);
  if (!result.ok) {
    return NextResponse.json({ error: 'That code is wrong or has expired. Request a new one.' }, { status: 400 });
  }
  return NextResponse.json({ success: true });
}
