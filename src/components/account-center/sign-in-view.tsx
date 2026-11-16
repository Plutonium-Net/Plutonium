import { useState, type FormEvent } from 'react'
import PillGlass from '@/components/glass-pill/pill-glass'
import { GitHubMark, GoogleMark } from '@/components/account-center/account-marks'
import { resetPassword, signInWithEmail, signInWithOAuth, signUp } from '@/lib/cloud-store'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

function friendly(raw: string) {
  const text = raw.toLowerCase()
  if (text.includes('invalid_login_credentials') || text.includes('email_not_found') || text.includes('invalid password')) {
    return 'That email and password do not match an account.'
  }
  if (text.includes('email_exists')) return 'An account with that email already exists. Sign in instead.'
  if (text.includes('weak_password')) return 'Choose a password with at least 6 characters.'
  if (text.includes('invalid_email')) return 'That email address does not look right.'
  if (text.includes('too_many_attempts')) return 'Too many attempts. Wait a moment and try again.'
  return raw
}

export default function SignInView() {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    setError('')
    setNotice('')
    if (!EMAIL_RE.test(email.trim()) || !password) {
      setError('Enter your email and password.')
      return
    }
    if (mode === 'signup' && !name.trim()) {
      setError('Please enter your name.')
      return
    }

    setBusy(true)
    try {
      if (mode === 'signup') await signUp(email.trim(), password, name.trim())
      else await signInWithEmail(email.trim(), password)
    } catch (err) {
      setError(friendly(err instanceof Error ? err.message : 'Sign in failed'))
    } finally {
      setBusy(false)
    }
  }

  async function oauth(provider: 'google' | 'github') {
    if (busy) return
    setError('')
    setNotice('')
    setBusy(true)
    try {
      await signInWithOAuth(provider)
    } catch (err) {
      setError(friendly(err instanceof Error ? err.message : 'Sign in failed'))
    } finally {
      setBusy(false)
    }
  }

  async function forgot() {
    const address = email.trim()
    setNotice('')
    if (!EMAIL_RE.test(address)) {
      setError('Enter your account email first.')
      return
    }
    setError('')
    setBusy(true)
    try {
      await resetPassword(address)
      setNotice('Reset email sent. Check your inbox.')
    } catch {
      setError('Could not send the reset email.')
    } finally {
      setBusy(false)
    }
  }

  const signingUp = mode === 'signup'

  return (
    <div className="account-center__signin">
      <div className="acct-oauth">
        <button type="button" className="acct-oauth__btn" onClick={() => void oauth('google')} disabled={busy}>
          <PillGlass radius={10} />
          <span className="acct-oauth__icon">
            <GoogleMark />
          </span>
          Continue with Google
        </button>
        <button type="button" className="acct-oauth__btn" onClick={() => void oauth('github')} disabled={busy}>
          <PillGlass radius={10} />
          <span className="acct-oauth__icon">
            <GitHubMark />
          </span>
          Continue with GitHub
        </button>
      </div>

      <div className="acct-or">
        <span>or continue with email</span>
      </div>

      <form className="acct-form" onSubmit={submit} noValidate>
        {signingUp && (
          <label className="acct-field">
            <span className="acct-field__label">Your name</span>
            <input
              className="acct-input"
              type="text"
              autoComplete="name"
              maxLength={120}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
        )}

        <label className="acct-field">
          <span className="acct-field__label">Email</span>
          <input
            className="acct-input"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
          />
        </label>

        <label className="acct-field">
          <span className="acct-field__label">Password</span>
          <input
            className="acct-input"
            type="password"
            autoComplete={signingUp ? 'new-password' : 'current-password'}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder={signingUp ? 'At least 6 characters' : ''}
          />
        </label>

        {error && (
          <div className="acct-note acct-note--error" role="alert">
            {error}
          </div>
        )}
        {notice && <div className="acct-note acct-note--ok">{notice}</div>}

        <button type="submit" className="acct-btn acct-btn--primary" disabled={busy}>
          <PillGlass radius={10} />
          {busy ? 'Working…' : signingUp ? 'Create account' : 'Sign in'}
        </button>
      </form>

      <div className="acct-signin-foot">
        <button
          type="button"
          className="acct-link"
          onClick={() => {
            setMode(signingUp ? 'signin' : 'signup')
            setError('')
            setNotice('')
          }}
        >
          {signingUp ? 'Already have an account? Sign in' : 'No account? Create a free one'}
        </button>
        <button type="button" className="acct-link acct-link--muted" onClick={() => void forgot()}>
          Forgot password?
        </button>
      </div>
    </div>
  )
}
