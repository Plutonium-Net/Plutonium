const RELAY_QUERY_OVERRIDE = new URLSearchParams(window.location.search).get('relay')

// Wisp relay infrastructure. Each region is served from its own host, so the
// list below is the only place that decides where proxied browsing traffic
// goes: adding a region is a row here plus a matching `wisp-<id>` host. The
// first row is the fallback when neither geolocation nor ping picks a region.
const RELAY_URL_TEMPLATE = 'wss://wisp-{id}.plutoniumnet.work/'

// Optional discovery worker: answers `<base>/<region-id>/` with `{ redirect }`
// (or an `X-Relay-Redirect` header) naming that region's live relay. Left null
// because the hosts above are static; point it at a worker to let relays move
// without shipping a client change.
const RELAY_DISCOVERY_BASE = null

const RELAY_CONNECT_TIMEOUT_MS = 15000
const RELAY_PING_TIMEOUT_MS = 8000
const RELAY_BACKGROUND_PING_MS = 5000

const RELAY_SERVERS = [
  { id: 'us-east', label: 'US East', location: 'Virginia, USA',      flagSrc: 'img/flags/us.png', lat: 37.4316,  lon: -78.6569  },
  { id: 'us-west', label: 'US West', location: 'Oregon, USA',        flagSrc: 'img/flags/us.png', lat: 43.8041,  lon: -120.5542 },
  { id: 'europe',  label: 'Europe',  location: 'Frankfurt, Germany', flagSrc: 'img/flags/eu.png', lat: 50.1109,  lon: 8.6821    },
  { id: 'asia',    label: 'Asia',    location: 'Singapore',          flagSrc: 'img/flags/sg.png', lat: 1.3521,   lon: 103.8198  },
]

// Compaxy runs its own regional hosts as well. No row carries `preferred`, so
// the picker falls back to the same IP lookup and ping race the wisp relay uses.
// The hostnames mirror data/app-servers.json, which points the Apps section at
// this same fleet.
const COMPAXY_SERVERS = [
  { id: 'us-east-1', label: 'US East 1', location: 'Virginia, USA',      host: 'compaxy-us-east-1.plutoniumnet.work', flagSrc: 'img/flags/us.png', lat: 37.4316, lon: -78.6569  },
  { id: 'us-east-2', label: 'US East 2', location: 'Ohio, USA',          host: 'compaxy-us-east-2.plutoniumnet.work', flagSrc: 'img/flags/us.png', lat: 39.9612, lon: -82.9988  },
  { id: 'us-west',   label: 'US West',   location: 'Oregon, USA',        host: 'compaxy-us-west.plutoniumnet.work',   flagSrc: 'img/flags/us.png', lat: 43.8041, lon: -120.5542 },
  { id: 'europe',    label: 'Europe',    location: 'Frankfurt, Germany', host: 'compaxy-europe.plutoniumnet.work',    flagSrc: 'img/flags/eu.png', lat: 50.1109, lon: 8.6821    },
  { id: 'asia',      label: 'Asia',      location: 'Singapore',          host: 'compaxy-asia.plutoniumnet.work',      flagSrc: 'img/flags/sg.png', lat: 1.3521,  lon: 103.8198  },
]
const COMPAXY_SERVER_KEY = 'plu_compaxy_server'

// RH runs one host per region and takes the target as a `?url=` query on
// the host root, which redirects into `/<session>/<target>`. No row carries
// `preferred`: the regions are peers, so the picker uses the same IP lookup and
// ping race as the wisp relay and Compaxy.
const RH_SERVERS = [
  { id: 'us-east', label: 'US East', location: 'Virginia, USA',      host: 'rh-us-east.plutoniumnet.work', flagSrc: 'img/flags/us.png', lat: 37.4316, lon: -78.6569  },
  { id: 'us-west', label: 'US West', location: 'Oregon, USA',        host: 'rh-us-west.plutoniumnet.work', flagSrc: 'img/flags/us.png', lat: 43.8041, lon: -120.5542 },
  { id: 'europe',  label: 'Europe',  location: 'Frankfurt, Germany', host: 'rh-europe.plutoniumnet.work',  flagSrc: 'img/flags/eu.png', lat: 50.1109, lon: 8.6821    },
  { id: 'asia',    label: 'Asia',    location: 'Singapore',          host: 'rh-asia.plutoniumnet.work',    flagSrc: 'img/flags/sg.png', lat: 1.3521,  lon: 103.8198  },
]
const RH_SERVER_KEY = 'plu_rh_server'

const resolvedRelayUrlCache = new Map()

