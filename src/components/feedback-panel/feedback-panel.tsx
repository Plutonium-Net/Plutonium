import { useState, type FormEvent, type ReactNode } from 'react'
import Modal from '@/components/modal/modal'
import PillGlass from '@/components/glass-pill/pill-glass'
import { useAccount } from '@/hooks/use-account'
import { ENDPOINT, TYPES, type FeedbackField, type FeedbackType } from '@/lib/feedback'
import { getNet } from '@/lib/net/net-store'
import './feedback-panel.css'

const DISCORD = 'https://discord.gg/R3dJ7hpUXX'
const TIMEOUT_MS = 60_000
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

type Values = Record<string, string | boolean>

type Reply = {
  ok?: boolean
  reference?: string
  threadUrl?: string
  attributedTo?: string
  message?: string
  fields?: { field?: string; message?: string }[]
}

const ICONS: Record<FeedbackType['icon'], ReactNode> = {
  bug: (
    <>
      <circle cx="12" cy="13" r="5.5" />
      <path d="M9.5 8 8 6M14.5 8 16 6M6.5 13H3M21 13h-3.5M7.5 17.5 5.5 19.5M16.5 17.5l2 2" />
    </>
  ),
  feature: (
    <>
      <path d="M9.5 18h5M10.5 21h3" />
      <path d="M12 3.5a5.5 5.5 0 0 0-3.2 9.9v1.6h6.4v-1.6A5.5 5.5 0 0 0 12 3.5z" />
    </>
  ),
  account: (
    <>
      <circle cx="12" cy="8.5" r="3.5" />
      <path d="M5 20a7 7 0 0 1 14 0" />
    </>
  ),
  abuse: (
    <>
      <path d="M12 4.5 3.5 19.5h17z" />
      <path d="M12 10v4M12 17h.01" />
    </>
  ),
  dmca: (
    <>
      <path d="M12 4v16M5.5 8h13" />
      <path d="M7.5 8 4.5 15h6zM16.5 8l-3 7h6z" />
    </>
  ),
  other: (
    <>
      <path d="M20 15a2 2 0 0 1-2 2H8l-4 3V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2z" />
      <path d="M8 9h8M8 12.5h5" />
    </>
  ),
}

function diagnostics() {
  const diag: Record<string, string> = {}
  diag.url = location.href
  if (document.referrer) diag.referrer = document.referrer
  diag.engine = getNet().engine
  diag.viewport = `${window.innerWidth}x${window.innerHeight}`
  diag.platform = navigator.userAgent
  if (navigator.language) diag.language = navigator.language
  try {
    diag.timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
  } catch {
  }
  diag.online = navigator.onLine === false ? 'offline' : 'online'
  Object.keys(diag).forEach((key) => {
    if (diag[key].length > 200) diag[key] = diag[key].slice(0, 200)
  })
  return diag
}

