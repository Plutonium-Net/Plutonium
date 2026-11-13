import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useAccount } from '@/hooks/use-account'

/**
 * Temporary: enough account surface to exercise cloud tab sync. This is not the
 * ported v1 account dialog — no OAuth, avatars, providers or password reset.
 */
/**
 * `showTrigger` keeps the corner button on the home screen only. The dialog still
 * renders anywhere, so the games page save chip can open it.
 */
export default function AccountPanel({ showTrigger = true }: { showTrigger?: boolean }) {
  const { user, signIn, signUp, signOut } = useAccount()
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  // The games page's save chip points here when there is no account yet.
  useEffect(() => {
    const open = () => setOpen(true)
    window.addEventListener('plu:open-account', open)
    return () => window.removeEventListener('plu:open-account', open)
  }, [])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      if (mode === 'signin') await signIn(email, password)
      else await signUp(email, password)
      setPassword('')
      setOpen(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      {showTrigger && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="fixed left-6 top-[58px] z-30 max-w-[60vw] truncate rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-xs text-white/70 transition hover:bg-white/10 hover:text-white"
      >
          {user ? user.email || 'Signed in' : 'Sign in'}
        </button>
      )}

      {open && (
        <div className="fixed inset-0 z-40 grid place-items-center bg-black/60 p-4">
          <div className="w-full max-w-xs rounded-xl border border-white/10 bg-[#121212] p-4 text-sm text-white/80">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-white">{user ? 'Account' : mode === 'signin' ? 'Sign in' : 'Create account'}</span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded px-2 text-white/50 hover:text-white"
                aria-label="Close"
              >
                ×
              </button>
            </div>

            {user ? (
              <div className="space-y-3">
                <div className="truncate text-white/60">{user.email}</div>
                <button
                  type="button"
                  onClick={() => {
                    signOut()
                    setOpen(false)
                  }}
                  className="w-full rounded-lg border border-white/15 px-3 py-2 text-white/80 transition hover:bg-white/10 hover:text-white"
                >
                  Sign out
                </button>
              </div>
            ) : (
              <form onSubmit={submit} className="space-y-2">
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="Email"
                  autoComplete="email"
                  className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-white outline-none placeholder:text-white/30 focus:border-white/30"
                />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Password"
                  autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                  className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-white outline-none placeholder:text-white/30 focus:border-white/30"
                />
                {error && <div className="text-xs text-red-400">{error}</div>}
                <button
                  type="submit"
                  disabled={busy}
                  className="w-full rounded-lg bg-white/10 px-3 py-2 text-white transition hover:bg-white/15 disabled:opacity-50"
                >
                  {busy ? 'Working…' : mode === 'signin' ? 'Sign in' : 'Create account'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMode(mode === 'signin' ? 'signup' : 'signin')
                    setError('')
                  }}
                  className="w-full pt-1 text-xs text-white/50 hover:text-white/80"
                >
                  {mode === 'signin' ? 'No account? Create one' : 'Have an account? Sign in'}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  )
}
