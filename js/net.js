const RELAY_QUERY_OVERRIDE = new URLSearchParams(window.location.search).get('relay')
const RELAY_WORKER_BASE = 'https://wisp.cgamz.online'
const DEFAULT_RELAY_REGION = 'us-east-1'
const RELAY_CONNECT_TIMEOUT_MS = 15000
const RELAY_PING_TIMEOUT_MS = 8000
const RELAY_BACKGROUND_PING_MS = 5000

const RELAY_SERVERS = [
  { id: 'us-east-1', label: 'US East 1', location: 'Virginia, USA',     flagSrc: 'img/flags/us.png', lat: 37.4316,  lon: -78.6569  },
  { id: 'us-east-2', label: 'US East 2', location: 'Ohio, USA',         flagSrc: 'img/flags/us.png', lat: 40.4173,  lon: -82.9071  },
  { id: 'us-west',   label: 'US West',   location: 'Oregon, USA',       flagSrc: 'img/flags/us.png', lat: 43.8041,  lon: -120.5542 },
  { id: 'europe',    label: 'Europe',    location: 'Frankfurt, Germany', flagSrc: 'img/flags/eu.png', lat: 50.1109,  lon: 8.6821    },
  { id: 'asia',      label: 'Asia',      location: 'Singapore',         flagSrc: 'img/flags/sg.png', lat: 1.3521,   lon: 103.8198  },
]

const resolvedRelayUrlCache = new Map()

async function resolveRelayUrl(serverId) {
  if (RELAY_QUERY_OVERRIDE) return RELAY_QUERY_OVERRIDE
  if (resolvedRelayUrlCache.has(serverId)) return resolvedRelayUrlCache.get(serverId)

  try {
    const res = await fetch(`${RELAY_WORKER_BASE}/${serverId}/`, { signal: AbortSignal.timeout(4000) })
    const data = await res.json()
    if (data && data.redirect) {
      resolvedRelayUrlCache.set(serverId, data.redirect)
      return data.redirect
    }
    const headerUrl = res.headers.get('X-Relay-Redirect')
    if (headerUrl) {
      resolvedRelayUrlCache.set(serverId, headerUrl)
      return headerUrl
    }
  } catch (e) {}

  return null
}

function geoDistanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

async function getClosestRelayServer() {
  try {
    const res = await fetch('https://ipapi.co/json/', { signal: AbortSignal.timeout(3000) })
    const data = await res.json()
    const { latitude, longitude } = data
    if (!latitude || !longitude) return null
    return getConfiguredRelayServers()
      .map(s => ({ server: s, dist: geoDistanceKm(latitude, longitude, s.lat, s.lon) }))
      .sort((a, b) => a.dist - b.dist)[0].server
  } catch (e) {
    return null
  }
}

let coreReady = false
let bridgeReady = false
let bridgeConnection = null
let pendingInitPromise = null
let relayPreloadSocket = null
let currentRelayServerId = RELAY_SERVERS[0] ? RELAY_SERVERS[0].id : ''
let currentRelayLatencyMs = null
let bestRelayServerId = ''
let currentRelayStatus = 'connecting'
let relayUiReady = false
let netTransportGeneration = 0
let relayPingIntervalId = null
let relayPingInFlight = false
let relayMenuState = 'closed'
let relayMenuTimer = null
const relayPingByServerId = new Map()

function _relayBar() { return document.getElementById('relay-bar') }
function _relayLabel() { return document.getElementById('relay-bar-label') }
function _relaySwitcherButton() { return document.getElementById('relay-switcher-btn') }
function _relaySwitcherMenu() { return document.getElementById('relay-switcher-menu') }
function _relaySwitcherCurrent() { return document.getElementById('relay-switcher-current') }
function _relaySwitcherIcon() { return document.getElementById('relay-switcher-icon') }
function _relaySwitcherList() { return document.getElementById('relay-switcher-menu-list') }

function getConfiguredRelayServers() {
  return RELAY_SERVERS
}

function getRelayServerById(id) {
  return getConfiguredRelayServers().find(server => server.id === id) || null
}

function getCurrentRelayServer() {
  return getRelayServerById(currentRelayServerId) || getConfiguredRelayServers()[0] || null
}

function formatRelayLatency(latencyMs) {
  return Number.isFinite(latencyMs) ? `${Math.round(latencyMs)} ms` : 'pending'
}

