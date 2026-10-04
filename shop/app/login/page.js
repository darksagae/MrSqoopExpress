'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { signIn } from 'next-auth/react';
import { nextFromUrl } from '@/lib/next-path';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [banner, setBanner] = useState(null);
  const [showResend, setShowResend] = useState(false);
  const [resendMsg, setResendMsg] = useState(null);
  const [code, setCode] = useState('');
  const [codeMsg, setCodeMsg] = useState(null);

  // React to ?verified=1 / ?verify_error=1 from the email link.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (q.get('verified')) setBanner({ ok: true, text: 'Email verified — you can log in now.' });
    else if (q.get('verify_error')) setBanner({ ok: false, text: 'That verification link is invalid or expired. Log in to resend a new one.' });
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    setResendMsg(null);
    setBusy(true);
    try {
      const login = await signIn('credentials', { email, password, redirect: false });
      if (login?.error) {
        // Could be wrong credentials OR an unverified email — offer resend either way.
        setError('Wrong email or password, or your email isn’t verified yet.');
        setShowResend(true);
        return;
      }
      router.push(nextFromUrl());
      router.refresh();
    } catch (err) {
      setError('Something went wrong. Please try again. ' + err.message);
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
      setResendMsg(data.message || 'If that email needs confirming, we’ve sent a new code.');
    } catch {
      setResendMsg('Could not send right now. Please try again.');
    }
  };

  const confirmCode = async () => {
    setCodeMsg('Confirming…');
    try {
      const res = await fetch('/api/auth/verify-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code }),
      });
      const data = await res.json();
      if (!res.ok) { setCodeMsg(data.error || 'That code didn’t work.'); return; }
      // Confirmed — sign in now.
      const login = await signIn('credentials', { email, password, redirect: false });
      if (login?.error) { setCodeMsg('Confirmed — please log in.'); return; }
      router.push(nextFromUrl());
      router.refresh();
    } catch {
      setCodeMsg('Could not confirm right now. Please try again.');
    }
  };

  return (
    <div className="auth">
      <div className="auth-card">
        <h1 className="auth-title">Welcome back</h1>
        <p className="auth-sub">Log in to MrSqoopExpress.</p>

        {banner && <div className={banner.ok ? 'auth-success' : 'auth-error'}>{banner.text}</div>}

        <button className="auth-google" onClick={() => signIn('google', { callbackUrl: nextFromUrl() })}>
          <GoogleIcon /> Continue with Google
        </button>

        <div className="auth-divider"><span>or</span></div>

        <form onSubmit={submit}>
          <label className="auth-field">
            <span>Email</span>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@email.com" required />
          </label>
          <label className="auth-field">
            <span>Password</span>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Your password" required />
          </label>

          {error && <div className="auth-error">{error}</div>}
          {showResend && (
            <div className="auth-verify-box">
              <p className="auth-verify-title">Email not confirmed?</p>
              <p className="auth-verify-hint">Enter the 6-digit code we emailed you:</p>
              <div className="auth-verify-row">
                <input
                  className="auth-code-input small"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))}
                  placeholder="______"
                  inputMode="numeric"
                  maxLength={6}
                />
                <button type="button" className="auth-verify-btn" onClick={confirmCode} disabled={code.length !== 6}>Confirm</button>
              </div>
              {codeMsg && <p className="auth-resend-msg">{codeMsg}</p>}
              <p className="auth-resend">
                <button type="button" onClick={resend} disabled={!email}>Resend code</button>
                {resendMsg && <span className="auth-resend-msg"> {resendMsg}</span>}
              </p>
            </div>
          )}

          <button className="btn-dark auth-submit" disabled={busy}>
            {busy ? 'Logging in…' : 'Log in'}
          </button>
        </form>

        <p className="auth-alt">New here? <Link href={`/signup${nextQuery()}`}>Create an account</Link></p>
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
