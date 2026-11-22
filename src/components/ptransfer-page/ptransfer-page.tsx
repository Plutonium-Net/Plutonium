import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import GlassSurface from '@/components/glass-surface/GlassSurface'
import { useAccount } from '@/hooks/use-account'
import { DownloadController, claimSession, type DownloadState } from '@/lib/ptransfer/download'
import {
  MAX_LENGTH,
  MIN_LENGTH,
  deriveKey,
  formatBytes,
  formatEta,
  formatIdInput,
  groupId,
  policyError,
} from '@/lib/ptransfer/password'
import { probeServers, type DropServerStatus } from '@/lib/ptransfer/servers'
import {
  UploadController,
  createSession,
  submitVerifier,
  type UploadState,
} from '@/lib/ptransfer/upload'
import './ptransfer-page.css'

const ABSOLUTE_TTL_MS = 60 * 60 * 1000

type Mode = 'send' | 'receive'

type Ticket = { id: string; token: string; at: number }

// A glass surface of its own, sitting on top of the panel's glass. Controls go
// in the slot and drop their own backgrounds so the refraction shows through.
function GlassFrame({
  children,
  radius = 12,
  frost = 0.07,
  pill = false,
  bright = false,
  dim = false,
  className = '',
}: {
  children: ReactNode
  radius?: number
  frost?: number
  pill?: boolean
  bright?: boolean
  dim?: boolean
  className?: string
}) {
  return (
    <div
      className={`ptransfer-glass${pill ? ' is-pill' : ''}${bright ? ' is-bright' : ''}${
        dim ? ' is-dim' : ''
      }${className ? ` ${className}` : ''}`}
      style={{ borderRadius: radius }}
    >
      <GlassSurface
        className="ptransfer-glass__surface"
        width="100%"
        height="100%"
        borderRadius={radius}
        backgroundOpacity={frost}
        saturation={1.35}
        displace={0.35}
      />
      <div className="ptransfer-glass__slot">{children}</div>
    </div>
  )
}

