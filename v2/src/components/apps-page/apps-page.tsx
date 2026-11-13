import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { BorderBeam } from 'border-beam'
import GlassSurface from '@/components/glass-surface/GlassSurface'
import { BEAM_PROPS } from '@/lib/beam'
import { LIGHT_ART, loadApps, loadServers, artFor, frameUrl, type AppEntry, type AppServer, type AppServers } from '@/lib/apps'
import { getPref, loadPrefs, setPref } from '@/lib/prefs'
import './apps-page.css'


export default function AppsPage({ query, launchId }: { query: string; launchId: string }) {
  const [apps, setApps] = useState<AppEntry[]>([])
  const [servers, setServers] = useState<AppServers>({ defaultId: '', servers: [] })
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [search, setSearch] = useState(query)
  const [focused, setFocused] = useState(false)
  const [category, setCategory] = useState('All')
  const [serverId, setServerId] = useState('')
  const [serverMenu, setServerMenu] = useState(false)
  const [openId, setOpenId] = useState<string | null>(launchId || null)

  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let alive = true
    void Promise.all([loadApps(), loadServers(), loadPrefs()])
      .then(([list, serverList]) => {
        if (!alive) return
        setApps(list)
        setServers(serverList)
        const saved = getPref<string>('appServer')
        const ready = serverList.servers.some((server) => server.id === saved)
        setServerId(ready ? (saved as string) : serverList.defaultId)
        setStatus('ready')
      })
      .catch(() => {
        if (alive) setStatus('error')
      })
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    if (!serverMenu) return
    function onDown(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) setServerMenu(false)
    }
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [serverMenu])

  const categories = useMemo(() => ['All', ...Array.from(new Set(apps.map((app) => app.category))).sort()], [apps])

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return apps.filter((app) => {
      if (category !== 'All' && app.category !== category) return false
      if (!needle) return true
      return `${app.name} ${app.description} ${app.category}`.toLowerCase().includes(needle)
    })
  }, [apps, category, search])

  const open = apps.find((app) => app.id === openId) || null
  const server = servers.servers.find((entry) => entry.id === serverId) || servers.servers[0] || null

  function chooseServer(id: string) {
    setServerId(id)
    setPref('appServer', id)
    setServerMenu(false)
  }

  const countLabel = search.trim()
    ? `${visible.length} ${visible.length === 1 ? 'result' : 'results'}`
    : `${visible.length} apps`

  return (
    <div className="apps-page">
      <div className="apps-page__scroll">
        <header className="apps-page__head">
          <h1 className="apps-page__title">Apps</h1>

          <div className="apps-page__cats">
            {categories.map((entry) => (
              <button
                key={entry}
                type="button"
                className={`apps-page__cat${entry === category ? ' is-active' : ''}`}
                onClick={() => setCategory(entry)}
              >
                {entry}
              </button>
            ))}
          </div>

          <div className={`apps-page__search${focused ? ' is-focused' : ''}`}>
            <BorderBeam className="apps-page__search-beam" {...BEAM_PROPS} borderRadius={999} active={focused}>
              <GlassSurface
                className="apps-page__search-glass"
                width="100%"
                height="100%"
                borderRadius={999}
                backgroundOpacity={0.1}
                saturation={1.2}
                displace={0.5}
              >
                <form className="apps-page__search-inner" onSubmit={(event) => event.preventDefault()}>
                  <svg className="apps-page__search-icon" viewBox="0 0 20 20" aria-hidden="true">
                    <circle cx="9" cy="9" r="6" fill="none" stroke="currentColor" strokeWidth="1.8" />
                    <line x1="13.4" y1="13.4" x2="17.5" y2="17.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                  </svg>
                  <input
                    className="apps-page__search-input"
                    type="search"
                    value={search}
                    placeholder="Search apps"
                    aria-label="Search apps"
                    autoComplete="off"
                    spellCheck={false}
                    onChange={(event) => setSearch(event.target.value)}
                    onFocus={() => setFocused(true)}
                    onBlur={() => setFocused(false)}
                  />
                </form>
              </GlassSurface>
            </BorderBeam>
          </div>

          <p className="apps-page__meta">{status === 'loading' ? 'loading…' : status === 'error' ? 'unavailable' : countLabel}</p>
        </header>

        {status === 'error' ? (
          <p className="apps-page__note">The app catalog could not be loaded.</p>
        ) : (
          <div className="apps-page__grid">
            {visible.map((app) => (
              <AppCard key={app.id} app={app} onOpen={() => setOpenId(app.id)} />
            ))}
          </div>
        )}

        {status === 'ready' && !visible.length && <p className="apps-page__note">Nothing matches that search.</p>}
      </div>

      {open &&
        createPortal(
          <AppViewer
            app={open}
            servers={servers}
            server={server}
            serverId={serverId}
            serverMenu={serverMenu}
            menuRef={menuRef}
            onToggleMenu={() => setServerMenu((value) => !value)}
            onChooseServer={chooseServer}
            onClose={() => {
              setServerMenu(false)
              setOpenId(null)
            }}
          />,
          document.body,
        )}
    </div>
  )
}