function setRelayStatus(state, details = {}) {
  const bar = _relayBar()
  const label = _relayLabel()
  const server = details.server || getCurrentRelayServer()
  const serverLabel = details.serverLabel || (server ? server.label : 'server')
  const latency = details.latency ?? currentRelayLatencyMs

  currentRelayStatus = state
  if (!bar) return

  bar.classList.remove('relay-ok', 'relay-err', 'relay-connecting', 'relay-disconnecting')
  if (state === 'connecting') {
    bar.classList.add('relay-connecting')
    if (label) label.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i> Connecting to ${serverLabel}...`
  } else if (state === 'disconnecting') {
    bar.classList.add('relay-disconnecting')
    if (label) label.innerHTML = `<i class="fa-solid fa-plug"></i> Disconnecting from ${serverLabel}...`
  } else if (state === 'ok') {
    bar.classList.add('relay-ok')
    if (label) label.innerHTML = `<i class="fa-solid fa-circle-check"></i> Connected: ${serverLabel}${Number.isFinite(latency) ? ` (${formatRelayLatency(latency)})` : ''}`
  } else if (state === 'err') {
    bar.classList.add('relay-err')
    if (label) label.innerHTML = `<i class="fa-solid fa-circle-xmark"></i> Couldn't connect to ${serverLabel}`
  }
}

function updateRelaySwitcherButton() {
  const button = _relaySwitcherButton()
  const currentLabel = _relaySwitcherCurrent()
  const currentIcon = _relaySwitcherIcon()
  const server = getCurrentRelayServer()
  if (!button || !currentLabel || !currentIcon || !server) return

  currentLabel.textContent = server.label
  currentIcon.className = 'relay-switcher-icon relay-flag'
  currentIcon.style.backgroundImage = server.flagSrc ? `url('${server.flagSrc}')` : ''
  button.setAttribute('aria-label', `Choose relay: ${server.label}`)
}

function renderRelaySwitcherMenu() {
  const list = _relaySwitcherList()
  if (!list) return

  const servers = getConfiguredRelayServers()
  const items = servers.map(server => {
    const ping = relayPingByServerId.get(server.id)
    const pingLabel = ping && ping.ok ? formatRelayLatency(ping.latency) : ping && !ping.ok ? 'offline' : 'measuring'
    const activeClass = server.id === currentRelayServerId ? ' is-active' : ''
    const badge = server.id === bestRelayServerId ? '<span class="relay-switcher-badge">Best</span>' : ''

    return `
      <button class="relay-switcher-item${activeClass}" type="button" data-relay-server-id="${server.id}">
        <span class="relay-switcher-item-main">
          <span class="relay-switcher-item-icon relay-flag" aria-hidden="true" style="background-image:url('${server.flagSrc || ''}')"></span>
          <span class="relay-switcher-item-copy">
            <span class="relay-switcher-item-name">${server.label}</span>
            <span class="relay-switcher-item-location">${server.location || ''}</span>
          </span>
        </span>
        <span class="relay-switcher-item-meta">
          ${badge}
          <span class="relay-switcher-ping">${pingLabel}</span>
        </span>
      </button>
    `
  }).join('')

  list.innerHTML = items

  list.querySelectorAll('[data-relay-server-id]').forEach(item => {
    item.addEventListener('click', async event => {
      event.stopPropagation()
      const serverId = item.getAttribute('data-relay-server-id')
      await switchRelayServer(serverId)
    })
  })
}

function positionRelaySwitcherMenu() {
  const shell = _relaySwitcherButton()
  const menu = _relaySwitcherMenu()
  if (!shell || !menu) return
  const rect = shell.getBoundingClientRect()
  menu.style.top = (rect.bottom + 8) + 'px'
  menu.style.right = (window.innerWidth - rect.right) + 'px'
  menu.style.left = 'auto'
}

function setRelayMenuOpen(open) {
  const shell = _relaySwitcherButton()
  const menu = _relaySwitcherMenu()
  if (!shell || !menu) return
  shell.setAttribute('aria-expanded', open ? 'true' : 'false')
  relayMenuState = open ? 'open' : 'closed'

  window.clearTimeout(relayMenuTimer)
  relayMenuTimer = null

  if (window.SoundFX) window.SoundFX.play(open ? 'relayOpen' : 'relayClose')

  if (open) {
    renderRelaySwitcherMenu()
    positionRelaySwitcherMenu()
    menu.hidden = false
    void menu.offsetHeight
    menu.classList.add('is-open')
  } else {
    menu.classList.remove('is-open')
    // keep it in the DOM during the fade-out, then detach
    relayMenuTimer = window.setTimeout(() => {
      menu.hidden = true
    }, 260)
  }
}