export default function PTransferPage() {
  const { user } = useAccount()
  const [mode, setMode] = useState<Mode>('send')
  const [servers, setServers] = useState<DropServerStatus[]>([])
  const [server, setServer] = useState('')

  const [file, setFile] = useState<File | null>(null)
  const [password, setPassword] = useState('')
  const [again, setAgain] = useState('')
  const [busy, setBusy] = useState(false)
  const [trouble, setTrouble] = useState('')

  const [ticket, setTicket] = useState<Ticket | null>(null)
  const [upload, setUpload] = useState<UploadState | null>(null)
  const uploadRef = useRef<UploadController | null>(null)

  const [code, setCode] = useState('')
  const [receivePassword, setReceivePassword] = useState('')
  const [download, setDownload] = useState<DownloadState | null>(null)
  const [claimedName, setClaimedName] = useState('')
  const [claimedSize, setClaimedSize] = useState(0)
  const downloadRef = useRef<DownloadController | null>(null)

  useEffect(() => {
    let alive = true
    void probeServers().then((list) => {
      if (!alive) return
      setServers(list)
      setServer((current) => current || list.find((item) => item.online)?.url || list[0]?.url || '')
    })
    return () => {
      alive = false
    }
  }, [])

  useEffect(
    () => () => {
      uploadRef.current?.cancel()
      downloadRef.current?.cancel()
    },
    [],
  )

  const rule = useMemo(
    () => (password ? policyError(password, ticket?.id ?? '') : null),
    [password, ticket?.id],
  )
  const mismatch = again.length > 0 && password !== again
  const canSend = Boolean(user && file && server && password && !rule && !mismatch && !busy)
  const canJoin = Boolean(server && code.length === 6 && receivePassword && !busy)

  function retitle(next: Mode) {
    setMode(next)
    setTrouble('')
  }

  async function openTicket() {
    if (!user || !file || !server) return
    setTrouble('')
    setBusy(true)
    try {
      const created = await createSession(server, file, user.idToken)
      const key = await deriveKey(password, created.id)
      await submitVerifier(server, created.id, created.token, key)
      const controller = new UploadController(server, created.id, created.token, file, setUpload)
      uploadRef.current = controller
      setUpload(controller.state)
      setTicket({ ...created, at: Date.now() })
      controller.connect()
    } catch (error) {
      setTrouble(error instanceof Error ? error.message : 'Could not open the transfer.')
    } finally {
      setBusy(false)
    }
  }

  const join = useCallback(async () => {
    if (!server || code.length !== 6) return
    setTrouble('')
    setBusy(true)
    try {
      const key = await deriveKey(receivePassword, code)
      const claimed = await claimSession(server, code, key)
      setClaimedName(claimed.meta.name)
      setClaimedSize(claimed.meta.size)
      const controller = new DownloadController(server, code, claimed.token, claimed.meta, setDownload)
      downloadRef.current = controller
      setDownload(controller.state)
      controller.connect()
    } catch (error) {
      setTrouble(error instanceof Error ? error.message : "No such transfer, or the password didn't work.")
    } finally {
      setBusy(false)
    }
  }, [server, code, receivePassword])

  function resetSend() {
    uploadRef.current?.cancel()
    uploadRef.current = null
    setTicket(null)
    setUpload(null)
    setFile(null)
    setPassword('')
    setAgain('')
    setTrouble('')
  }

  function resetReceive() {
    downloadRef.current?.cancel()
    downloadRef.current = null
    setDownload(null)
    setCode('')
    setReceivePassword('')
    setClaimedName('')
    setClaimedSize(0)
    setTrouble('')
  }

  return (
    <div className="ptransfer-page">
      <div className="ptransfer-page__scroll">
        <header className="ptransfer-page__head">
          <h1 className="ptransfer-page__title">pTransfer</h1>
          <p className="ptransfer-page__meta">one file · live · nothing stored</p>
        </header>

        <div className="ptransfer-page__body">
          <div className="ptransfer-page__tabs-shell">
            <GlassSurface
              className="ptransfer-page__tabs-glass"
              width="100%"
              height="100%"
              borderRadius={999}
              backgroundOpacity={0.08}
              saturation={1.25}
              displace={0.4}
            >
              <div className="ptransfer-page__tabs" role="tablist" aria-label="Transfer direction">
                <button
                  type="button"
                  role="tab"
                  aria-selected={mode === 'send'}
                  className={`ptransfer-page__tab${mode === 'send' ? ' is-active' : ''}`}
                  onClick={() => retitle('send')}
                >
                  Send
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={mode === 'receive'}
                  className={`ptransfer-page__tab${mode === 'receive' ? ' is-active' : ''}`}
                  onClick={() => retitle('receive')}
                >
                  Receive
                </button>
              </div>
            </GlassSurface>
          </div>

          <GlassSurface
            className="ptransfer-page__panel"
            width="100%"
            height="auto"
            borderRadius={16}
            backgroundOpacity={0.1}
            saturation={1.25}
            displace={0.5}
          >
            <div className="ptransfer-page__field">
              <span className="ptransfer-page__label">Server</span>
              <ServerPicker servers={servers} value={server} onSelect={setServer} />
            </div>

            {mode === 'send' ? (
              <SendBody
                file={file}
                onFile={setFile}
                password={password}
                onPassword={setPassword}
                again={again}
                onAgain={setAgain}
                rule={rule}
                mismatch={mismatch}
                signedIn={Boolean(user)}
                canSend={canSend}
                busy={busy}
                ticket={ticket}
                upload={upload}
                onOpen={() => void openTicket()}
                onReset={resetSend}
                controller={() => uploadRef.current}
              />
            ) : (
              <ReceiveBody
                code={code}
                onCode={(value) => setCode(formatIdInput(value))}
                password={receivePassword}
                onPassword={setReceivePassword}
                canJoin={canJoin}
                busy={busy}
                download={download}
                name={claimedName}
                size={claimedSize}
                onJoin={() => void join()}
                onReset={resetReceive}
                controller={() => downloadRef.current}
              />
            )}

            {trouble && <p className="ptransfer-page__status is-error">{trouble}</p>}

          </GlassSurface>
        </div>
      </div>
    </div>
  )
}

type SendProps = {
  file: File | null
  onFile: (file: File | null) => void
  password: string
  onPassword: (value: string) => void
  again: string
  onAgain: (value: string) => void
  rule: string | null
  mismatch: boolean
  signedIn: boolean
  canSend: boolean
  busy: boolean
  ticket: Ticket | null
  upload: UploadState | null
  onOpen: () => void
  onReset: () => void
  controller: () => UploadController | null
}

