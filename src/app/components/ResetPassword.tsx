import { FormEvent, useState } from 'react'
import { Logo } from './Logo'
import { ApiError, resetPassword } from '../lib/ordersApi'

const GOLD = '#E8B923'

export function ResetPassword({ token, onDone }: { token: string; onDone: () => void }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()

    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setSubmitting(true)
    setError('')

    try {
      await resetPassword(token, username, password)
      setDone(true)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not reset credentials.')
    } finally {
      setSubmitting(false)
    }
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

          {done ? (
            <div className="mt-8 space-y-4 text-center">
              <p className="text-sm text-white/70">
                Your admin username and password have been updated.
              </p>
              <button
                type="button"
                onClick={onDone}
                className="glass-button w-full rounded-2xl py-3.5 text-base font-bold text-black transition hover:brightness-110 active:scale-[0.99]"
                style={{ backgroundColor: GOLD }}
              >
                Go to Sign In
              </button>
            </div>
          ) : (
            <form onSubmit={(event) => void handleSubmit(event)} className="mt-8 space-y-4">
              <p className="text-sm text-white/60">Set a new admin username and password.</p>

              <label className="block">
                <span className="mb-1.5 block text-xs font-medium uppercase tracking-[0.14em] text-white/45">
                  New Username
                </span>
                <input
                  type="text"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  placeholder="Enter new username"
                  autoComplete="username"
                  className="glass-input w-full rounded-2xl px-5 py-3.5 text-[15px] text-white placeholder:text-white/30 outline-none"
                />
              </label>

              <label className="block">
                <span className="mb-1.5 block text-xs font-medium uppercase tracking-[0.14em] text-white/45">
                  New Password
                </span>
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="At least 8 characters"
                  autoComplete="new-password"
                  className="glass-input w-full rounded-2xl px-5 py-3.5 text-[15px] text-white placeholder:text-white/30 outline-none"
                />
              </label>

              <label className="block">
                <span className="mb-1.5 block text-xs font-medium uppercase tracking-[0.14em] text-white/45">
                  Confirm Password
                </span>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  placeholder="Re-enter new password"
                  autoComplete="new-password"
                  className="glass-input w-full rounded-2xl px-5 py-3.5 text-[15px] text-white placeholder:text-white/30 outline-none"
                />
              </label>

              {error && (
                <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-sm text-red-300">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="glass-button mt-2 w-full rounded-2xl py-3.5 text-base font-bold text-black transition hover:brightness-110 active:scale-[0.99] disabled:opacity-60"
                style={{ backgroundColor: GOLD }}
              >
                {submitting ? 'Saving...' : 'Save New Credentials'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