function showRelaySwitcherMenu() {
  if (relayMenuState === 'open') return
  setRelayMenuOpen(true)
}

function hideRelaySwitcherMenu() {
  if (relayMenuState === 'closed') return
  setRelayMenuOpen(false)
}

function toggleRelaySwitcherMenu() {
  if (relayMenuState === 'open') hideRelaySwitcherMenu()
  else showRelaySwitcherMenu()
}

function initRelayUi() {
  if (relayUiReady) return
  const shell = _relaySwitcherButton()
  const menu = _relaySwitcherMenu()
  if (!shell || !menu) return

  shell.addEventListener('click', event => {
    if (menu.contains(event.target)) return
    event.stopPropagation()
    toggleRelaySwitcherMenu()
  })

  shell.addEventListener('keydown', event => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    toggleRelaySwitcherMenu()
  })

  document.addEventListener('click', event => {
    if (relayMenuState !== 'open') return
    if (menu.contains(event.target) || shell.contains(event.target)) return
    hideRelaySwitcherMenu()
  })

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && relayMenuState === 'open') hideRelaySwitcherMenu()
  })

  window.addEventListener('resize', () => {
    if (relayMenuState === 'open') positionRelaySwitcherMenu()
  })
  window.addEventListener('scroll', () => {
    if (relayMenuState === 'open') positionRelaySwitcherMenu()
  }, true)

  updateRelaySwitcherButton()
  renderRelaySwitcherMenu()
  shell.setAttribute('aria-expanded', 'false')
  menu.hidden = true
  relayUiReady = true
}

async function getRelayUrl(serverId) {
  const id = serverId || currentRelayServerId
  const resolved = await resolveRelayUrl(id)
  if (resolved) return resolved
  return `wss://wisp-${id}.cgamz.online/`
}

function closeSocket(socket) {
  if (!socket) return Promise.resolve()

  return new Promise(resolve => {
    let settled = false
    const finish = () => {
      if (settled) return
      settled = true
      resolve()
    }

    try {
      if (socket.readyState === WebSocket.CLOSED) {
        finish()
        return
      }

      socket.addEventListener('close', finish, { once: true })
      socket.close()
      window.setTimeout(finish, 1200)
    } catch (e) {
      finish()
    }
  })
}

async function measureRelayServer(server, options = {}) {
  const timeoutMs = options.timeoutMs || RELAY_PING_TIMEOUT_MS
  const keepOpen = !!options.keepOpen

  return new Promise(async resolve => {
    if (!server) {
      resolve({ ok: false, latency: null, socket: null, server })
      return
    }

    const relayUrl = await getRelayUrl(server.id)

    if (!relayUrl) {
      resolve({ ok: false, latency: null, socket: null, server })
      return
    }

    const startedAt = performance.now()
    let settled = false
    let ws = null

    const finalize = result => {
      if (settled) return
      settled = true
      if (!keepOpen && ws) {
        try {
          if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) ws.close()
        } catch (e) {}
      }
      resolve({ ...result, server, socket: keepOpen && result.ok ? ws : null })
    }

    try {
      ws = new WebSocket(relayUrl)
      ws.binaryType = 'arraybuffer'

      const timeout = window.setTimeout(() => {
        finalize({ ok: false, latency: null })
      }, timeoutMs)

      ws.addEventListener('open', () => {
        window.clearTimeout(timeout)
        finalize({ ok: true, latency: Math.max(1, Math.round(performance.now() - startedAt)) })
      }, { once: true })

      ws.addEventListener('error', () => {
        window.clearTimeout(timeout)
        finalize({ ok: false, latency: null })
      }, { once: true })
    } catch (e) {
      finalize({ ok: false, latency: null })
    }
  })
}

