const WISP_QUERY_OVERRIDE = new URLSearchParams(window.location.search).get('wisp')
const WISP_WORKER_BASE = 'https://wisp.cgamz.online'
const DEFAULT_WISP_REGION = 'us-east-1'
const WISP_CONNECT_TIMEOUT_MS = 15000
const WISP_PING_TIMEOUT_MS = 8000
const WISP_BACKGROUND_PING_MS = 5000

const WISP_SERVERS = [
  { id: 'us-east-1', label: 'US East 1', location: 'Virginia, USA',     flagSrc: 'img/flags/us.png', lat: 37.4316,  lon: -78.6569  },
  { id: 'us-east-2', label: 'US East 2', location: 'Ohio, USA',         flagSrc: 'img/flags/us.png', lat: 40.4173,  lon: -82.9071  },
  { id: 'us-west',   label: 'US West',   location: 'Oregon, USA',       flagSrc: 'img/flags/us.png', lat: 43.8041,  lon: -120.5542 },
  { id: 'europe',    label: 'Europe',    location: 'Frankfurt, Germany', flagSrc: 'img/flags/eu.png', lat: 50.1109,  lon: 8.6821    },
  { id: 'asia',      label: 'Asia',      location: 'Singapore',         flagSrc: 'img/flags/sg.png', lat: 1.3521,   lon: 103.8198  },
]

const resolvedWispUrlCache = new Map()

