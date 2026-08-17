import { NextResponse } from 'next/server';
import { refreshVerifyCode } from '@/lib/users';
import { sendVerificationEmail, isEmailConfigured } from '@/lib/email';

/**
 * POST /api/auth/resend-verification  { email }
 * Issues a fresh verification link and emails it. Always returns success so the
 * endpoint can't be used to probe which emails have accounts.
 */
export async function POST(request) {
  let email;
  try {
    ({ email } = await request.json());
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }
  if (!email) return NextResponse.json({ error: 'Email is required.' }, { status: 400 });

  if (isEmailConfigured()) {
    try {
      const code = await refreshVerifyCode(email);
      if (code) await sendVerificationEmail({ to: email, code });
    } catch (e) {
      console.error('Resend verification failed:', e.message);
    }
  }

  // Neutral response regardless of whether the account exists / was verified.
  return NextResponse.json({
    ok: true,
    message: 'If that email needs confirming, we’ve sent a new code.',
  });
}