function AppCard({ app, onOpen }: { app: AppEntry; onOpen: () => void }) {
  const [broken, setBroken] = useState(false)

  return (
    <button
      type="button"
      className={`apps-page__card${LIGHT_ART.has(app.id) ? ' is-light' : ''}`}
      onClick={onOpen}
      style={{ ['--app-color' as string]: app.color }}
    >
      {broken ? (
        <span className="apps-page__card-fallback">{app.name.slice(0, 1)}</span>
      ) : (
        <img className="apps-page__card-art" src={artFor(app)} alt="" loading="lazy" onError={() => setBroken(true)} />
      )}
      <span className="apps-page__card-veil" />
      <span className="apps-page__card-copy">
        <span className="apps-page__card-name">{app.name}</span>
        <span className="apps-page__card-desc">{app.description}</span>
      </span>
    </button>
  )
}

function AppViewer({
  app,
  servers,
  server,
  serverId,
  serverMenu,
  menuRef,
  onToggleMenu,
  onChooseServer,
  onClose,
}: {
  app: AppEntry
  servers: AppServers
  server: AppServer | null
  serverId: string
  serverMenu: boolean
  menuRef: React.RefObject<HTMLDivElement | null>
  onToggleMenu: () => void
  onChooseServer: (id: string) => void
  onClose: () => void
}) {
  const frameRef = useRef<HTMLIFrameElement>(null)
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const src = frameUrl(server, app.url)

  return (
    <div className="apps-viewer">
      <header className="apps-viewer__bar">
        <span className="apps-viewer__glass" aria-hidden="true">
          <GlassSurface
            className="apps-viewer__surface"
            width="100%"
            height="100%"
            borderRadius={14}
            backgroundOpacity={0.5}
            saturation={1.2}
            displace={0.4}
          />
        </span>

        <button type="button" className="apps-viewer__btn" onClick={onClose} title="Close" aria-label="Close app">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M15 5l-7 7 7 7" />
          </svg>
        </button>

        <span className="apps-viewer__id">
          <img className="apps-viewer__icon" src={artFor(app)} alt="" />
          <span className="apps-viewer__copy">
            <span className="apps-viewer__name">{app.name}</span>
            <span className="apps-viewer__host">{new URL(app.url).hostname.replace(/^www\./, '')}</span>
          </span>
        </span>

        <div className="apps-viewer__server" ref={menuRef}>
          <button type="button" className="apps-viewer__server-btn" onClick={onToggleMenu} aria-expanded={serverMenu}>
            {server ? (
              <>
                <img className="apps-viewer__flag" src={server.flagSrc} alt="" />
                {server.name}
              </>
            ) : (
              'Server'
            )}
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>
          {serverMenu && (
            <div className="apps-viewer__server-menu" role="listbox">
              {servers.servers.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  role="option"
                  aria-selected={entry.id === serverId}
                  className={`apps-viewer__server-item${entry.id === serverId ? ' is-active' : ''}`}
                  onClick={() => onChooseServer(entry.id)}
                >
                  <img className="apps-viewer__flag" src={entry.flagSrc} alt="" />
                  <span className="apps-viewer__server-copy">
                    <span>{entry.name}</span>
                    <span className="apps-viewer__server-loc">{entry.location}</span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        <button
          type="button"
          className="apps-viewer__btn"
          onClick={() => setNonce((value) => value + 1)}
          title="Reload"
          aria-label="Reload app"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M20 11a8 8 0 1 0-2.3 6M20 5v6h-6" />
          </svg>
        </button>

        <a className="apps-viewer__btn" href={app.url} target="_blank" rel="noreferrer" title="Open in a tab">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M14 4h6v6M20 4l-8 8M18 14v5H5V6h5" />
          </svg>
        </a>
      </header>

      <iframe
        key={`${serverId}-${nonce}`}
        ref={frameRef}
        className="apps-viewer__frame"
        src={src}
        title={app.name}
        allow="fullscreen; clipboard-read; clipboard-write"
        referrerPolicy="no-referrer"
      />
    </div>
  )
}
