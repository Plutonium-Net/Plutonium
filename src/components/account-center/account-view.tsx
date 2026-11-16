import { useEffect, useState, type ReactNode } from 'react'
import PillGlass from '@/components/glass-pill/pill-glass'
import { GitHubMark, GoogleMark } from '@/components/account-center/account-marks'
import {
  changePassword,
  deleteAccount,
  getAIUsage,
  getDoc,
  getProviders,
  linkWithOAuth,
  signOut,
  unlinkProvider,
  updateProfile,
  type AuthProvider,
  type CloudUser,
} from '@/lib/cloud-store'

const PROVIDERS: { id: string; label: string; icon: ReactNode }[] = [
  {
    id: 'password',
    label: 'Email & password',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="m4 7.5 8 5.5 8-5.5" />
      </svg>
    ),
  },
  { id: 'google.com', label: 'Google', icon: <GoogleMark /> },
  { id: 'github.com', label: 'GitHub', icon: <GitHubMark /> },
]

function message(error: unknown) {
  return error instanceof Error ? error.message : 'Something went wrong'
}

export default function AccountView({
  user,
  photo,
  onPickPhoto,
  onClose,
}: {
  user: CloudUser
  photo: string
  onPickPhoto: () => void
  onClose: () => void
}) {
  const [name, setName] = useState(user.displayName)
  const [editing, setEditing] = useState(false)
  const [providers, setProviders] = useState<AuthProvider[] | null>(null)
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const [usage, setUsage] = useState<{ remaining: number; max: number } | null>(null)
  const [usageState, setUsageState] = useState<'loading' | 'ready' | 'unavailable'>('loading')
  const [confirmDelete, setConfirmDelete] = useState(false)

  const displayName = user.displayName || user.email.split('@')[0] || 'User'
  const initials =
    displayName
      .split(/\s+/)
      .map((part) => part[0] ?? '')
      .slice(0, 2)
      .join('')
      .toUpperCase() || 'U'

  useEffect(() => {
    let alive = true
    void getProviders()
      .then((list) => {
        if (alive) setProviders(list)
      })
      .catch(() => {
        if (alive) setProviders([])
      })
    return () => {
      alive = false
    }
  }, [user.uid])

  useEffect(() => {
    let alive = true
    void getAIUsage().then((value) => {
      if (!alive) return
      setUsage(value)
      setUsageState(value ? 'ready' : 'unavailable')
    })
    return () => {
      alive = false
    }
  }, [user.uid])

  async function saveName() {
    const next = name.trim()
    setEditing(false)
    if (!next || next === user.displayName) {
      setName(user.displayName)
      return
    }
    try {
      await updateProfile(next)
      setNote({ kind: 'ok', text: 'Name updated.' })
    } catch (error) {
      setName(user.displayName)
      setNote({ kind: 'error', text: message(error) })
    }
  }

  async function savePassword() {
    if (password.length < 6) {
      setNote({ kind: 'error', text: 'Choose a password with at least 6 characters.' })
      return
    }
    setBusy(true)
    setNote(null)
    try {
      await changePassword(password)
      setPassword('')
      setNote({ kind: 'ok', text: 'Password updated.' })
    } catch (error) {
      setNote({ kind: 'error', text: message(error) })
    } finally {
      setBusy(false)
    }
  }

  async function link(provider: 'google' | 'github') {
    setBusy(true)
    setNote(null)
    try {
      await linkWithOAuth(provider)
      setProviders(await getProviders())
      setNote({ kind: 'ok', text: 'Sign-in method linked.' })
    } catch (error) {
      setNote({ kind: 'error', text: message(error) })
    } finally {
      setBusy(false)
    }
  }

  async function unlink(providerId: string) {
    setBusy(true)
    setNote(null)
    try {
      await unlinkProvider(providerId)
      setProviders(await getProviders())
      setNote({ kind: 'ok', text: 'Sign-in method unlinked.' })
    } catch (error) {
      setNote({ kind: 'error', text: message(error) })
    } finally {
      setBusy(false)
    }
  }

  async function exportData() {
    setBusy(true)
    setNote(null)
    const grab = (key: string) => {
      try {
        return JSON.parse(sessionStorage.getItem(key) ?? 'null')
      } catch {
        return null
      }
    }
    try {
      const data = {
        exportedAt: new Date().toISOString(),
        account: { email: user.email, displayName: user.displayName },
        cloud: { tabs: await getDoc('tabs'), preferences: await getDoc('preferences') },
        local: { pins: grab('plu_pins'), net: grab('plu_net') },
      }
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const anchor = document.createElement('a')
      const href = URL.createObjectURL(blob)
      anchor.href = href
      anchor.download = `plutonium-account-data-${new Date().toISOString().slice(0, 10)}.json`
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      window.setTimeout(() => URL.revokeObjectURL(href), 2000)
      setNote({ kind: 'ok', text: 'Export downloaded.' })
    } catch {
      setNote({ kind: 'error', text: 'Could not build the export.' })
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    setBusy(true)
    try {
      await deleteAccount()
      try {
        localStorage.removeItem(`plu_avatar_${user.uid}`)
      } catch {
      }
      onClose()
    } catch (error) {
      setNote({ kind: 'error', text: message(error) })
      setBusy(false)
    }
  }

  const linked = new Set((providers ?? []).map((entry) => entry.providerId))
  const single = (providers ?? []).length <= 1
  const hasPassword = linked.has('password')

  return (
    <div className="acct-signed">
      <div className="acct-profile">
        <button type="button" className="acct-avatar" onClick={onPickPhoto} title="Change photo" aria-label="Change photo">
          {photo ? <img src={photo} alt="" draggable={false} /> : <span>{initials}</span>}
          <span className="acct-avatar__edit" aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <path d="M4 8h3l1.5-2h7L17 8h3v11H4z" />
              <circle cx="12" cy="13" r="3.2" />
            </svg>
          </span>
        </button>

        <div className="acct-profile__meta">
          <div className="acct-profile__name">
            {editing ? (
              <input
                className="acct-input acct-input--name"
                type="text"
                maxLength={40}
                autoFocus
                value={name}
                onChange={(event) => setName(event.target.value)}
                onBlur={() => void saveName()}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') void saveName()
                  if (event.key === 'Escape') {
                    setName(user.displayName)
                    setEditing(false)
                  }
                }}
              />
            ) : (
              <>
                <span className="acct-profile__name-text">{displayName}</span>
                <button
                  type="button"
                  className="acct-edit"
                  aria-label="Edit name"
                  title="Edit name"
                  onClick={() => {
                    setName(displayName)
                    setEditing(true)
                  }}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M4 20h4l10-10-4-4L4 16z" />
                    <path d="m14 6 4 4" />
                  </svg>
                </button>
              </>
            )}
          </div>
          <div className="acct-profile__email">{user.email}</div>
        </div>

        <button
          type="button"
          className="acct-signout"
          onClick={() => {
            signOut()
            onClose()
          }}
        >
          Sign out
        </button>
      </div>

      {note && <div className={`acct-note acct-note--${note.kind}`}>{note.text}</div>}

      <div className="acct-section">
        <div className="acct-section__label">Sign-in methods</div>
        {providers === null && <div className="acct-section__hint">Loading…</div>}
        {providers !== null &&
          PROVIDERS.map((provider) => {
            const isLinked = linked.has(provider.id)
            return (
              <div className="acct-provider" key={provider.id}>
                <span className="acct-provider__icon">{provider.icon}</span>
                <span className="acct-provider__name">{provider.label}</span>
                {isLinked ? (
                  single ? (
                    <span className="acct-provider__state">Linked</span>
                  ) : (
                    <button
                      type="button"
                      className="acct-provider__action"
                      disabled={busy}
                      onClick={() => void unlink(provider.id)}
                    >
                      Unlink
                    </button>
                  )
                ) : (
                  <button
                    type="button"
                    className="acct-provider__action"
                    disabled={busy}
                    onClick={() => {
                      if (provider.id === 'password') {
                        document.getElementById('acct-new-password')?.focus()
                        return
                      }
                      void link(provider.id === 'google.com' ? 'google' : 'github')
                    }}
                  >
                    {provider.id === 'password' ? 'Set' : 'Link'}
                  </button>
                )}
              </div>
            )
          })}
      </div>

      <div className="acct-section">
        <div className="acct-section__label">{hasPassword ? 'Change password' : 'Set a password'}</div>
        <div className="acct-inline">
          <input
            id="acct-new-password"
            className="acct-input"
            type="password"
            autoComplete="new-password"
            placeholder="New password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void savePassword()
            }}
          />
          <button type="button" className="acct-btn" disabled={busy} onClick={() => void savePassword()}>
            <PillGlass radius={9} />
            {hasPassword ? 'Update' : 'Save'}
          </button>
        </div>
      </div>

      <div className="acct-section">
        <div className="acct-section__label">Data</div>
        <button type="button" className="acct-btn acct-btn--wide" disabled={busy} onClick={() => void exportData()}>
          <PillGlass radius={9} />
          Export my data
        </button>
      </div>

      <div className="acct-section">
        <div className="acct-section__label">AI usage</div>
        {usageState === 'loading' && <div className="acct-section__hint">Loading…</div>}
        {usageState === 'unavailable' && <div className="acct-section__hint">AI usage unavailable.</div>}
        {usageState === 'ready' && usage && (
          <div className="acct-quota">
            <span className="acct-quota__track">
              <span
                className="acct-quota__bar"
                style={{ width: `${Math.max(0, Math.min(100, Math.round((usage.remaining / usage.max) * 100)))}%` }}
              />
            </span>
            <span className="acct-quota__text">
              {usage.remaining} of {usage.max} AI requests left in this window
            </span>
          </div>
        )}
      </div>

      <div className="acct-danger">
        {confirmDelete ? (
          <>
            <div className="acct-note acct-note--error">
              Delete this account? Your synced data is removed with it and this cannot be undone.
            </div>
            <div className="acct-inline">
              <button type="button" className="acct-btn" onClick={() => setConfirmDelete(false)} disabled={busy}>
                <PillGlass radius={9} />
                Cancel
              </button>
              <button type="button" className="acct-btn acct-btn--danger" onClick={() => void remove()} disabled={busy}>
                <PillGlass radius={9} />
                Delete forever
              </button>
            </div>
          </>
        ) : (
          <button type="button" className="acct-btn acct-btn--danger-outline" onClick={() => setConfirmDelete(true)}>
            <PillGlass radius={9} />
            Delete account
          </button>
        )}
      </div>
    </div>
  )
}