async function preloadRelayConnection() {
  const server = getCurrentRelayServer()
  const serverId = server ? server.id : ''
  setRelayStatus('connecting', { server })

  try {
    const result = await measureRelayServer(server, {
      keepOpen: true,
      timeoutMs: RELAY_CONNECT_TIMEOUT_MS,
    })

    if (!result.ok || !result.socket) {
      currentRelayLatencyMs = null
      setRelayStatus('err', { server })
      renderRelaySwitcherMenu()
      return false
    }

    if (currentRelayServerId !== serverId) {
      await closeSocket(result.socket)
      return false
    }

    currentRelayLatencyMs = result.latency
    relayPingByServerId.set(server.id, { ok: true, latency: result.latency })
    relayPreloadSocket = result.socket
    relayPreloadSocket.addEventListener('close', () => {
      if (relayPreloadSocket === result.socket) relayPreloadSocket = null
    }, { once: true })
    setRelayStatus('ok', { server, latency: result.latency })
    renderRelaySwitcherMenu()
    return true
  } catch (e) {
    console.warn('Relay preload failed:', e)
    currentRelayLatencyMs = null
    setRelayStatus('err', { server })
    renderRelaySwitcherMenu()
    return false
  }
}

async function disconnectCurrentRelayConnection() {
  const server = getCurrentRelayServer()
  if (relayPreloadSocket || bridgeReady || pendingInitPromise) {
    setRelayStatus('disconnecting', { server })
  }

  const socketToClose = relayPreloadSocket
  relayPreloadSocket = null
  await closeSocket(socketToClose)

  netTransportGeneration += 1
  bridgeReady = false
  bridgeConnection = null
  pendingInitPromise = null
}

async function pingConfiguredRelayServers() {
  const servers = getConfiguredRelayServers()
  if (!servers.length) return null

  const results = await Promise.all(servers.map(server => measureRelayServer(server)))
  results.forEach(result => {
    relayPingByServerId.set(result.server.id, {
      ok: result.ok,
      latency: result.latency,
    })
  })

  const best = results
    .filter(result => result.ok && Number.isFinite(result.latency))
    .sort((a, b) => a.latency - b.latency)[0] || null

  bestRelayServerId = best ? best.server.id : ''
  renderRelaySwitcherMenu()
  return best
}

async function refreshRelayPingSnapshot() {
  if (relayPingInFlight) return null
  relayPingInFlight = true

  try {
    const best = await pingConfiguredRelayServers()
    const currentPing = relayPingByServerId.get(currentRelayServerId)

    if (currentPing && currentPing.ok && Number.isFinite(currentPing.latency)) {
      currentRelayLatencyMs = currentPing.latency
      if (currentRelayStatus === 'ok') {
        setRelayStatus('ok', {
          server: getCurrentRelayServer(),
          latency: currentPing.latency,
        })
      }
    }

    return best
  } finally {
    relayPingInFlight = false
  }
}

function startBackgroundRelayPingLoop() {
  if (relayPingIntervalId) return

  relayPingIntervalId = window.setInterval(() => {
    refreshRelayPingSnapshot().catch(error => {
      console.warn('Background Relay ping refresh failed:', error)
    })
  }, RELAY_BACKGROUND_PING_MS)
}

async function chooseBestRelayServer() {
  // Respect a manually saved relay server choice
  const savedServer = localStorage.getItem('plu_relay_server') || localStorage.getItem('plu_wisp_server')
  if (savedServer && getRelayServerById(savedServer)) {
    currentRelayServerId = savedServer
    currentRelayLatencyMs = null
    updateRelaySwitcherButton()
    renderRelaySwitcherMenu()
    return getRelayServerById(savedServer)
  }

  const geo = RELAY_QUERY_OVERRIDE ? null : await getClosestRelayServer()
  if (geo) {
    currentRelayServerId = geo.id
    bestRelayServerId = geo.id
    currentRelayLatencyMs = null
    updateRelaySwitcherButton()
    renderRelaySwitcherMenu()
    return geo
  }

  const best = await refreshRelayPingSnapshot()
  if (best && best.server) {
    currentRelayServerId = best.server.id
    currentRelayLatencyMs = best.latency
  } else {
    const fallback = getConfiguredRelayServers()[0] || null
    currentRelayServerId = fallback ? fallback.id : ''
    currentRelayLatencyMs = null
  }

  updateRelaySwitcherButton()
  renderRelaySwitcherMenu()
  return getCurrentRelayServer()
}