async function resolveRelayUrl(serverId) {
  if (RELAY_QUERY_OVERRIDE) return RELAY_QUERY_OVERRIDE
  if (!RELAY_DISCOVERY_BASE) return null
  if (resolvedRelayUrlCache.has(serverId)) return resolvedRelayUrlCache.get(serverId)

  try {
    const res = await fetch(`${RELAY_DISCOVERY_BASE}/${serverId}/`, { signal: AbortSignal.timeout(4000) })
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

async function getClosestRelayServer(servers = getPickerServers()) {
  try {
    const res = await fetch('https://ipapi.co/json/', { signal: AbortSignal.timeout(3000) })
    const data = await res.json()
    const { latitude, longitude } = data
    if (!latitude || !longitude) return null
    if (!servers.length) return null
    return servers
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
let currentCompaxyServerId = loadCompaxyServerId()
let currentRhServerId = loadRhServerId()
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
function _relaySwitcherLatency() { return document.getElementById('relay-switcher-latency') }
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

// The row under the engine switch picks the wisp relay for the UV/Scramjet V1
// engines and the host for the host-proxy engines. Everything the picker draws
// goes through these, so the two choices stay independent: the wisp helpers
// above always mean the wisp relay.
function loadCompaxyServerId() {
  const stored = localStorage.getItem(COMPAXY_SERVER_KEY)
  if (stored && COMPAXY_SERVERS.some(server => server.id === stored)) return stored
  const fallback = getDefaultCompaxyServer()
  return fallback ? fallback.id : ''
}

function loadRhServerId() {
  const stored = localStorage.getItem(RH_SERVER_KEY)
  if (stored && RH_SERVERS.some(server => server.id === stored)) return stored
  const fallback = getDefaultRhServer()
  return fallback ? fallback.id : ''
}

// The row the app falls back to within a source: `preferred` when the source
// marks one, otherwise the first row (the wisp relay's documented fallback).
function getPreferredPickerServer(servers = getPickerServers()) {
  return servers.find(server => server.preferred) || servers[0] || null
}

function getDefaultCompaxyServer() { return getPreferredPickerServer(COMPAXY_SERVERS) }
function getDefaultRhServer() { return getPreferredPickerServer(RH_SERVERS) }

function isCompaxyEngine() { return selectedNet === 'compaxy' }
function isRhEngine() { return selectedNet === 'rh' }
// Scramjet V2 keeps the wisp relay but not the BareMux bridge: its own
// controller reaches the relay through libcurl, so the transport is built in
// js/runtimev2.js instead of by initBridge().
function isRuntimeV2Engine() { return selectedNet === 'runtimev2' }
// Compaxy and RH serve a proxy page from their own hosts, so neither needs a
// local service worker, wisp relay or BareMux bridge: only the frame URL
// changes between them and the wisp engines.
function isHostProxyEngine() { return isCompaxyEngine() || isRhEngine() }

function getPickerServers() {
  if (isCompaxyEngine()) return COMPAXY_SERVERS
  if (isRhEngine()) return RH_SERVERS
  return RELAY_SERVERS
}

function getPickerServerById(id) {
  return getPickerServers().find(server => server.id === id) || null
}

function getPickerServerId() {
  if (isCompaxyEngine()) return currentCompaxyServerId
  if (isRhEngine()) return currentRhServerId
  return currentRelayServerId
}

function getPickerServer() {
  return getPickerServerById(getPickerServerId()) || getPickerServers()[0] || null
}

function getPickerNoun() { return isHostProxyEngine() ? 'server' : 'relay' }

function setPickerServerId(id) {
  if (isCompaxyEngine()) {
    currentCompaxyServerId = id
    localStorage.setItem(COMPAXY_SERVER_KEY, id)
    return
  }
  if (isRhEngine()) {
    currentRhServerId = id
    localStorage.setItem(RH_SERVER_KEY, id)
    return
  }
  currentRelayServerId = id
  localStorage.setItem('plu_relay_server', id)
}

// Ping results are keyed per source: the lists use ids like `europe`, so a
// shared namespace would let a wisp reading masquerade as a host one.
function pickerPingKey(id) { return (isCompaxyEngine() ? 'compaxy:' : isRhEngine() ? 'rh:' : 'wisp:') + id }
function wispPingKey(id) { return 'wisp:' + id }

// Compaxy takes the target as a ?url= query on its host root, then redirects
// into its own /proxy/ path.
function getCompaxyRouteUrl() {
  const server = getPickerServerById(currentCompaxyServerId) || getDefaultCompaxyServer()
  return server ? `https://${server.host}/?url=` : ''
}

// Any compaxy host decodes, not just the selected one: a frame loaded before a
// region switch is still a valid ?url= wrapper.
function isCompaxyFrameUrl(raw) {
  try {
    const absolute = new URL(raw, window.location.origin)
    return COMPAXY_SERVERS.some(server => server.host === absolute.hostname) && absolute.searchParams.has('url')
  } catch (e) {
    return false
  }
}

// RH takes the target as a ?url= query on its host root, then redirects
// into /<session>/<target>. The entry form is what this builds; both forms are
// recognised so a frame that has already redirected still decodes.
function getRhRouteUrl() {
  const server = getPickerServerById(currentRhServerId) || getDefaultRhServer()
  return server ? `https://${server.host}/?url=` : ''
}

// Any RH host decodes, not just the selected one. Accept the entry
// `?url=` form as well as the post-redirect `/<32-hex-session>/<target>` form.
function isRhFrameUrl(raw) {
  try {
    const absolute = new URL(raw, window.location.origin)
    if (!RH_SERVERS.some(server => server.host === absolute.hostname)) return false
    return absolute.searchParams.has('url') || /^\/[0-9a-f]{32}\//i.test(absolute.pathname)
  } catch (e) {
    return false
  }
}

function formatRelayLatency(latencyMs) {
  return Number.isFinite(latencyMs) ? `${Math.round(latencyMs)} ms` : 'pending'
}

const RELAY_TIER_THRESHOLDS = [
  { max: 80,        level: 0, label: 'Excellent', cls: 'tier-0' },
  { max: 180,       level: 1, label: 'Good',      cls: 'tier-1' },
  { max: 350,       level: 2, label: 'Fair',      cls: 'tier-2' },
  { max: Infinity,  level: 3, label: 'Poor',      cls: 'tier-3' },
]
const RELAY_HISTORY_MAX = 30
const relayLatencyHistory = []

function relayLatencyTier(latencyMs) {
  if (!Number.isFinite(latencyMs)) return { level: -1, label: 'Unknown', cls: '' }
  return RELAY_TIER_THRESHOLDS.find(t => latencyMs <= t.max) || RELAY_TIER_THRESHOLDS[RELAY_TIER_THRESHOLDS.length - 1]
}

function recordRelayLatency(latencyMs) {
  if (!Number.isFinite(latencyMs)) return
  relayLatencyHistory.push({ ms: latencyMs, t: Date.now() })
  if (relayLatencyHistory.length > RELAY_HISTORY_MAX) relayLatencyHistory.shift()
}

function relaySparklinePath(width = 96, height = 22) {
  if (relayLatencyHistory.length < 2) return ''
  const SCALE_MAX = 400
  const pad = 2
  const usableH = height - pad * 2
  const step = width / (relayLatencyHistory.length - 1)
  return relayLatencyHistory.map((s, i) => {
    const x = i * step
    const ms = Math.min(s.ms, SCALE_MAX)
    const y = pad + usableH - (ms / SCALE_MAX) * usableH
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')
}

function relaySignalBars(level) {
  const filled = level < 0 ? 0 : Math.max(1, 4 - level)
  const heights = [0.28, 0.48, 0.72, 1]
  const cls = level >= 0 ? ['tier-0', 'tier-1', 'tier-2', 'tier-3'][level] : ''
  let out = `<span class="relay-bars${cls ? ' ' + cls : ''}" aria-hidden="true">`
  for (let i = 1; i <= 4; i++) {
    out += `<span class="relay-bar${i <= filled ? ' on' : ''}" style="height:${Math.round(heights[i - 1] * 100)}%"></span>`
  }
  return out + '</span>'
}

function setRelayStatus(state, details = {}) {
  const bar = _relayBar()
  const label = _relayLabel()
  const server = details.server || getPickerServer()
  const serverLabel = details.serverLabel || (server ? server.label : 'server')
  const latency = details.latency ?? currentRelayLatencyMs

  currentRelayStatus = state
  if (state === 'ok' && Number.isFinite(latency)) recordRelayLatency(latency)
  updateRelaySwitcherButton()
  refreshConnectionHud()
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
  const latencyEl = _relaySwitcherLatency()
  const server = getPickerServer()
  if (!button || !currentLabel || !currentIcon || !server) return

  currentLabel.textContent = server.label
  currentIcon.className = 'relay-switcher-icon relay-flag'
  currentIcon.style.backgroundImage = server.flagSrc ? `url('${server.flagSrc}')` : ''

  const stateClass = currentRelayStatus === 'ok' ? 'relay-ok'
    : currentRelayStatus === 'err' ? 'relay-err'
    : currentRelayStatus === 'disconnecting' ? 'relay-disconnecting'
    : 'relay-connecting'
  button.classList.remove('relay-ok', 'relay-err', 'relay-connecting', 'relay-disconnecting')
  button.classList.add(stateClass)

  const tier = relayLatencyTier(currentRelayLatencyMs)
  button.classList.remove('tier-0', 'tier-1', 'tier-2', 'tier-3')
  if (currentRelayStatus === 'ok' && Number.isFinite(currentRelayLatencyMs)) button.classList.add(tier.cls)

  if (latencyEl) {
    latencyEl.textContent = currentRelayStatus === 'ok' && Number.isFinite(currentRelayLatencyMs)
      ? `${Math.round(currentRelayLatencyMs)}ms`
      : ''
  }

  const stateWords = currentRelayStatus === 'ok'
    ? `Connected${Number.isFinite(currentRelayLatencyMs) ? ` (${formatRelayLatency(currentRelayLatencyMs)})` : ''}`
    : currentRelayStatus === 'err' ? 'Connection error'
    : currentRelayStatus === 'disconnecting' ? 'Disconnecting'
    : 'Connecting'
  button.setAttribute('aria-label', `Choose ${getPickerNoun()}: ${server.label}, ${stateWords}`)
  button.title = `${isHostProxyEngine() ? 'Server' : 'Relay'}: ${server.label}, ${stateWords}`
}

function renderRelaySwitcherMenu() {
  const list = _relaySwitcherList()
  if (!list) return

  const servers = getPickerServers()

  list.innerHTML = servers.map(server => {
    const ping = relayPingByServerId.get(pickerPingKey(server.id))
    const pingLabel = ping && ping.ok ? formatRelayLatency(ping.latency) : ping && !ping.ok ? 'offline' : 'measuring'
    const activeClass = server.id === getPickerServerId() ? ' is-active' : ''

    return `
      <button class="relay-switcher-item${activeClass}" type="button" data-relay-server-id="${server.id}">
        <span class="relay-switcher-item-main">
          <span class="relay-switcher-item-icon relay-flag" aria-hidden="true" style="background-image:url('${server.flagSrc || ''}')"></span>
          <span class="relay-switcher-item-copy">
            <span class="relay-switcher-item-name">${server.label}</span>
            <span class="relay-switcher-item-location">${server.location || ''}</span>
          </span>
        </span>
        <span class="relay-switcher-ping">${pingLabel}</span>
      </button>
    `
  }).join('')

  list.querySelectorAll('[data-relay-server-id]').forEach(item => {
    item.addEventListener('click', async event => {
      event.stopPropagation()
      const serverId = item.getAttribute('data-relay-server-id')
      await switchRelayServer(serverId)
    })
  })
}

function setRelayMenuOpen(open) {
  const shell = _relaySwitcherButton()
  const menu = _relaySwitcherMenu()
  if (!shell || !menu) return
  shell.setAttribute('aria-expanded', open ? 'true' : 'false')
  relayMenuState = open ? 'open' : 'closed'
  setRelayScrim(open)

  window.clearTimeout(relayMenuTimer)
  relayMenuTimer = null

  if (window.SoundFX) window.SoundFX.play(open ? 'relayOpen' : 'relayClose')

  if (open) {
    renderRelaySwitcherMenu()
    menu.hidden = false
    void menu.offsetHeight
    menu.classList.add('is-open')
  } else {
    menu.classList.remove('is-open')
    relayMenuTimer = window.setTimeout(() => {
      menu.hidden = true
    }, 260)
  }
}

function setRelayScrim(open) {
  const scrim = document.getElementById('relay-switcher-scrim')
  if (scrim) scrim.classList.toggle('is-open', !!open)
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
  return RELAY_URL_TEMPLATE.replace('{id}', id)
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

// Compaxy answers with a proxy page rather than an API, and exposes no
// CORS-readable health route, so an opaque no-cors request is the probe: it
// resolving proves the region answered, which is all the picker needs.
async function measureCompaxyServer(server, options = {}) {
  const timeoutMs = options.timeoutMs || RELAY_PING_TIMEOUT_MS
  if (!server) return { ok: false, latency: null, server }

  const startedAt = performance.now()
  try {
    await fetch(`https://${server.host}/`, {
      mode: 'no-cors',
      cache: 'no-store',
      signal: AbortSignal.timeout(timeoutMs),
    })
    return { ok: true, latency: Math.max(1, Math.round(performance.now() - startedAt)), server }
  } catch (e) {
    return { ok: false, latency: null, server }
  }
}

// RH's root answers with a page rather than a JSON health API and
// exposes no CORS-readable route, so an opaque no-cors request is the probe: it
// resolving proves the region answered, which is all the picker needs.
async function measureRhServer(server, options = {}) {
  const timeoutMs = options.timeoutMs || RELAY_PING_TIMEOUT_MS
  if (!server) return { ok: false, latency: null, server }

  const startedAt = performance.now()
  try {
    await fetch(`https://${server.host}/`, {
      mode: 'no-cors',
      cache: 'no-store',
      signal: AbortSignal.timeout(timeoutMs),
    })
    return { ok: true, latency: Math.max(1, Math.round(performance.now() - startedAt)), server }
  } catch (e) {
    return { ok: false, latency: null, server }
  }
}

function measurePickerServer(server, options) {
  if (isCompaxyEngine()) return measureCompaxyServer(server, options)
  if (isRhEngine()) return measureRhServer(server, options)
  return measureRelayServer(server, options)
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
    relayPingByServerId.set(wispPingKey(server.id), { ok: true, latency: result.latency })
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
  const servers = getPickerServers()
  if (!servers.length) return null

  const results = await Promise.all(servers.map(server => measurePickerServer(server)))
  results.forEach(result => {
    if (!result.server) return
    relayPingByServerId.set(pickerPingKey(result.server.id), {
      ok: result.ok,
      latency: result.latency,
    })
  })

  const best = results
    .filter(result => result.ok && Number.isFinite(result.latency))
    .sort((a, b) => a.latency - b.latency)[0] || null

  // The HUD badge marks the row the picker itself would land on. A source with
  // a preferred row keeps it there rather than on whichever host answered
  // fastest, because that source is never chosen by a ping race.
  const preferred = getPreferredPickerServer(servers)
  bestRelayServerId = preferred && preferred.preferred
    ? preferred.id
    : (best ? best.server.id : '')
  renderRelaySwitcherMenu()
  return best
}

async function refreshRelayPingSnapshot() {
  if (relayPingInFlight) return null
  relayPingInFlight = true

  try {
    const best = await pingConfiguredRelayServers()
    const currentPing = relayPingByServerId.get(pickerPingKey(getPickerServerId()))

    if (currentPing && currentPing.ok && Number.isFinite(currentPing.latency)) {
      currentRelayLatencyMs = currentPing.latency
      if (currentRelayStatus === 'ok') {
        setRelayStatus('ok', {
          server: getPickerServer(),
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

// Picks the server for whichever source the row is showing: the saved choice
// first, then the source's preferred row, then the nearest by IP, then the
// fastest responder.
async function chooseBestPickerServer() {
  const servers = getPickerServers()
  if (!servers.length) return null

  const savedServer = isCompaxyEngine()
    ? localStorage.getItem(COMPAXY_SERVER_KEY)
    : isRhEngine()
      ? localStorage.getItem(RH_SERVER_KEY)
      : (localStorage.getItem('plu_relay_server') || localStorage.getItem('plu_wisp_server'))
  if (savedServer && getPickerServerById(savedServer)) {
    setPickerServerId(savedServer)
    currentRelayLatencyMs = null
    updateRelaySwitcherButton()
    renderRelaySwitcherMenu()
    return getPickerServerById(savedServer)
  }

  // A source that marks a preferred row is settled here, before any network
  // work: neither the IP lookup nor a ping race could improve on it, and either
  // could quietly pick a regional host instead. Nothing is measured here; the
  // probe that follows fills in the latency shown next to the row.
  const preferred = getPreferredPickerServer(servers)
  if (preferred && preferred.preferred) {
    setPickerServerId(preferred.id)
    bestRelayServerId = preferred.id
    currentRelayLatencyMs = null
    updateRelaySwitcherButton()
    renderRelaySwitcherMenu()
    return preferred
  }

  const geo = RELAY_QUERY_OVERRIDE ? null : await getClosestRelayServer(servers)
  if (geo) {
    setPickerServerId(geo.id)
    bestRelayServerId = geo.id
    currentRelayLatencyMs = null
    updateRelaySwitcherButton()
    renderRelaySwitcherMenu()
    return geo
  }

  const best = await refreshRelayPingSnapshot()
  if (best && best.server) {
    setPickerServerId(best.server.id)
    currentRelayLatencyMs = best.latency
  } else {
    const fallback = getPreferredPickerServer(servers)
    setPickerServerId(fallback ? fallback.id : '')
    currentRelayLatencyMs = null
  }

  updateRelaySwitcherButton()
  renderRelaySwitcherMenu()
  return getPickerServer()
}

function currentNetAddress() {
  const input = document.getElementById('url-input')
  const value = typeof currentAddressValue === 'function'
    ? currentAddressValue()
    : ((input && input.value) || '').trim() || 'newtab'

  if (!value || value === 'newtab' || /^(?:plu|pluto):\/\//i.test(value)) return ''
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
  const pickerServer = getPickerServer()
  if (statusText) statusText.textContent = `Switching server to ${pickerServer ? pickerServer.label : 'server'}...`
}

async function switchRelayServer(serverId) {
  const targetServer = getPickerServerById(serverId)
  if (!targetServer) return false

  const sameServer = targetServer.id === getPickerServerId()
  const pageUrl = currentNetAddress()

  hideRelaySwitcherMenu()

  // runtimev2 picks a wisp relay like the v1 engines, but swaps the transport
  // on the live controller instead of tearing down a bridge it never built.
  if (isRuntimeV2Engine()) {
    setPickerServerId(targetServer.id)
    currentRelayLatencyMs = relayPingByServerId.get(pickerPingKey(targetServer.id))?.latency ?? null
    updateRelaySwitcherButton()
    renderRelaySwitcherMenu()
    refreshConnectionHud()
    if (sameServer) return true

    const probed = await measurePickerServer(targetServer)
    relayPingByServerId.set(pickerPingKey(targetServer.id), { ok: probed.ok, latency: probed.latency })
    currentRelayLatencyMs = probed.latency
    setRelayStatus(probed.ok ? 'ok' : 'err', { server: targetServer, latency: probed.latency })

    if (window.PluRuntimeV2) {
      const relayUrl = await getRelayUrl(targetServer.id)
      window.PluRuntimeV2.setRelay(relayUrl)
    }
    if (pageUrl) reconnectActivePage(pageUrl)
    return probed.ok
  }

  // A Compaxy or RH server is picked, not connected: the frame just points at
  // the other host, so there is no socket, bridge or transport to tear down.
  if (isHostProxyEngine()) {
    setPickerServerId(targetServer.id)
    currentRelayLatencyMs = relayPingByServerId.get(pickerPingKey(targetServer.id))?.latency ?? null
    updateRelaySwitcherButton()
    renderRelaySwitcherMenu()
    refreshConnectionHud()
    if (sameServer) return true

    const probed = await measurePickerServer(targetServer)
    relayPingByServerId.set(pickerPingKey(targetServer.id), { ok: probed.ok, latency: probed.latency })
    currentRelayLatencyMs = probed.latency
    setRelayStatus(probed.ok ? 'ok' : 'err', { server: targetServer, latency: probed.latency })
    if (pageUrl) reconnectActivePage(pageUrl)
    return probed.ok
  }

  setPickerServerId(targetServer.id)
  currentRelayLatencyMs = relayPingByServerId.get(wispPingKey(targetServer.id))?.latency ?? null
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
  if (ready && pageUrl && getNetEngine() !== 'remote') reconnectActivePage(pageUrl)
  return ready
}

// Changing engine changes which list the row shows, so re-point it and re-probe.
// The probe is what refreshes the status: the background loop only keeps a
// status that is already `ok`, so a stale error from the other source would
// otherwise stick forever.
let lastPickerSource = ''

function refreshPickerForEngine() {
  const source = isCompaxyEngine() ? 'compaxy' : isRhEngine() ? 'rh' : 'wisp'
  if (isCompaxyEngine() && !getPickerServerById(currentCompaxyServerId)) {
    const fallback = getDefaultCompaxyServer()
    currentCompaxyServerId = fallback ? fallback.id : ''
  }
  if (isRhEngine() && !getPickerServerById(currentRhServerId)) {
    const fallback = getDefaultRhServer()
    currentRhServerId = fallback ? fallback.id : ''
  }

  const cached = relayPingByServerId.get(pickerPingKey(getPickerServerId()))
  currentRelayLatencyMs = cached && Number.isFinite(cached.latency) ? cached.latency : null
  updateRelaySwitcherButton()
  renderRelaySwitcherMenu()
  refreshConnectionHud()

  // Switching UV <-> Scramjet V1 keeps the same relay, so don't churn its socket.
  if (source === lastPickerSource) return
  lastPickerSource = source
  setRelayStatus('connecting', { server: getPickerServer() })
  probeCurrentPickerServer()
}

async function probeCurrentPickerServer() {
  const server = getPickerServer()
  if (!server) return

  const result = await measurePickerServer(server)
  relayPingByServerId.set(pickerPingKey(server.id), { ok: result.ok, latency: result.latency })
  if (getPickerServerId() !== server.id) return

  currentRelayLatencyMs = result.latency
  setRelayStatus(result.ok ? 'ok' : 'err', { server, latency: result.latency })
  updateRelaySwitcherButton()
  renderRelaySwitcherMenu()
}

const NET_MODE_KEY = 'plu_net_mode'
const LEGACY_NET_MODE_KEY = 'plu_proxy_engine'
const LEGACY_NET_MODE_MAP = { uv: 'core', sj: 'runtime', hb: 'remote' }
// Hyperbeam sessions are opened and torn down on this worker, which is the only
// part of the remote engine the app talks to directly.
const REMOTE_WORKER_URL    = 'https://api.plutoniumnet.work/net'

// Only ids the switch actually offers are accepted, so a value left behind by a
// retired or renamed engine falls back to the default instead of a dead state.
const NET_MODE_IDS = ['core', 'runtime', 'runtimev2', 'remote', 'compaxy', 'rh']

function loadNetMode() {
  const stored = localStorage.getItem(NET_MODE_KEY)
  if (stored && NET_MODE_IDS.includes(stored)) return stored
  const legacy = localStorage.getItem(LEGACY_NET_MODE_KEY)
  if (legacy) {
    const mapped = LEGACY_NET_MODE_MAP[legacy] || legacy
    if (NET_MODE_IDS.includes(mapped)) return mapped
  }
  return 'core'
}

let selectedNet  = loadNetMode()
let runtimeReady        = false
let runtimeController   = null
let currentRemoteSessionId = null
let currentRemoteTargetUrl = null

function getNetEngine() { return selectedNet }

function setNetEngine(engine) {
  if (!NET_MODE_IDS.includes(engine)) return
  const previous = selectedNet
  selectedNet = engine
  localStorage.setItem(NET_MODE_KEY, engine)
  // Keep a revealed engine on screen once it becomes the active one.
  if (isMoreEngine(engine)) setEnginesOpen(true)
  syncEngineButtons()
  if (window.accountManager && typeof window.accountManager.scheduleSettingsSync === 'function') {
    window.accountManager.scheduleSettingsSync()
  }
  if (engine === 'remote') {
    return
  }
  refreshPickerForEngine()
  if (previous === 'remote' && typeof endRemoteSession === 'function') endRemoteSession()
  const pageUrl = currentNetAddress()
  if (pageUrl) reconnectActivePage(pageUrl)
}

function syncEngineButtons() {
  const btns = document.querySelectorAll('.engine-btn')
  const switchEl = document.querySelector('.engine-switch')
  const slider = document.getElementById('engine-slider')

  btns.forEach(btn => {
    const isActive = btn.dataset.engine === selectedNet
    btn.classList.toggle('active', isActive)
  })

  if (!slider || !switchEl) return
  const activeBtn = switchEl.querySelector('.engine-btn.active')
  const open = switchEl.classList.contains('engines-open')
  // A collapsed pill hides the secondary group; if one of those is the active
  // engine there is no visible button to sit under, so park the slider.
  if (!activeBtn || (activeBtn.closest('.engine-more') && !open)) {
    slider.style.opacity = '0'
    return
  }
  positionSlider(slider, switchEl, activeBtn)
}

// Hyperbeam, Compaxy and the deprecated Scramjet V1 live in the pill's reveal
// group. Asking the DOM which group an engine sits in avoids a
// second hardcoded list that could drift from the markup.
function isMoreEngine(engine) {
  const btn = document.querySelector(`.engine-btn[data-engine="${engine}"]`)
  return !!(btn && btn.closest('.engine-more'))
}

function setEnginesOpen(open) {
  const switchEl = document.querySelector('.engine-switch')
  if (!switchEl) return
  switchEl.classList.toggle('engines-open', !!open)
  const toggle = document.getElementById('engine-expand')
  if (toggle) {
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false')
    toggle.setAttribute('aria-label', open ? 'Hide extra browsing engines' : 'Show extra browsing engines')
    toggle.title = open ? 'Hide extra engines' : 'Show extra engines'
  }
  syncEngineButtons()
}

function toggleEnginesOpen() {
  const switchEl = document.querySelector('.engine-switch')
  setEnginesOpen(!(switchEl && switchEl.classList.contains('engines-open')))
}

function positionSlider(slider, switchEl, activeBtn) {
  const switchRect = switchEl.getBoundingClientRect()
  const btnRect = activeBtn.getBoundingClientRect()
  slider.style.opacity = '1'
  slider.style.left = (btnRect.left - switchRect.left) + 'px'
  slider.style.width = btnRect.width + 'px'
}

if (typeof window !== 'undefined' && window.addEventListener) {
  window.addEventListener('resize', () => {
    if (!document.getElementById('engine-slider')) return
    const slider = document.getElementById('engine-slider')
    const switchEl = document.querySelector('.engine-switch')
    const activeBtn = switchEl && switchEl.querySelector('.engine-btn.active')
    if (activeBtn && slider && switchEl) positionSlider(slider, switchEl, activeBtn)
  })
}



window.getNetEngine = getNetEngine
window.setNetEngine = setNetEngine
window.isNetStackReady = isNetStackReady
window.toggleEnginesOpen = toggleEnginesOpen

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

async function initRuntime() {
  if (runtimeReady) return true
  if (typeof $scramjetLoadController === 'undefined') return false
  if (!('serviceWorker' in navigator)) return false

  try {
    await navigator.serviceWorker.register('/sw.js', { scope: '/' })

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

// runtimev2 has no bridge to wait on: readiness is its controller answering,
// which is what navigation waits for before asking for a rewritten URL.
let runtimeV2Ready = false
let runtimeV2Promise = null

async function ensureRuntimeV2() {
  if (runtimeV2Ready) return true
  if (runtimeV2Promise) return runtimeV2Promise

  runtimeV2Promise = (async () => {
    try {
      if (!window.PluRuntimeV2) throw new Error('js/runtimev2.js not loaded')
      // The same relay the wisp engines use; v2 just speaks to it through
      // libcurl rather than through BareMux.
      const relayUrl = await getRelayUrl()
      runtimeV2Ready = await window.PluRuntimeV2.ensure(relayUrl)
      return runtimeV2Ready
    } catch (e) {
      console.warn('[runtimev2] engine init failed:', e)
      runtimeV2Ready = false
      return false
    } finally {
      runtimeV2Promise = null
    }
  })()

  return runtimeV2Promise
}

// One readiness question for the callers in navigation.js: v1 needs its service
// worker and the BareMux bridge, v2 only needs its own controller.
function isNetStackReady() {
  if (isRuntimeV2Engine()) return runtimeV2Ready
  return coreReady && bridgeReady
}

async function initNetStack() {
  // Scramjet V2 brings its own worker and transport and shares nothing with the
  // v1 stack, so it must not drag UV and Scramjet V1 registration along.
  if (isRuntimeV2Engine()) return ensureRuntimeV2()
  await initCore()
  await initRuntime()
  // Compaxy and RH are hosts of their own: they need no BareMux transport and
  // no wisp relay, and skipping the bridge keeps their connection status
  // truthful.
  if (isHostProxyEngine()) return
  await initBridge()
}

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
  if (selectedNet === 'remote') return url
  if (selectedNet === 'runtimev2') {
    return window.PluRuntimeV2 ? window.PluRuntimeV2.encodeUrl(url) : url
  }
  if (selectedNet === 'compaxy') return getCompaxyRouteUrl() + encodeURIComponent(url)
  if (selectedNet === 'rh') return getRhRouteUrl() + encodeURIComponent(url)
  if (selectedNet === 'runtime') {
    if (runtimeReady && runtimeController) return runtimeController.encodeUrl(url)
    return url
  }
  if (!coreReady || typeof __uv$config === 'undefined') return url
  return __uv$config.prefix + __uv$config.encodeUrl(url)
}

function getRealUrlFromNet(maybeNetUrl) {
  if (currentRemoteTargetUrl) return currentRemoteTargetUrl

  if (selectedNet === 'runtimev2') {
    // v2 frames are the only ones whose prefix belongs to one frame object, so
    // the decode goes through the same context that produced the URL.
    return window.PluRuntimeV2 ? window.PluRuntimeV2.decodeUrl(maybeNetUrl) : maybeNetUrl
  }

  if (selectedNet === 'compaxy') {
    // Any compaxy host decodes, not just the selected one, and the target is in
    // the ?url= query Compaxy was handed when the frame was pointed at it.
    if (isCompaxyFrameUrl(maybeNetUrl)) {
      try {
        return new URL(maybeNetUrl, window.location.origin).searchParams.get('url') || maybeNetUrl
      } catch (e) {}
    }
    return maybeNetUrl
  }

  if (selectedNet === 'rh') {
    // Any RH host decodes, not just the selected one. The entry form
    // carries the target in ?url=; after the redirect it lives in the path as
    // /<session>/<target>, so unwrap whichever form the frame is on.
    if (isRhFrameUrl(maybeNetUrl)) {
      try {
        const absolute = new URL(maybeNetUrl, window.location.origin)
        const viaQuery = absolute.searchParams.get('url')
        if (viaQuery) return viaQuery
        const viaPath = absolute.pathname.match(/^\/[0-9a-f]{32}\/(.+)$/i)
        if (viaPath) return decodeURIComponent(viaPath[1]) + absolute.search + absolute.hash
      } catch (e) {}
    }
    return maybeNetUrl
  }

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
  const server = getPickerServer()
  return {
    id: server ? server.id : '',
    label: server ? server.label : 'Unknown',
    latency: currentRelayLatencyMs,
    latencyText: formatRelayLatency(currentRelayLatencyMs),
    status: currentRelayStatus,
  }
}

window.getRelayConnectionSummary = getRelayConnectionSummary

function openNetInfoPopup() {
  const overlay = document.getElementById('net-info-overlay')
  if (!overlay) return
  renderConnectionHud()
  overlay.hidden = false
}

function currentEngineLabel() {
  return selectedNet === 'runtimev2' ? 'Scramjet V2'
    : selectedNet === 'runtime' ? 'Scramjet V1'
    : selectedNet === 'remote' ? 'Hyperbeam'
    : selectedNet === 'compaxy' ? 'Compaxy'
    : selectedNet === 'rh' ? 'RH'
    : 'UV'
}

function renderConnectionHud() {
  const currentEl = document.getElementById('conn-hud-current')
  const regionsEl = document.getElementById('conn-hud-regions')
  if (!currentEl || !regionsEl) return

  const server = getPickerServer()
  const tier = relayLatencyTier(currentRelayLatencyMs)
  const stateLabel = currentRelayStatus === 'ok' ? `Connected · ${formatRelayLatency(currentRelayLatencyMs)}`
    : currentRelayStatus === 'err' ? "Couldn't connect"
    : currentRelayStatus === 'disconnecting' ? 'Disconnecting'
    : 'Connecting'
  const stateCls = currentRelayStatus === 'ok' ? 'hud-ok'
    : currentRelayStatus === 'err' ? 'hud-err'
    : 'hud-pending'

  const spark = relayLatencyHistory.length >= 2
    ? `<svg class="conn-hud-spark" viewBox="0 0 96 22" preserveAspectRatio="none"><polyline fill="none" stroke="currentColor" stroke-width="1.5" points="${relaySparklinePath(96, 22)}"/></svg>`
    : ''

  currentEl.innerHTML = `
    <div class="conn-hud-card glass">
      <div class="conn-hud-row">
        <span class="relay-switcher-icon relay-flag" aria-hidden="true" style="background-image:url('${server ? server.flagSrc || '' : ''}')"></span>
        <span class="conn-hud-name">${server ? server.label : 'Unknown'}</span>
        <span class="conn-hud-state ${stateCls}">${stateLabel}</span>
      </div>
      <div class="conn-hud-meta">
        ${server && server.location ? `<span class="conn-hud-loc">${server.location}</span>` : ''}
        <span class="conn-hud-engine">Engine: ${currentEngineLabel()}</span>
        <span class="conn-hud-tier ${tier.cls}">${tier.label} ${relaySignalBars(tier.level)}</span>
      </div>
      ${spark ? `<div class="conn-hud-spark-wrap ${tier.cls}"><span>Latency trend</span>${spark}</div>` : ''}
    </div>`

  const servers = getPickerServers()
  regionsEl.innerHTML = servers.map(s => {
    const ping = relayPingByServerId.get(pickerPingKey(s.id))
    const pingOk = ping && ping.ok
    const pingTier = relayLatencyTier(pingOk ? ping.latency : null)
    const pingLabel = pingOk ? formatRelayLatency(ping.latency) : ping && !ping.ok ? 'offline' : 'measuring'
    const active = s.id === getPickerServerId()
    const badge = s.id === bestRelayServerId ? '<span class="relay-switcher-badge">Best</span>' : ''
    return `
      <button class="conn-hud-region${active ? ' is-active' : ''}" type="button" data-conn-region="${s.id}">
        <span class="relay-switcher-item-icon relay-flag" aria-hidden="true" style="background-image:url('${s.flagSrc || ''}')"></span>
        <span class="conn-hud-region-copy">
          <span class="conn-hud-region-name">${s.label}</span>
          <span class="conn-hud-region-loc">${s.location || ''}</span>
        </span>
        <span class="conn-hud-region-meta">${badge}${relaySignalBars(pingOk ? pingTier.level : -1)}<span class="conn-hud-region-ping">${pingLabel}</span></span>
      </button>`
  }).join('')

  regionsEl.querySelectorAll('[data-conn-region]').forEach(item => {
    item.addEventListener('click', async () => {
      const id = item.getAttribute('data-conn-region')
      if (!id || id === getPickerServerId()) return
      await switchRelayServer(id)
      renderConnectionHud()
    })
  })
}

function refreshConnectionHud() {
  const overlay = document.getElementById('net-info-overlay')
  if (overlay && !overlay.hidden) renderConnectionHud()
}

function closeNetInfoPopup() {
  const overlay = document.getElementById('net-info-overlay')
  if (overlay) overlay.hidden = true
}

async function runNetInit() {
  try {
    await chooseBestPickerServer()
    lastPickerSource = isCompaxyEngine() ? 'compaxy' : isRhEngine() ? 'rh' : 'wisp'
    if (isHostProxyEngine() || isRuntimeV2Engine()) {
      // Nothing to preload: a compaxy host is probed over HTTP, and
      // v2's libcurl opens its own relay connection instead of a BareMux socket.
      updateRelaySwitcherButton()
      renderRelaySwitcherMenu()
      probeCurrentPickerServer()
    } else {
      await preloadRelayConnection()
    }
    await initNetStack()
    startBackgroundRelayPingLoop()
  } catch (_) {}
}

document.addEventListener('DOMContentLoaded', () => {
  // A saved secondary engine (Hyperbeam/Compaxy/Scramjet V1) opens the reveal
  // group on load, so the active engine is always visible.
  setEnginesOpen(isMoreEngine(selectedNet))
  initRelayUi()
  runNetInit()
})