function SendBody(props: SendProps) {
  const input = useRef<HTMLInputElement>(null)

  if (props.ticket) {
    return (
      <TicketView
        ticket={props.ticket}
        upload={props.upload}
        onReset={props.onReset}
        controller={props.controller}
      />
    )
  }

  return (
    <>
      <div className="ptransfer-page__field">
        <span className="ptransfer-page__label">File</span>
        <div className="ptransfer-page__file">
          <div className="ptransfer-page__file-copy">
            <span className="ptransfer-page__file-name">{props.file?.name ?? 'Nothing chosen yet'}</span>
            <span className="ptransfer-page__file-size">
              {props.file ? formatBytes(props.file.size) : 'one file per transfer'}
            </span>
          </div>
          <GlassFrame radius={999} frost={0.12} pill>
            <button type="button" className="ptransfer-page__picker" onClick={() => input.current?.click()}>
              {props.file ? 'Change' : 'Choose'}
            </button>
          </GlassFrame>
          <input
            ref={input}
            type="file"
            hidden
            onChange={(event) => props.onFile(event.target.files?.[0] ?? null)}
          />
        </div>
      </div>

      <div className="ptransfer-page__field">
        <label className="ptransfer-page__label" htmlFor="ptransfer-password">
          Password for this transfer
        </label>
        <GlassFrame radius={12}>
          <input
            id="ptransfer-password"
            className="ptransfer-page__input"
            type="password"
            autoComplete="new-password"
            spellCheck={false}
            placeholder={`at least ${MIN_LENGTH} characters`}
            maxLength={MAX_LENGTH}
            value={props.password}
            onChange={(event) => props.onPassword(event.target.value)}
          />
        </GlassFrame>
        {props.rule && <span className="ptransfer-page__hint">{props.rule}</span>}
      </div>

      <div className="ptransfer-page__field">
        <label className="ptransfer-page__label" htmlFor="ptransfer-again">
          Again
        </label>
        <GlassFrame radius={12}>
          <input
            id="ptransfer-again"
            className="ptransfer-page__input"
            type="password"
            autoComplete="new-password"
            spellCheck={false}
            placeholder="same again"
            maxLength={MAX_LENGTH}
            value={props.again}
            onChange={(event) => props.onAgain(event.target.value)}
          />
        </GlassFrame>
        {props.mismatch && <span className="ptransfer-page__hint">Those two do not match.</span>}
      </div>

      <div className="ptransfer-page__actions">
        <GlassFrame radius={999} frost={0.26} bright dim={!props.canSend} pill>
          <button type="button" className="ptransfer-page__primary" disabled={!props.canSend} onClick={props.onOpen}>
            Open transfer
          </button>
        </GlassFrame>
      </div>

      {!props.signedIn && <p className="ptransfer-page__note">Sign in to send a file.</p>}
    </>
  )
}

function TicketView({
  ticket,
  upload,
  onReset,
  controller,
}: {
  ticket: Ticket
  upload: UploadState | null
  onReset: () => void
  controller: () => UploadController | null
}) {
  const left = useCountdown(ticket.at)
  const phase = upload?.phase ?? 'waiting'
  const total = upload?.totalBytes ?? 0
  const sent = upload?.sentBytes ?? 0
  const confirmed = upload?.confirmedBytes ?? 0

  return (
    <>
      <div className="ptransfer-page__ticket">
        <span className="ptransfer-page__code">{groupId(ticket.id)}</span>
        <div className="ptransfer-page__ticket-row">
          <span className="ptransfer-page__chip">{formatBytes(total)}</span>
          <span className="ptransfer-page__chip">expires in {left}</span>
        </div>
      </div>

      {phase === 'claim' && (
        <div className="ptransfer-page__ask">
          <p className="ptransfer-page__ask-title">Someone wants to receive this.</p>
          <p className="ptransfer-page__ask-copy">They know the id and the password. Allow them in?</p>
          <div className="ptransfer-page__actions">
            <GlassFrame radius={999} frost={0.26} bright pill>
              <button type="button" className="ptransfer-page__primary" onClick={() => controller()?.confirm()}>
                Allow
              </button>
            </GlassFrame>
            <GlassFrame radius={999} frost={0.12} pill>
              <button type="button" className="ptransfer-page__ghost" onClick={() => controller()?.deny()}>
                Decline
              </button>
            </GlassFrame>
          </div>
        </div>
      )}

      {phase === 'sending' && (
        <div className="ptransfer-page__bars">
          <Bar label="Sent" bytes={sent} total={total} tone="sent" />
          <Bar label="Written by the other side" bytes={confirmed} total={total} />
        </div>
      )}

      <p className="ptransfer-page__status">{sendLine(phase, upload)}</p>

      <div className="ptransfer-page__actions">
        <GlassFrame radius={999} frost={0.12} pill>
          <button type="button" className="ptransfer-page__ghost" onClick={onReset}>
            {phase === 'done' ? 'Start another' : 'Cancel transfer'}
          </button>
        </GlassFrame>
      </div>
    </>
  )
}

