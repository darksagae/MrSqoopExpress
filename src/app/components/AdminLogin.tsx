import { FormEvent, useState } from 'react'
import { Logo } from './Logo'
import { adminLogin } from '../lib/adminAuth'
import { requestPasswordReset } from '../lib/ordersApi'
import { publicSiteHref } from '../lib/site'

const GOLD = '#E8B923'

export function AdminLogin({ onSuccess }: { onSuccess: () => void }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loginError, setLoginError] = useState('')

  const [submitting, setSubmitting] = useState(false)
  const [resetRequested, setResetRequested] = useState(false)
  const [resetSubmitting, setResetSubmitting] = useState(false)

  const handleForgotCredentials = async () => {
    setResetSubmitting(true)
    try {
      await requestPasswordReset()
    } finally {
      setResetSubmitting(false)
      setResetRequested(true)
    }
  }

  const handleLogin = async (event: FormEvent) => {
    event.preventDefault()
    setSubmitting(true)

    const ok = await adminLogin(username, password)
    if (!ok) {
      setLoginError('Invalid username or password.')
      setSubmitting(false)
      return
    }

    setLoginError('')
    onSuccess()
  }

  return (
    <div className="liquid-glass-scene fixed inset-0 flex flex-col overflow-y-auto bg-black">
      <div className="liquid-glass-glow pointer-events-none absolute inset-x-0 top-0 h-[70%]" aria-hidden>
        <div className="liquid-blob liquid-blob-1" />
        <div className="liquid-blob liquid-blob-3" />
      </div>

      <div className="relative z-10 mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-5 py-10">
        <div className="glass-panel rounded-[2rem] p-8 md:p-10">
          <div className="flex justify-center">
            <Logo className="h-20 md:h-24" />
          </div>

          <form onSubmit={handleLogin} className="mt-8 space-y-4">
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium uppercase tracking-[0.14em] text-white/45">
                Username
              </span>
              <input
                type="text"
                value={username}
                onChange={(event) => {
                  setUsername(event.target.value)
                  if (loginError) setLoginError('')
                }}
                placeholder="Enter username"
                autoComplete="username"
                className="glass-input w-full rounded-2xl px-5 py-3.5 text-[15px] text-white placeholder:text-white/30 outline-none"
              />
            </label>

            <label className="block">
              <span className="mb-1.5 block text-xs font-medium uppercase tracking-[0.14em] text-white/45">
                Password
              </span>
              <input
                type="password"
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value)
                  if (loginError) setLoginError('')
                }}
                placeholder="Enter password"
                autoComplete="current-password"
                className="glass-input w-full rounded-2xl px-5 py-3.5 text-[15px] text-white placeholder:text-white/30 outline-none"
              />
            </label>

            {loginError && (
              <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-sm text-red-300">
                {loginError}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="glass-button mt-2 w-full rounded-2xl py-3.5 text-base font-bold text-black transition hover:brightness-110 active:scale-[0.99] disabled:opacity-60"
              style={{ backgroundColor: GOLD }}
            >
              {submitting ? 'Signing in...' : 'Sign In'}
            </button>
          </form>

          <div className="mt-5 text-center">
            {resetRequested ? (
              <p className="text-sm text-white/50">
                If configured, a reset link has been sent to info@mrsqoopexpress.com.
              </p>
            ) : (
              <button
                type="button"
                disabled={resetSubmitting}
                onClick={() => void handleForgotCredentials()}
                className="text-sm text-white/40 transition hover:text-white/70 disabled:opacity-60"
              >
                {resetSubmitting ? 'Sending reset link...' : 'Forgot username or password?'}
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="relative z-10 bg-black px-5 pb-10 pt-2 text-center">
        <a
          href={publicSiteHref('/')}
          className="text-sm text-white/40 transition hover:text-white/70"
        >
          Back to tracking
        </a>
      </div>
    </div>
  )
}
