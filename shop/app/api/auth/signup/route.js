import { NextResponse } from 'next/server';
import { createUser } from '@/lib/users';
import { sendVerificationEmail, isEmailConfigured } from '@/lib/email';

/**
 * POST /api/auth/signup  { name, email, password }
 * Creates an email+password account. Sign-in is then done through Auth.js
 * (the Credentials provider) from the client.
 */
export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  const name = (body.name || '').trim();
  const email = (body.email || '').trim();
  const password = body.password || '';

  if (!email || !password) {
    return NextResponse.json({ error: 'Email and password are required.' }, { status: 400 });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'Please enter a valid email address.' }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: 'Password must be at least 8 characters.' }, { status: 400 });
  }

  try {
    const user = await createUser({ name, email, password });

    // Send the verification email. If email isn't configured yet, don't fail
    // the signup — report it so the UI can fall back gracefully.
    let emailSent = false;
    if (isEmailConfigured()) {
      try {
        await sendVerificationEmail({ to: user.email, name: user.name, code: user.verifyCode });
        emailSent = true;
      } catch (e) {
        console.error('Verification email failed:', e.message);
      }
    }

    return NextResponse.json(
      {
        success: true,
        needsVerification: true,
        emailSent,
        user: { id: user.id, name: user.name, email: user.email },
      },
      { status: 201 }
    );
  } catch (error) {
    if (error.code === 'EMAIL_TAKEN') {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    console.error('Signup failed:', error);
    return NextResponse.json({ error: 'Could not create your account. Please try again.' }, { status: 500 });
  }
}
