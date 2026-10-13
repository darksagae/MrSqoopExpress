'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { signIn } from 'next-auth/react';
import { nextFromUrl } from '@/lib/next-path';
import { track } from '@/lib/meta-pixel';

export default function SignupPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(null); // { emailSent } once account created → code step

  // Code-entry step state
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState(null);
  const [resendMsg, setResendMsg] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    if (password.length < 8) return setError('Password must be at least 8 characters.');

    setBusy(true);
    try {
      // Create the account, then confirm via the emailed code before signing in.
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Sign-up failed.'); return; }
      setSent({ emailSent: data.emailSent });
    } catch (err) {
      setError('Something went wrong. Please try again. ' + err.message);
    } finally {
      setBusy(false);
    }
  };

  const confirmCode = async (e) => {
    e.preventDefault();
    setCodeError(null);
    setBusy(true);
    try {
      const res = await fetch('/api/auth/verify-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code }),
      });
      const data = await res.json();
      if (!res.ok) { setCodeError(data.error || 'That code didn’t work.'); return; }
      track('CompleteRegistration', { status: true });

      // Verified — sign them straight in with the credentials they just used.
      const login = await signIn('credentials', { email, password, redirect: false });
      if (login?.error) { router.push('/login?verified=1'); return; }
      router.push(nextFromUrl());
      router.refresh();
    } catch (err) {
      setCodeError('Something went wrong. Please try again. ' + err.message);
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    setResendMsg('Sending…');
    try {
      const res = await fetch('/api/auth/resend-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      setResendMsg(data.message || 'We’ve sent a new code.');
    } catch {
      setResendMsg('Could not send right now. Please try again.');
    }
  };

  // Account created — enter the emailed code to confirm.
  if (sent) {
    return (
      <div className="auth">
        <div className="auth-card">
          <div className="auth-check">✉️</div>
          <h1 className="auth-title">Enter your code</h1>
          <p className="auth-sub">
            We emailed a 6-digit code to <strong>{email}</strong>. Enter it below to confirm your
            account.
          </p>
          {!sent.emailSent && (
            <div className="auth-error">
              Email delivery isn’t switched on yet, so the code couldn’t be sent. Contact support to
              confirm your account.
            </div>
          )}
          <form onSubmit={confirmCode}>
            <input
              className="auth-code-input"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))}
              placeholder="______"
              inputMode="numeric"
              maxLength={6}
              autoFocus
            />
            {codeError && <div className="auth-error">{codeError}</div>}
            <button className="btn-dark auth-submit" disabled={busy || code.length !== 6}>
              {busy ? 'Confirming…' : 'Confirm & continue'}
            </button>
          </form>
          <p className="auth-alt">
            Didn’t get it? <button type="button" className="auth-linkbtn" onClick={resend}>Resend code</button>
            {resendMsg && <span className="auth-resend-msg"> {resendMsg}</span>}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="auth">
      <div className="auth-card">
        <h1 className="auth-title">Create your account</h1>
        <p className="auth-sub">Join MrSqoopExpress to track your orders.</p>

        <button className="auth-google" onClick={() => signIn('google', { callbackUrl: nextFromUrl() })}>
          <GoogleIcon /> Continue with Google
        </button>

        <div className="auth-divider"><span>or</span></div>

        <form onSubmit={submit}>
          <label className="auth-field">
            <span>Full name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Amina Nakato" />
          </label>
          <label className="auth-field">
            <span>Email</span>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@email.com" required />
          </label>
          <label className="auth-field">
            <span>Password</span>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" required />
          </label>

          {error && <div className="auth-error">{error}</div>}

          <button className="btn-dark auth-submit" disabled={busy}>
            {busy ? 'Creating…' : 'Create account'}
          </button>
        </form>

        <p className="auth-alt">Already have an account? <Link href={`/login${nextQuery()}`}>Log in</Link></p>
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.71-1.57 2.68-3.89 2.68-6.62z"/>
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z"/>
      <path fill="#FBBC05" d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33z"/>
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.47.9 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z"/>
    </svg>
  );
}

function nextQuery() {
  const n = nextFromUrl('');
  return n ? `?next=${encodeURIComponent(n)}` : '';
}