type ReceiveProps = {
  code: string
  onCode: (value: string) => void
  password: string
  onPassword: (value: string) => void
  canJoin: boolean
  busy: boolean
  download: DownloadState | null
  name: string
  size: number
  onJoin: () => void
  onReset: () => void
  controller: () => DownloadController | null
}

function ReceiveBody(props: ReceiveProps) {
  const phase = props.download?.phase ?? null
  const total = props.download?.totalBytes ?? props.size
  const received = props.download?.receivedBytes ?? 0
  const joined = phase !== null

  if (joined) {
    return (
      <>
        <div className="ptransfer-page__ticket">
          <span className="ptransfer-page__code">{groupId(props.code)}</span>
          <div className="ptransfer-page__ticket-row">
            <span className="ptransfer-page__chip">{props.name || 'file'}</span>
            <span className="ptransfer-page__chip">{formatBytes(total)}</span>
          </div>
        </div>

        {phase === 'joined' && (
          <div className="ptransfer-page__ask">
            <p className="ptransfer-page__ask-title">Save {props.name} to this device?</p>
            <p className="ptransfer-page__ask-copy">
              The sender is waiting. Your browser will ask where to put it once you agree.
            </p>
            <div className="ptransfer-page__actions">
              <GlassFrame radius={999} frost={0.26} bright pill>
                <button
                  type="button"
                  className="ptransfer-page__primary"
                  onClick={() => void props.controller()?.start()}
                >
                  Save it
                </button>
              </GlassFrame>
              <GlassFrame radius={999} frost={0.12} pill>
                <button type="button" className="ptransfer-page__ghost" onClick={props.onReset}>
                  Leave
                </button>
              </GlassFrame>
            </div>
          </div>
        )}

        {phase === 'receiving' && <Bar label="Written" bytes={received} total={total} />}

        <p className="ptransfer-page__status">{receiveLine(phase, props.download)}</p>

        {phase !== 'joined' && (
          <div className="ptransfer-page__actions">
            <GlassFrame radius={999} frost={0.12} pill>
              <button type="button" className="ptransfer-page__ghost" onClick={props.onReset}>
                {phase === 'done' ? 'Receive another' : 'Leave'}
              </button>
            </GlassFrame>
          </div>
        )}
      </>
    )
  }

  return (
    <>
      <div className="ptransfer-page__field">
        <label className="ptransfer-page__label" htmlFor="ptransfer-id">
          Transfer id
        </label>
        <GlassFrame radius={12}>
          <input
            id="ptransfer-id"
            className="ptransfer-page__input is-code"
            inputMode="text"
            autoComplete="off"
            spellCheck={false}
            placeholder="ABC-123"
            maxLength={6}
            value={props.code}
            onChange={(event) => props.onCode(event.target.value)}
          />
        </GlassFrame>
      </div>

      <div className="ptransfer-page__field">
        <label className="ptransfer-page__label" htmlFor="ptransfer-receive-password">
          Password
        </label>
        <GlassFrame radius={12}>
          <input
            id="ptransfer-receive-password"
            className="ptransfer-page__input"
            type="password"
            autoComplete="off"
            spellCheck={false}
            placeholder="the one they told you"
            maxLength={MAX_LENGTH}
            value={props.password}
            onChange={(event) => props.onPassword(event.target.value)}
          />
        </GlassFrame>
      </div>

      <div className="ptransfer-page__actions">
        <GlassFrame radius={999} frost={0.26} bright dim={!props.canJoin} pill>
          <button type="button" className="ptransfer-page__primary" disabled={!props.canJoin} onClick={props.onJoin}>
            Join transfer
          </button>
        </GlassFrame>
      </div>

    </>
  )
}

function serverState(status: DropServerStatus | null | undefined) {
  if (!status) return 'locating'
  if (!status.online) return 'offline'
  return status.queueDepth ? `${status.queueDepth} waiting` : 'free'
}