async function resolveWispUrl(serverId) {
  if (WISP_QUERY_OVERRIDE) return WISP_QUERY_OVERRIDE
  if (resolvedWispUrlCache.has(serverId)) return resolvedWispUrlCache.get(serverId)

  try {
    const res = await fetch(`${WISP_WORKER_BASE}/${serverId}/`, { signal: AbortSignal.timeout(4000) })
    const data = await res.json()
    if (data && data.redirect) {
      resolvedWispUrlCache.set(serverId, data.redirect)
      return data.redirect
    }
    const headerUrl = res.headers.get('X-Wisp-Redirect')
    if (headerUrl) {
      resolvedWispUrlCache.set(serverId, headerUrl)
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

async function getClosestWispServer() {
  try {
    const res = await fetch('https://ipapi.co/json/', { signal: AbortSignal.timeout(3000) })
    const data = await res.json()
    const { latitude, longitude } = data
    if (!latitude || !longitude) return null
    return getConfiguredWispServers()
      .map(s => ({ server: s, dist: geoDistanceKm(latitude, longitude, s.lat, s.lon) }))
      .sort((a, b) => a.dist - b.dist)[0].server
  } catch (e) {
    return null
  }
}

let uvReady = false
let baremuxReady = false
let baremuxConnection = null
let pendingInitPromise = null
let wispPreloadSocket = null
let currentWispServerId = WISP_SERVERS[0] ? WISP_SERVERS[0].id : ''
let currentWispLatencyMs = null
let bestWispServerId = ''
let currentWispStatus = 'connecting'
let wispUiReady = false
let proxyTransportGeneration = 0
let wispBackgroundPingIntervalId = null
let wispBackgroundPingInFlight = false
let wispSwitcherMenuState = 'closed'
let wispSwitcherMenuStateTimer = null
const wispPingByServerId = new Map()

function _wispBar() { return document.getElementById('wisp-bar') }
function _wispLabel() { return document.getElementById('wisp-bar-label') }
function _wispSwitcherButton() { return document.getElementById('wisp-switcher-btn') }
function _wispSwitcherMenu() { return document.getElementById('wisp-switcher-menu') }
function _wispSwitcherCurrent() { return document.getElementById('wisp-switcher-current') }
function _wispSwitcherIcon() { return document.getElementById('wisp-switcher-icon') }
function _wispSwitcherList() { return document.getElementById('wisp-switcher-menu-list') }

function getConfiguredWispServers() {
  return WISP_SERVERS
}

function getWispServerById(id) {
  return getConfiguredWispServers().find(server => server.id === id) || null
}

function getCurrentWispServer() {
  return getWispServerById(currentWispServerId) || getConfiguredWispServers()[0] || null
}

function formatWispLatency(latencyMs) {
  return Number.isFinite(latencyMs) ? `${Math.round(latencyMs)} ms` : 'pending'
}

function setWispStatus(state, details = {}) {
  const bar = _wispBar()
  const label = _wispLabel()
  const server = details.server || getCurrentWispServer()
  const serverLabel = details.serverLabel || (server ? server.label : 'server')
  const latency = details.latency ?? currentWispLatencyMs

  currentWispStatus = state
  if (!bar) return

  bar.classList.remove('wisp-ok', 'wisp-err', 'wisp-connecting', 'wisp-disconnecting')
  if (state === 'connecting') {
    bar.classList.add('wisp-connecting')
    if (label) label.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i> Connecting to ${serverLabel}...`
  } else if (state === 'disconnecting') {
    bar.classList.add('wisp-disconnecting')
    if (label) label.innerHTML = `<i class="fa-solid fa-plug"></i> Disconnecting from ${serverLabel}...`
  } else if (state === 'ok') {
    bar.classList.add('wisp-ok')
    if (label) label.innerHTML = `<i class="fa-solid fa-circle-check"></i> Connected: ${serverLabel}${Number.isFinite(latency) ? ` (${formatWispLatency(latency)})` : ''}`
  } else if (state === 'err') {
    bar.classList.add('wisp-err')
    if (label) label.innerHTML = `<i class="fa-solid fa-circle-xmark"></i> Couldn't connect to ${serverLabel}`
  }
}

function updateWispSwitcherButton() {
  const button = _wispSwitcherButton()
  const currentLabel = _wispSwitcherCurrent()
  const currentIcon = _wispSwitcherIcon()
  const server = getCurrentWispServer()
  if (!button || !currentLabel || !currentIcon || !server) return

  currentLabel.textContent = server.label
  currentIcon.className = 'wisp-switcher-icon wisp-flag'
  currentIcon.style.backgroundImage = server.flagSrc ? `url('${server.flagSrc}')` : ''
  button.setAttribute('aria-label', `Choose Wisp server: ${server.label}`)
}

function renderWispSwitcherMenu() {
  const list = _wispSwitcherList()
  if (!list) return

  const servers = getConfiguredWispServers()
  const items = servers.map(server => {
    const ping = wispPingByServerId.get(server.id)
    const pingLabel = ping && ping.ok ? formatWispLatency(ping.latency) : ping && !ping.ok ? 'offline' : 'measuring'
    const activeClass = server.id === currentWispServerId ? ' is-active' : ''
    const badge = server.id === bestWispServerId ? '<span class="wisp-switcher-badge">Best</span>' : ''

    return `
      <button class="wisp-switcher-item${activeClass}" type="button" data-wisp-server-id="${server.id}">
        <span class="wisp-switcher-item-main">
          <span class="wisp-switcher-item-icon wisp-flag" aria-hidden="true" style="background-image:url('${server.flagSrc || ''}')"></span>
          <span class="wisp-switcher-item-copy">
            <span class="wisp-switcher-item-name">${server.label}</span>
            <span class="wisp-switcher-item-location">${server.location || ''}</span>
          </span>
        </span>
        <span class="wisp-switcher-item-meta">
          ${badge}
          <span class="wisp-switcher-ping">${pingLabel}</span>
        </span>
      </button>
    `
  }).join('')

  list.innerHTML = items

  list.querySelectorAll('[data-wisp-server-id]').forEach(item => {
    item.addEventListener('click', async event => {
      event.stopPropagation()
      const serverId = item.getAttribute('data-wisp-server-id')
      await switchWispServer(serverId)
    })
  })
}

function positionWispSwitcherMenu() {
  const shell = _wispSwitcherButton()
  const menu = _wispSwitcherMenu()
  if (!shell || !menu) return
  const rect = shell.getBoundingClientRect()
  menu.style.top = (rect.bottom + 8) + 'px'
  menu.style.right = (window.innerWidth - rect.right) + 'px'
  menu.style.left = 'auto'
}

function setWispMenuOpen(open) {
  const shell = _wispSwitcherButton()
  const menu = _wispSwitcherMenu()
  if (!shell || !menu) return
  shell.setAttribute('aria-expanded', open ? 'true' : 'false')
  wispSwitcherMenuState = open ? 'open' : 'closed'

  window.clearTimeout(wispSwitcherMenuStateTimer)
  wispSwitcherMenuStateTimer = null

  if (window.SoundFX) window.SoundFX.play(open ? 'wispOpen' : 'wispClose')

  if (open) {
    renderWispSwitcherMenu()
    positionWispSwitcherMenu()
    menu.hidden = false
    void menu.offsetHeight
    menu.classList.add('is-open')
  } else {
    menu.classList.remove('is-open')
    // keep it in the DOM during the fade-out, then detach
    wispSwitcherMenuStateTimer = window.setTimeout(() => {
      menu.hidden = true
    }, 260)
  }
}

function showWispSwitcherMenu() {
  if (wispSwitcherMenuState === 'open') return
  setWispMenuOpen(true)
}

function hideWispSwitcherMenu() {
  if (wispSwitcherMenuState === 'closed') return
  setWispMenuOpen(false)
}

function toggleWispSwitcherMenu() {
  if (wispSwitcherMenuState === 'open') hideWispSwitcherMenu()
  else showWispSwitcherMenu()
}

function initWispUi() {
  if (wispUiReady) return
  const shell = _wispSwitcherButton()
  const menu = _wispSwitcherMenu()
  if (!shell || !menu) return

  shell.addEventListener('click', event => {
    if (menu.contains(event.target)) return
    event.stopPropagation()
    toggleWispSwitcherMenu()
  })

  shell.addEventListener('keydown', event => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    toggleWispSwitcherMenu()
  })

  document.addEventListener('click', event => {
    if (wispSwitcherMenuState !== 'open') return
    if (menu.contains(event.target) || shell.contains(event.target)) return
    hideWispSwitcherMenu()
  })

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && wispSwitcherMenuState === 'open') hideWispSwitcherMenu()
  })

  window.addEventListener('resize', () => {
    if (wispSwitcherMenuState === 'open') positionWispSwitcherMenu()
  })
  window.addEventListener('scroll', () => {
    if (wispSwitcherMenuState === 'open') positionWispSwitcherMenu()
  }, true)

  updateWispSwitcherButton()
  renderWispSwitcherMenu()
  shell.setAttribute('aria-expanded', 'false')
  menu.hidden = true
  wispUiReady = true
}