function Field({
  field,
  value,
  error,
  onChange,
}: {
  field: FeedbackField
  value: string | boolean | undefined
  error?: string
  onChange: (value: string | boolean) => void
}) {
  if (field.kind === 'checkbox') {
    return (
      <label className={`fb-field fb-field--check${error ? ' is-invalid' : ''}`}>
        <input type="checkbox" checked={value === true} onChange={(event) => onChange(event.target.checked)} />
        <span>
          {field.label}
          {field.required && <em className="fb-field__required">required</em>}
        </span>
        {error && <span className="fb-field__error">{error}</span>}
      </label>
    )
  }

  const text = typeof value === 'string' ? value : ''

  return (
    <label className={`fb-field${error ? ' is-invalid' : ''}`}>
      <span className="fb-field__label">
        {field.label}
        {field.required && <em className="fb-field__required">required</em>}
      </span>
      {field.kind === 'textarea' ? (
        <textarea
          className="fb-input fb-input--area"
          rows={4}
          maxLength={field.max}
          placeholder={field.placeholder}
          value={text}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : field.kind === 'select' ? (
        <select className="fb-input fb-input--select" value={text} onChange={(event) => onChange(event.target.value)}>
          <option value="">Choose…</option>
          {(field.options ?? []).map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      ) : (
        <input
          className="fb-input"
          type="text"
          maxLength={field.max}
          placeholder={field.placeholder}
          value={text}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
      {error && <span className="fb-field__error">{error}</span>}
    </label>
  )
}

export default function FeedbackPanel({ onClose, onOpenPrivacy }: { onClose: () => void; onOpenPrivacy: () => void }) {
  const { user } = useAccount()
  const [view, setView] = useState<'picker' | 'form' | 'done'>('picker')
  const [typeId, setTypeId] = useState<string | null>(null)
  const [values, setValues] = useState<Values>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [sending, setSending] = useState(false)
  const [failure, setFailure] = useState('')
  const [reply, setReply] = useState<Reply | null>(null)
  const [openedAt] = useState(() => Date.now())

  const type = TYPES.find((entry) => entry.id === typeId) ?? null

  function set(id: string, value: string | boolean) {
    setValues((current) => ({ ...current, [id]: value }))
    setErrors((current) => {
      if (!current[id]) return current
      const next = { ...current }
      delete next[id]
      return next
    })
  }

  function pick(entry: FeedbackType) {
    setTypeId(entry.id)
    setView('form')
    setErrors({})
    setFailure('')
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!type || sending) return

    const localErrors: Record<string, string> = {}
    if (String(values.summary ?? '').trim().length < 3) localErrors.summary = 'Give a one-line summary (at least 3 characters).'
    if (String(values.details ?? '').trim().length < 10) localErrors.details = 'Describe it in at least 10 characters.'
    if (!user && !values.anonymous && !EMAIL_RE.test(String(values.email ?? '').trim())) {
      localErrors.email = 'Add a contact email, or tick “send anonymously”.'
    }
    if (!values.consent) localErrors.consent = 'Please agree to the privacy policy.'
    for (const field of type.fields) {
      if (!field.required) continue
      const value = values[field.id]
      if (field.kind === 'checkbox' ? value !== true : !String(value ?? '').trim()) {
        localErrors[field.id] = 'This field is required.'
      }
    }

    if (Object.keys(localErrors).length > 0) {
      setErrors(localErrors)
      setFailure('')
      return
    }

    const fields: Record<string, string | boolean> = {}
    for (const field of type.fields) {
      const value = values[field.id]
      fields[field.id] = field.kind === 'checkbox' ? value === true : String(value ?? '')
    }

    const payload = {
      type: type.id,
      summary: String(values.summary ?? ''),
      details: String(values.details ?? ''),
      email: String(values.email ?? '').trim(),
      name: String(values.name ?? ''),
      anonymous: values.anonymous === true,
      consent: true,
      website: '',
      fields,
      diagnostics: diagnostics(),
      openedAt,
    }

    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (user?.idToken) headers.Authorization = `Bearer ${user.idToken}`

    const controller = new AbortController()
    const timer = window.setTimeout(() => controller.abort(), TIMEOUT_MS)

    setSending(true)
    setErrors({})
    setFailure('')

    try {
      const response = await fetch(ENDPOINT, {
        method: 'POST',
        mode: 'cors',
        credentials: 'omit',
        cache: 'no-store',
        headers,
        body: JSON.stringify(payload),
        signal: controller.signal,
      })
      const body = (await response.json().catch(() => null)) as Reply | null

      if (response.ok && body?.ok) {
        setReply(body)
        setValues({})
        setView('done')
        return
      }

      if (response.status === 422 && Array.isArray(body?.fields)) {
        const mapped: Record<string, string> = {}
        body.fields.forEach((item) => {
          if (item?.field && item.message && !mapped[item.field]) mapped[item.field] = item.message
        })
        setErrors(mapped)
        setFailure('The server needs a couple of fields fixed.')
        return
      }

      if (response.status === 429) {
        setFailure('You have sent several reports already. Please wait a little before trying again.')
        return
      }

      setFailure(body?.message || 'We could not file that just now.')
    } catch (error) {
      setFailure(
        error instanceof Error && error.name === 'AbortError'
          ? 'That took too long, so it was cancelled. Nothing was sent.'
          : 'We could not reach the feedback service.',
      )
    } finally {
      window.clearTimeout(timer)
      setSending(false)
    }
  }

  const emailValue = values.email === undefined ? user?.email ?? '' : String(values.email)
  const nameValue = values.name === undefined ? user?.displayName ?? '' : String(values.name)

  return (
    <Modal className="feedback-panel" label="Send feedback" onClose={onClose}>
      <div className="feedback-panel__head">
        <span className="feedback-panel__title">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            {ICONS.other}
          </svg>
          {type && view !== 'picker' ? type.label : 'Send feedback'}
        </span>
        <button className="feedback-panel__close" type="button" aria-label="Close feedback" onClick={onClose}>
          ×
        </button>
      </div>

      <div className="feedback-panel__body">
        {view === 'picker' && (
          <div className="feedback-panel__cards">
            {TYPES.map((entry) => (
              <button key={entry.id} type="button" className="feedback-panel__card" onClick={() => pick(entry)}>
                <PillGlass radius={12} />
                <span className="feedback-panel__card-icon">
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    {ICONS[entry.icon]}
                  </svg>
                </span>
                <span className="feedback-panel__card-body">
                  <span className="feedback-panel__card-label">{entry.label}</span>
                  <span className="feedback-panel__card-blurb">{entry.blurb}</span>
                </span>
                <svg className="feedback-panel__card-go" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M9 5l7 7-7 7" />
                </svg>
              </button>
            ))}
          </div>
        )}

        {view === 'form' && type && (
          <form className="feedback-panel__form" onSubmit={submit} noValidate>
            <div className={`feedback-panel__account${user ? ' is-verified' : ''}`}>
              {user ? (
                <span>
                  Signed in as <strong>{user.displayName || user.email}</strong>
                  {user.displayName && user.email ? ` <${user.email}>` : ''}. This report will be filed to your account.
                </span>
              ) : (
                <span>Not signed in. We can still file this, but a guest report cannot be matched to an account.</span>
              )}
            </div>

            {type.legal && <div className="feedback-panel__legal">{type.legal}</div>}

            <Field
              field={{ id: 'summary', label: 'One-line summary', kind: 'text', max: 200, required: true }}
              value={values.summary}
              error={errors.summary}
              onChange={(value) => set('summary', value)}
            />
            <Field
              field={{ id: 'details', label: 'What is going on', kind: 'textarea', max: 6000, required: true }}
              value={values.details}
              error={errors.details}
              onChange={(value) => set('details', value)}
            />

            {type.fields.map((field) => (
              <Field
                key={field.id}
                field={field}
                value={values[field.id]}
                error={errors[field.id]}
                onChange={(value) => set(field.id, value)}
              />
            ))}

            <Field
              field={{
                id: 'email',
                label: user ? 'Contact email (optional)' : 'Contact email',
                kind: 'text',
                max: 254,
                required: !values.anonymous && !user,
                placeholder: 'you@example.com',
              }}
              value={emailValue}
              error={errors.email}
              onChange={(value) => set('email', value)}
            />
            <Field
              field={{ id: 'name', label: 'Your name', kind: 'text', max: 120, placeholder: 'Optional' }}
              value={nameValue}
              error={errors.name}
              onChange={(value) => set('name', value)}
            />

            {!user && (
              <Field
                field={{ id: 'anonymous', label: 'Send anonymously (skip the contact email)', kind: 'checkbox' }}
                value={values.anonymous}
                error={errors.anonymous}
                onChange={(value) => {
                  set('anonymous', value)
                  if (value === true) set('email', '')
                }}
              />
            )}

            <label className={`fb-field fb-field--check${errors.consent ? ' is-invalid' : ''}`}>
              <input type="checkbox" checked={values.consent === true} onChange={(event) => set('consent', event.target.checked)} />
              <span>
                I agree to the{' '}
                <button
                  type="button"
                  className="feedback-panel__anchor"
                  onClick={(event) => {
                    event.preventDefault()
                    event.stopPropagation()
                    onOpenPrivacy()
                  }}
                >
                  privacy policy
                </button>
                {user ? ' and to staff contacting me about this report.' : '.'}
              </span>
              {errors.consent && <span className="fb-field__error">{errors.consent}</span>}
            </label>

            {failure && (
              <div className="feedback-panel__status" role="alert">
                {failure} You can also{' '}
                <a href={DISCORD} target="_blank" rel="noopener noreferrer">
                  tell us in the Discord server
                </a>
                .
              </div>
            )}

            <div className="feedback-panel__actions">
              <button
                type="button"
                className="feedback-panel__btn"
                onClick={() => {
                  setView('picker')
                  setErrors({})
                  setFailure('')
                }}
              >
                <PillGlass radius={9} />
                Back
              </button>
              <button type="submit" className="feedback-panel__btn is-primary" disabled={sending}>
                <PillGlass radius={9} />
                {sending ? 'Sending…' : 'Send report'}
              </button>
            </div>
          </form>
        )}

        {view === 'done' && (
          <div className="feedback-panel__done">
            <span className="feedback-panel__done-icon">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M5 12.5 10 17.5 19 7" />
              </svg>
            </span>
            <h3 className="feedback-panel__done-title">Thanks, that is filed.</h3>
            <p className="feedback-panel__done-text">
              Your reference is <strong>{reply?.reference ?? 'unavailable'}</strong>. A member of staff reads every report in
              the Discord server; keep the reference if you need to follow up.
            </p>
            {reply?.attributedTo && <p className="feedback-panel__done-note">Filed against your account, {reply.attributedTo}.</p>}
            <div className="feedback-panel__actions feedback-panel__actions--center">
              {reply?.threadUrl && (
                <a className="feedback-panel__btn" href={reply.threadUrl} target="_blank" rel="noopener noreferrer">
                  <PillGlass radius={9} />
                  Open the report thread
                </a>
              )}
              <a className="feedback-panel__btn" href={DISCORD} target="_blank" rel="noopener noreferrer">
                <PillGlass radius={9} />
                Join the Discord
              </a>
              <button type="button" className="feedback-panel__btn is-primary" onClick={onClose}>
                <PillGlass radius={9} />
                Close
              </button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}