// The dropdown lives in a portal: the panel is a glass surface with
// overflow hidden, so a menu rendered inside it would be clipped.
function ServerPicker({
  servers,
  value,
  onSelect,
}: {
  servers: DropServerStatus[]
  value: string
  onSelect: (url: string) => void
}) {
  const [box, setBox] = useState<{ left: number; top: number; width: number } | null>(null)
  const button = useRef<HTMLButtonElement>(null)
  const chosen = servers.find((item) => item.url === value) ?? servers[0] ?? null

  useEffect(() => {
    if (!box) return undefined
    const close = () => setBox(null)
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setBox(null)
    }
    const onDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null
      if (!target) return
      if (target.closest('.ptransfer-menu') || button.current?.contains(target)) return
      setBox(null)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onDown, true)
    window.addEventListener('resize', close)
    window.addEventListener('scroll', close, true)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onDown, true)
      window.removeEventListener('resize', close)
      window.removeEventListener('scroll', close, true)
    }
  }, [box])

  function toggle() {
    if (box) {
      setBox(null)
      return
    }
    const rect = button.current?.getBoundingClientRect()
    if (!rect) return
    setBox({ left: rect.left, top: rect.bottom + 6, width: rect.width })
  }

  return (
    <div className="ptransfer-page__server">
      <GlassFrame radius={12}>
        <button
          ref={button}
          type="button"
          className="ptransfer-page__server-btn"
          aria-haspopup="listbox"
          aria-expanded={Boolean(box)}
          onClick={toggle}
        >
          <span className="ptransfer-page__server-name">
            {servers.length === 0 ? 'Looking for servers…' : (chosen?.label ?? 'Choose a server')}
          </span>
          <span
            className={`ptransfer-page__server-state${chosen?.online ? ' is-online' : ''}`}
          >
            {serverState(chosen)}
          </span>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>
      </GlassFrame>

      {box &&
        createPortal(
          <div
            className="ptransfer-menu"
            style={{ left: box.left, top: box.top, width: box.width }}
            role="listbox"
            aria-label="Servers"
          >
            <GlassSurface
              className="ptransfer-menu__glass"
              width="100%"
              height="auto"
              borderRadius={12}
              backgroundOpacity={0.18}
              saturation={1.3}
              displace={0.4}
            >
              <div className="ptransfer-menu__body">
                {servers.map((item) => (
                  <button
                    key={item.url}
                    type="button"
                    role="option"
                    aria-selected={item.url === value}
                    className={`ptransfer-menu__option${item.url === value ? ' is-active' : ''}`}
                    onClick={() => {
                      onSelect(item.url)
                      setBox(null)
                    }}
                  >
                    <span className="ptransfer-menu__name">{item.label}</span>
                    <span
                      className={`ptransfer-menu__state${item.online ? ' is-online' : ''}`}
                    >
                      {serverState(item)}
                    </span>
                    <span className="ptransfer-menu__host">{item.host}</span>
                  </button>
                ))}
              </div>
            </GlassSurface>
          </div>,
          document.body,
        )}
    </div>
  )
}

function Bar({
  label,
  bytes,
  total,
  tone,
}: {
  label: string
  bytes: number
  total: number
  tone?: 'sent'
}) {
  const pct = total > 0 ? Math.min(100, Math.round((bytes / total) * 100)) : 0
  return (
    <div className="ptransfer-page__bar-row">
      <div className="ptransfer-page__bar-head">
        <span>{label}</span>
        <span>
          {formatBytes(bytes)} / {formatBytes(total)}
        </span>
      </div>
      <div className="ptransfer-page__bar">
        <div
          className={`ptransfer-page__bar-fill${tone === 'sent' ? ' is-sent' : ''}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

function useCountdown(from: number) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [])
  const left = Math.max(0, ABSOLUTE_TTL_MS - (now - from))
  const minutes = Math.floor(left / 60_000)
  const seconds = Math.floor((left % 60_000) / 1000)
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

function sendLine(phase: UploadState['phase'], state: UploadState | null) {
  switch (phase) {
    case 'waiting':
      return 'Waiting for someone to open it.'
    case 'claim':
      return 'Someone is joining.'
    case 'awaiting-receiver':
      return 'Allowed. Waiting for them to accept the file.'
    case 'queued':
      return `In line · ${state?.position ?? 1} of ${state?.position ?? 1} · ${formatEta(state?.etaHigh ?? 0)}`
    case 'sending':
      return 'Sending. Nothing is stored, so this only works while you both stay open.'
    case 'done':
      return 'Delivered. They have every byte.'
    case 'error':
      return state?.message || 'The transfer stopped.'
    default:
      return ''
  }
}

function receiveLine(phase: DownloadState['phase'] | null, state: DownloadState | null) {
  switch (phase) {
    case 'awaiting-host':
      return 'Waiting for the sender to allow you in.'
    case 'joined':
      return 'The sender allowed you in.'
    case 'queued':
      return `In line · position ${state?.position ?? 1} · ${formatEta(state?.etaHigh ?? 0)}`
    case 'receiving':
      return 'Receiving.'
    case 'done':
      return 'Saved.'
    case 'declined':
      return 'The sender declined this transfer.'
    case 'error':
      return state?.message || 'The transfer stopped.'
    default:
      return ''
  }
}