async function getWispUrl(serverId) {
  const id = serverId || currentWispServerId
  const resolved = await resolveWispUrl(id)
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

async function measureWispServer(server, options = {}) {
  const timeoutMs = options.timeoutMs || WISP_PING_TIMEOUT_MS
  const keepOpen = !!options.keepOpen

  return new Promise(async resolve => {
    if (!server) {
      resolve({ ok: false, latency: null, socket: null, server })
      return
    }

    const wispUrl = await getWispUrl(server.id)

    if (!wispUrl) {
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
      ws = new WebSocket(wispUrl)
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

async function preloadWispConnection() {
  const server = getCurrentWispServer()
  const serverId = server ? server.id : ''
  setWispStatus('connecting', { server })

  try {
    const result = await measureWispServer(server, {
      keepOpen: true,
      timeoutMs: WISP_CONNECT_TIMEOUT_MS,
    })

    if (!result.ok || !result.socket) {
      currentWispLatencyMs = null
      setWispStatus('err', { server })
      renderWispSwitcherMenu()
      return false
    }

    if (currentWispServerId !== serverId) {
      await closeSocket(result.socket)
      return false
    }

    currentWispLatencyMs = result.latency
    wispPingByServerId.set(server.id, { ok: true, latency: result.latency })
    wispPreloadSocket = result.socket
    wispPreloadSocket.addEventListener('close', () => {
      if (wispPreloadSocket === result.socket) wispPreloadSocket = null
    }, { once: true })
    setWispStatus('ok', { server, latency: result.latency })
    renderWispSwitcherMenu()
    return true
  } catch (e) {
    console.warn('Wisp preload failed:', e)
    currentWispLatencyMs = null
    setWispStatus('err', { server })
    renderWispSwitcherMenu()
    return false
  }
}

async function disconnectCurrentWispConnection() {
  const server = getCurrentWispServer()
  if (wispPreloadSocket || baremuxReady || pendingInitPromise) {
    setWispStatus('disconnecting', { server })
  }

  const socketToClose = wispPreloadSocket
  wispPreloadSocket = null
  await closeSocket(socketToClose)

  proxyTransportGeneration += 1
  baremuxReady = false
  baremuxConnection = null
  pendingInitPromise = null
}

async function pingConfiguredWispServers() {
  const servers = getConfiguredWispServers()
  if (!servers.length) return null

  const results = await Promise.all(servers.map(server => measureWispServer(server)))
  results.forEach(result => {
    wispPingByServerId.set(result.server.id, {
      ok: result.ok,
      latency: result.latency,
    })
  })

  const best = results
    .filter(result => result.ok && Number.isFinite(result.latency))
    .sort((a, b) => a.latency - b.latency)[0] || null

  bestWispServerId = best ? best.server.id : ''
  renderWispSwitcherMenu()
  return best
}

async function refreshWispPingSnapshot() {
  if (wispBackgroundPingInFlight) return null
  wispBackgroundPingInFlight = true

  try {
    const best = await pingConfiguredWispServers()
    const currentPing = wispPingByServerId.get(currentWispServerId)

    if (currentPing && currentPing.ok && Number.isFinite(currentPing.latency)) {
      currentWispLatencyMs = currentPing.latency
      if (currentWispStatus === 'ok') {
        setWispStatus('ok', {
          server: getCurrentWispServer(),
          latency: currentPing.latency,
        })
      }
    }

    return best
  } finally {
    wispBackgroundPingInFlight = false
  }
}

function startBackgroundWispPingLoop() {
  if (wispBackgroundPingIntervalId) return

  wispBackgroundPingIntervalId = window.setInterval(() => {
    refreshWispPingSnapshot().catch(error => {
      console.warn('Background Wisp ping refresh failed:', error)
    })
  }, WISP_BACKGROUND_PING_MS)
}

async function chooseBestWispServer() {
  // Respect a manually saved wisp server choice
  const savedServer = localStorage.getItem('plu_wisp_server')
  if (savedServer && getWispServerById(savedServer)) {
    currentWispServerId = savedServer
    currentWispLatencyMs = null
    updateWispSwitcherButton()
    renderWispSwitcherMenu()
    return getWispServerById(savedServer)
  }

  const geo = WISP_QUERY_OVERRIDE ? null : await getClosestWispServer()
  if (geo) {
    currentWispServerId = geo.id
    bestWispServerId = geo.id
    currentWispLatencyMs = null
    updateWispSwitcherButton()
    renderWispSwitcherMenu()
    return geo
  }

  const best = await refreshWispPingSnapshot()
  if (best && best.server) {
    currentWispServerId = best.server.id
    currentWispLatencyMs = best.latency
  } else {
    const fallback = getConfiguredWispServers()[0] || null
    currentWispServerId = fallback ? fallback.id : ''
    currentWispLatencyMs = null
  }

  updateWispSwitcherButton()
  renderWispSwitcherMenu()
  return getCurrentWispServer()
}

function currentProxyAddress() {
  const input = document.getElementById('url-input')
  const value = typeof currentAddressValue === 'function'
    ? currentAddressValue()
    : ((input && input.value) || '').trim() || 'newtab'

  if (!value || value === 'newtab' || /^(?:plu|pluto):\/\//i.test(value)) return ''
  return value
}

function reconnectActiveProxyPage(url) {
  if (!url) return

  const frame = null
  const newTabPage = document.getElementById('new-tab-page')
  const statusText = document.getElementById('status-text')

  if (newTabPage) newTabPage.style.display = 'none'
  if (frame) frame.style.display = 'none'
  if (typeof showLoadingScreen === 'function') showLoadingScreen(url)
  if (frame) frame.src = getProxyUrl(url)
  if (statusText) statusText.textContent = `Switching server to ${getCurrentWispServer().label}...`
}

async function switchWispServer(serverId) {
  const targetServer = getWispServerById(serverId)
  if (!targetServer) return false

  const sameServer = targetServer.id === currentWispServerId
  const pageUrl = currentProxyAddress()

  hideWispSwitcherMenu()
  currentWispServerId = targetServer.id
  localStorage.setItem('plu_wisp_server', targetServer.id)
  currentWispLatencyMs = wispPingByServerId.get(targetServer.id)?.latency ?? null
  updateWispSwitcherButton()
  renderWispSwitcherMenu()
  if (window.accountManager && typeof window.accountManager.scheduleSettingsSync === 'function') {
    window.accountManager.scheduleSettingsSync()
  }

  if (sameServer && wispPreloadSocket && baremuxReady) return true

  await disconnectCurrentWispConnection()
  const connected = await preloadWispConnection()
  if (!connected) return false

  const ready = await initBaremux()
  if (ready && pageUrl) reconnectActiveProxyPage(pageUrl)
  return ready
}

// ── Proxy engine (Ultraviolet / Scramjet / Hyperbeam) ────────────────────
const PROXY_ENGINE_KEY = 'plu_proxy_engine'
const HB_WORKER_URL    = 'https://proxy.cdn.plutoniumnet.work'

let selectedProxy  = localStorage.getItem(PROXY_ENGINE_KEY) || 'uv'   // 'uv' | 'sj' | 'hb'
let sjReady        = false
let sjController   = null
let currentHbSessionId = null
let currentHbTargetUrl = null

function getProxyEngine() { return selectedProxy }

function setProxyEngine(engine) {
  if (!['uv', 'sj', 'hb'].includes(engine)) return
  selectedProxy = engine
  localStorage.setItem(PROXY_ENGINE_KEY, engine)
  syncProxyEngineButtons()
  if (window.accountManager && typeof window.accountManager.scheduleSettingsSync === 'function') {
    window.accountManager.scheduleSettingsSync()
  }
  if (engine === 'hb') {
    // HB sessions are launched on demand from navigate(); nothing to re-init.
    return
  }
  const pageUrl = currentProxyAddress()
  if (pageUrl) reconnectActiveProxyPage(pageUrl)
}

function syncProxyEngineButtons() {
  const btns = document.querySelectorAll('.proxy-engine-btn')
  const switchEl = document.querySelector('.proxy-engine-switch')
  const slider = document.getElementById('proxy-engine-slider')

  btns.forEach(btn => {
    const isActive = btn.dataset.engine === selectedProxy
    btn.classList.toggle('active', isActive)
  })

  if (!slider || !switchEl) return
  const activeBtn = switchEl.querySelector('.proxy-engine-btn.active')
  if (!activeBtn) { slider.style.opacity = '0'; return }
  const switchRect = switchEl.getBoundingClientRect()
  const btnRect = activeBtn.getBoundingClientRect()
  slider.style.opacity = '1'
  slider.style.left = (btnRect.left - switchRect.left) + 'px'
  slider.style.width = btnRect.width + 'px'
}



window.getProxyEngine = getProxyEngine
window.setProxyEngine = setProxyEngine

async function initUv() {
  if (uvReady) return true
  if (!('serviceWorker' in navigator)) return false
  if (typeof __uv$config === 'undefined') return false

  try {
    await navigator.serviceWorker.register('/uv/sw.js', { scope: '/uv/' })
    uvReady = true
    return true
  } catch (e) {
    console.warn('UV service worker registration failed:', e)
    return false
  }
}

// Scramjet — served by the root sw.js (which handles /uv/service/ + /sj/service/)
async function initScramjet() {
  if (sjReady) return true
  if (typeof $scramjetLoadController === 'undefined') return false
  if (!('serviceWorker' in navigator)) return false

  try {
    await navigator.serviceWorker.register('/sw.js', { scope: '/' })

    // Repair the Scramjet IDB if its stores are missing/broken
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
    sjController = new ScramjetController({
      prefix: '/sj/service/',
      files: { wasm: '/sj/scramjet.wasm.wasm', all: '/sj/scramjet.all.js', sync: '/sj/scramjet.sync.js' },
    })
    await sjController.init()
    sjReady = true
    return true
  } catch (e) {
    console.warn('Scramjet init failed:', e)
    return false
  }
}

async function initBaremux() {
  if (baremuxReady) return true
  if (pendingInitPromise) return pendingInitPromise

  const generation = proxyTransportGeneration
  pendingInitPromise = (async () => {
    if (!window.BareMux) {
      console.warn('BareMux not loaded')
      setWispStatus('err')
      return false
    }

    try {
      const wispUrl = await getWispUrl()
      baremuxConnection = new BareMux.BareMuxConnection('/baremux/worker.js')
      await baremuxConnection.setTransport('/libcurl/index.mjs', [{ wisp: wispUrl }])
      if (generation !== proxyTransportGeneration) return false
      baremuxReady = !!(await baremuxConnection.getTransport())
      if (!baremuxReady) setWispStatus('err')
      return baremuxReady
    } catch (e) {
      console.warn('BareMux transport initialization failed:', e)
      setWispStatus('err')
      return false
    } finally {
      pendingInitPromise = null
    }
  })()

  return pendingInitPromise
}

async function initProxyStack() {
  await initUv()
  await initScramjet()
  await initBaremux()
}

// ── Hyperbeam (worker-hosted browser session) ─────────────────────────────
async function launchHbProxy(raw) {
  if (!raw) return false

  let url
  try {
    url = raw.startsWith('http://') || raw.startsWith('https://') ? raw : 'https://' + raw
    new URL(url)
  } catch {
    return false
  }

  await terminateHbSession()

  const statusText = document.getElementById('status-text')
  const pageFrame = document.getElementById('page-frame')
  if (statusText) statusText.textContent = 'Starting Hyperbeam session…'

  try {
    const res = await fetch(`${HB_WORKER_URL}/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      throw new Error(data.error || `Hyperbeam worker error: ${res.status}`)
    }
    if (!data.embed_url) throw new Error('No embed_url returned from worker')

    currentHbSessionId = data.session_id || null
    currentHbTargetUrl = url
    const newTabPage = document.getElementById('new-tab-page')
    if (newTabPage) newTabPage.style.display = 'none'
    if (pageFrame) {
      pageFrame.style.display = 'block'
      pageFrame.src = data.embed_url + '&controls=false'
    }
    if (statusText) statusText.textContent = ''
    return true
  } catch (e) {
    console.error('[hb] session error:', e)
    if (statusText) statusText.textContent = 'Hyperbeam: ' + e.message
    return false
  }
}

async function terminateHbSession() {
  if (!currentHbSessionId) return
  const id = currentHbSessionId
  currentHbSessionId = null
  currentHbTargetUrl = null
  try {
    await fetch(`${HB_WORKER_URL}/session`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: id }),
    })
  } catch (e) {}
}

window.launchHbProxy = launchHbProxy
window.terminateHbSession = terminateHbSession

function getProxyUrl(url) {
  if (selectedProxy === 'sj') {
    if (sjReady && sjController) return sjController.encodeUrl(url)
    return url
  }
  // Ultraviolet (default)
  if (!uvReady || typeof __uv$config === 'undefined') return url
  return __uv$config.prefix + __uv$config.encodeUrl(url)
}

function getRealUrlFromProxy(maybeProxyUrl) {
  // Active Hyperbeam session — surface the real target URL
  if (currentHbTargetUrl) return currentHbTargetUrl

  if (selectedProxy === 'sj' && sjReady && sjController) {
    try {
      if (maybeProxyUrl.includes('/sj/service/')) return sjController.decodeUrl(maybeProxyUrl)
    } catch (e) {}
    return maybeProxyUrl
  }

  if (typeof __uv$config === 'undefined') return maybeProxyUrl
  try {
    const absolute = new URL(maybeProxyUrl, window.location.origin)
    if (absolute.pathname.startsWith(__uv$config.prefix)) {
      const encoded = absolute.pathname.slice(__uv$config.prefix.length) + absolute.search + absolute.hash
      return __uv$config.decodeUrl(encoded)
    }
  } catch (e) {}
  return maybeProxyUrl
}

function getWispConnectionSummary() {
  const server = getCurrentWispServer()
  return {
    id: server ? server.id : '',
    label: server ? server.label : 'Unknown',
    latency: currentWispLatencyMs,
    latencyText: formatWispLatency(currentWispLatencyMs),
    status: currentWispStatus,
  }
}

window.getWispConnectionSummary = getWispConnectionSummary

document.addEventListener('DOMContentLoaded', async () => {
  initWispUi()
  await chooseBestWispServer()
  await preloadWispConnection()
  await initProxyStack()
  startBackgroundWispPingLoop()
})