function currentNetAddress() {
  const input = document.getElementById('url-input')
  const value = typeof currentAddressValue === 'function'
    ? currentAddressValue()
    : ((input && input.value) || '').trim() || 'newtab'

  if (!value || value === 'newtab' || value.startsWith('Initializing net') || /^(?:plu|pluto):\/\//i.test(value)) return ''
  return value
}

function reconnectActivePage(url) {
  if (!url) return

  const frame = document.getElementById('page-frame')
  const newTabPage = document.getElementById('new-tab-page')
  const statusText = document.getElementById('status-text')

  if (newTabPage) newTabPage.style.display = 'none'
  if (frame) frame.style.display = 'none'
  if (typeof showLoadingScreen === 'function') showLoadingScreen(url)
  if (frame) frame.src = getNetUrl(url)
  if (statusText) statusText.textContent = `Switching server to ${getCurrentRelayServer().label}...`
}

async function switchRelayServer(serverId) {
  const targetServer = getRelayServerById(serverId)
  if (!targetServer) return false

  const sameServer = targetServer.id === currentRelayServerId
  const pageUrl = currentNetAddress()

  hideRelaySwitcherMenu()
  currentRelayServerId = targetServer.id
  localStorage.setItem('plu_relay_server', targetServer.id)
  currentRelayLatencyMs = relayPingByServerId.get(targetServer.id)?.latency ?? null
  updateRelaySwitcherButton()
  renderRelaySwitcherMenu()
  if (window.accountManager && typeof window.accountManager.scheduleSettingsSync === 'function') {
    window.accountManager.scheduleSettingsSync()
  }

  if (sameServer && relayPreloadSocket && bridgeReady) return true

  await disconnectCurrentRelayConnection()
  const connected = await preloadRelayConnection()
  if (!connected) return false

  const ready = await initBridge()
  // Remote sessions don't use the relay transport — never re-route one
  // through Core/Runtime just because the relay server changed.
  if (ready && pageUrl && getNetEngine() !== 'remote') reconnectActivePage(pageUrl)
  return ready
}

// ── Net engine (Core / Runtime / Remote) ────────────────────
const NET_MODE_KEY = 'plu_net_mode'
const LEGACY_NET_MODE_KEY = 'plu_proxy_engine'
const LEGACY_NET_MODE_MAP = { uv: 'core', sj: 'runtime', hb: 'remote' }
const REMOTE_WORKER_URL    = 'https://proxy.cdn.plutoniumnet.work'

function loadNetMode() {
  const stored = localStorage.getItem(NET_MODE_KEY)
  if (stored) return stored
  // Migrate the pre-rename storage key/value if present.
  const legacy = localStorage.getItem(LEGACY_NET_MODE_KEY)
  if (legacy) return LEGACY_NET_MODE_MAP[legacy] || legacy
  return 'core'
}

let selectedNet  = loadNetMode()   // 'core' | 'runtime' | 'remote'
let runtimeReady        = false
let runtimeController   = null
let currentRemoteSessionId = null
let currentRemoteTargetUrl = null

function getNetEngine() { return selectedNet }

function setNetEngine(engine) {
  if (!['core', 'runtime', 'remote'].includes(engine)) return
  const previous = selectedNet
  selectedNet = engine
  localStorage.setItem(NET_MODE_KEY, engine)
  syncEngineButtons()
  if (window.accountManager && typeof window.accountManager.scheduleSettingsSync === 'function') {
    window.accountManager.scheduleSettingsSync()
  }
  if (engine === 'remote') {
    // Remote sessions are launched on demand from navigate(); nothing to re-init.
    return
  }
  // Leaving Remote — tear down any running cloud session.
  if (previous === 'remote' && typeof endRemoteSession === 'function') endRemoteSession()
  const pageUrl = currentNetAddress()
  if (pageUrl) reconnectActivePage(pageUrl)
}

function syncEngineButtons() {
  const btns = document.querySelectorAll('.net-engine-btn')
  const switchEl = document.querySelector('.net-engine-switch')
  const slider = document.getElementById('net-engine-slider')

  btns.forEach(btn => {
    const isActive = btn.dataset.engine === selectedNet
    btn.classList.toggle('active', isActive)
  })

  if (!slider || !switchEl) return
  const activeBtn = switchEl.querySelector('.net-engine-btn.active')
  if (!activeBtn) { slider.style.opacity = '0'; return }
  const switchRect = switchEl.getBoundingClientRect()
  const btnRect = activeBtn.getBoundingClientRect()
  slider.style.opacity = '1'
  slider.style.left = (btnRect.left - switchRect.left) + 'px'
  slider.style.width = btnRect.width + 'px'
}



window.getNetEngine = getNetEngine
window.setNetEngine = setNetEngine

async function initCore() {
  if (coreReady) return true
  if (!('serviceWorker' in navigator)) return false
  if (typeof __uv$config === 'undefined') return false

  try {
    await navigator.serviceWorker.register('/core/sw.js', { scope: '/core/' })
    coreReady = true
    return true
  } catch (e) {
    console.warn('Core service worker registration failed:', e)
    return false
  }
}

// Runtime — served by the root sw.js (which handles /core/service/ + /runtime/service/)
async function initRuntime() {
  if (runtimeReady) return true
  if (typeof $scramjetLoadController === 'undefined') return false
  if (!('serviceWorker' in navigator)) return false

  try {
    await navigator.serviceWorker.register('/sw.js', { scope: '/' })

    // Repair the Runtime IDB if its stores are missing/broken
    await new Promise(resolve => {
      const req = indexedDB.open('$scramjet')
      req.onupgradeneeded = () => { try { req.transaction.abort() } catch (_) {} }
      req.onsuccess = () => {
        const db = req.result
        const needed = ['config','cookies','redirectTrackers','referrerPolicies','publicSuffixList']
        const missing = needed.filter(s => !db.objectStoreNames.contains(s))
        db.close()
        if (!missing.length) { resolve(); return }
        const del = indexedDB.deleteDatabase('$scramjet')
        del.onsuccess = del.onerror = del.onblocked = () => resolve()
      }
      req.onerror = () => resolve()
    })

    const { ScramjetController } = $scramjetLoadController()
    runtimeController = new ScramjetController({
      prefix: '/runtime/service/',
      files: { wasm: '/runtime/engine.wasm', all: '/runtime/all.js', sync: '/runtime/sync.js' },
    })
    await runtimeController.init()
    runtimeReady = true
    return true
  } catch (e) {
    console.warn('Runtime init failed:', e)
    return false
  }
}

async function initBridge() {
  if (bridgeReady) return true
  if (pendingInitPromise) return pendingInitPromise

  const generation = netTransportGeneration
  pendingInitPromise = (async () => {
    if (!window.BareMux) {
      console.warn('BareMux not loaded')
      setRelayStatus('err')
      return false
    }

    try {
      const relayUrl = await getRelayUrl()
      bridgeConnection = new BareMux.BareMuxConnection('/bridge/worker.js')
      await bridgeConnection.setTransport('/mesh/index.mjs', [{ wisp: relayUrl }])
      if (generation !== netTransportGeneration) return false
      bridgeReady = !!(await bridgeConnection.getTransport())
      if (!bridgeReady) setRelayStatus('err')
      return bridgeReady
    } catch (e) {
      console.warn('BareMux transport initialization failed:', e)
      setRelayStatus('err')
      return false
    } finally {
      pendingInitPromise = null
    }
  })()

  return pendingInitPromise
}

async function initNetStack() {
  await initCore()
  await initRuntime()
  await initBridge()
}

// ── Remote (worker-hosted browser session) ─────────────────────────────
async function launchRemoteSession(raw) {
  if (!raw) return false

  let url
  try {
    url = raw.startsWith('http://') || raw.startsWith('https://') ? raw : 'https://' + raw
    new URL(url)
  } catch {
    return false
  }

  await endRemoteSession()

  const statusText = document.getElementById('status-text')
  const pageFrame = document.getElementById('page-frame')
  if (statusText) statusText.textContent = 'Starting remote session…'

  try {
    const res = await fetch(`${REMOTE_WORKER_URL}/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      throw new Error(data.error || `Remote worker error: ${res.status}`)
    }
    if (!data.embed_url) throw new Error('No embed_url returned from worker')

    currentRemoteSessionId = data.session_id || null
    currentRemoteTargetUrl = url
    const newTabPage = document.getElementById('new-tab-page')
    if (newTabPage) newTabPage.style.display = 'none'
    if (pageFrame) {
      pageFrame.style.display = 'block'
      pageFrame.src = data.embed_url + '&controls=false'
    }
    if (statusText) statusText.textContent = ''
    return true
  } catch (e) {
    console.error('[remote] session error:', e)
    if (statusText) statusText.textContent = 'Remote: ' + e.message
    return false
  }
}

async function endRemoteSession() {
  if (!currentRemoteSessionId) return
  const id = currentRemoteSessionId
  currentRemoteSessionId = null
  currentRemoteTargetUrl = null
  try {
    await fetch(`${REMOTE_WORKER_URL}/session`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: id }),
    })
  } catch (e) {}
}

window.launchRemoteSession = launchRemoteSession
window.endRemoteSession = endRemoteSession

function getNetUrl(url) {
  // Remote pages live in a remote VM embed, not a rewritten URL — never
  // hand one to Core/Runtime.
  if (selectedNet === 'remote') return url
  if (selectedNet === 'runtime') {
    if (runtimeReady && runtimeController) return runtimeController.encodeUrl(url)
    return url
  }
  // Core (default)
  if (!coreReady || typeof __uv$config === 'undefined') return url
  return __uv$config.prefix + __uv$config.encodeUrl(url)
}

function getRealUrlFromNet(maybeNetUrl) {
  // Active Remote session — surface the real target URL
  if (currentRemoteTargetUrl) return currentRemoteTargetUrl

  if (selectedNet === 'runtime' && runtimeReady && runtimeController) {
    try {
      if (maybeNetUrl.includes('/runtime/service/')) return runtimeController.decodeUrl(maybeNetUrl)
    } catch (e) {}
    return maybeNetUrl
  }

  if (typeof __uv$config === 'undefined') return maybeNetUrl
  try {
    const absolute = new URL(maybeNetUrl, window.location.origin)
    if (absolute.pathname.startsWith(__uv$config.prefix)) {
      const encoded = absolute.pathname.slice(__uv$config.prefix.length) + absolute.search + absolute.hash
      return __uv$config.decodeUrl(encoded)
    }
  } catch (e) {}
  return maybeNetUrl
}

function getRelayConnectionSummary() {
  const server = getCurrentRelayServer()
  return {
    id: server ? server.id : '',
    label: server ? server.label : 'Unknown',
    latency: currentRelayLatencyMs,
    latencyText: formatRelayLatency(currentRelayLatencyMs),
    status: currentRelayStatus,
  }
}

window.getRelayConnectionSummary = getRelayConnectionSummary

// ── Deferred net init ───────────────────────────────────────────────────────
// Net scripts (relay + Core/Runtime/Bridge) load 10s after the DOM is ready
// so the shell UI paints first. The address bar shows a live countdown while
// the user waits, then switches to a short "Initializing net…" phase.
const NET_INIT_DELAY_MS = 10000
let netInitCountdownTimer = null

function netCountdownInputs() {
  return ['url-input', 'newtab-search'].map(id => document.getElementById(id)).filter(Boolean)
}

function scheduleNetInit() {
  const inputs = netCountdownInputs()
  const startedAt = Date.now()

  const showCountdown = () => {
    const remaining = Math.max(0, Math.ceil((NET_INIT_DELAY_MS - (Date.now() - startedAt)) / 1000))
    inputs.forEach(input => {
      // Only own the field when we set it: skip if the user is typing in it.
      if (document.activeElement === input) return
      if (input.value && !input.value.startsWith('Initializing net')) return
      input.value = `Initializing net in ${remaining}s`
    })
  }

  showCountdown()
  netInitCountdownTimer = window.setInterval(showCountdown, 1000)

  window.setTimeout(() => {
    window.clearInterval(netInitCountdownTimer)
    netInitCountdownTimer = null
    runNetInit()
  }, NET_INIT_DELAY_MS)
}

async function runNetInit() {
  const inputs = netCountdownInputs()
  inputs.forEach(input => {
    if (input.value.startsWith('Initializing net')) input.value = 'Initializing net…'
  })
  try {
    await chooseBestRelayServer()
    await preloadRelayConnection()
    await initNetStack()
    startBackgroundRelayPingLoop()
  } finally {
    inputs.forEach(input => {
      if (input.value.startsWith('Initializing net')) input.value = ''
    })
  }
}

document.addEventListener('DOMContentLoaded', () => {
  initRelayUi()
  scheduleNetInit()
})
