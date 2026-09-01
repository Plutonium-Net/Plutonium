const LOCAL_PAGES = {
  games: 'games',
  media: 'media',
  movies: 'media',
  stream: 'media',
  ai: 'ai',
  vms: 'vms',
  cloud: 'cloud',
}

const LOCAL_PAGE_ALIASES = {
  movies: 'media',
  stream: 'media',
}

const lockIcon = document.getElementById('lock-icon')
const lockIconBtn = document.getElementById('lock-icon-btn')
const connectionPopup = document.getElementById('connection-popup')
const connectionPopupTitle = document.getElementById('connection-popup-title')
const connectionPopupDesc = document.getElementById('connection-popup-desc')
const urlInput = document.getElementById('url-input')

const LOCAL_SCHEME = /^(?:plu|pluto):\/\//i

function resolvePluUrl(input) {
  if (!LOCAL_SCHEME.test(input)) return null
  let rest = input.replace(LOCAL_SCHEME, '').trim().toLowerCase()
  let suffix = ''
  const suffixAt = rest.search(/[?#]/)
  if (suffixAt !== -1) {
    suffix = rest.slice(suffixAt)
    rest = rest.slice(0, suffixAt)
  }
  const canonicalKey = LOCAL_PAGE_ALIASES[rest] || rest
  const target = LOCAL_PAGES[canonicalKey]
  if (!target) return null
  return { key: canonicalKey, target, suffix, display: `pluto://${canonicalKey}${suffix}` }
}

function getDisplayUrl(rawUrl) {
  try {
    const absolute = new URL(rawUrl, window.location.origin)
    const entry = Object.entries(LOCAL_PAGES).find(([, path]) => absolute.pathname === '/' + path)
    if (entry) return `pluto://${entry[0]}${absolute.search}${absolute.hash}`
  } catch (e) {}
  return rawUrl
}

function currentAddressValue() {
  const value = (urlInput.value || '').trim() || 'newtab'
  // The countdown text in the address bar isn't a real address.
  if (value.startsWith('Initializing net')) return 'newtab'
  return value
}

function setAddressIndicator(url) {
  if (url === 'newtab') { lockIcon.className = 'fa-solid fa-circle-info lock-icon'; return }
  if (LOCAL_SCHEME.test(url)) { lockIcon.className = 'fa-solid fa-hard-drive lock-icon secure'; return }
  if (url.startsWith('https://')) { lockIcon.className = 'fa-solid fa-shield-halved lock-icon secure'; return }
  lockIcon.className = 'fa-solid fa-triangle-exclamation lock-icon'
}

function getConnectionDetails(url) {
  if (url === 'newtab') return { title: 'New Tab', desc: 'This is a local new-tab screen. No website connection is active.' }
  if (LOCAL_SCHEME.test(url)) return { title: 'Local System Page', desc: 'This page is loaded from local files and is not proxied.' }
  if (url.startsWith('https://')) {
    const relay = typeof getRelayConnectionSummary === 'function' ? getRelayConnectionSummary() : null
    const routeDetails = relay ? ` Traffic is currently routed through ${relay.label}${Number.isFinite(relay.latency) ? ` (${relay.latencyText})` : ''}.` : ''
    return { title: 'Secure HTTPS', desc: `Your connection uses HTTPS encryption.${routeDetails}` }
  }
  return { title: 'Not Fully Secure', desc: 'This page is not using HTTPS encryption. Avoid entering sensitive information.' }
}

function hideConnectionPopup() { connectionPopup.hidden = true }

function showConnectionPopup() {
  const details = getConnectionDetails(currentAddressValue())
  connectionPopupTitle.textContent = details.title
  connectionPopupDesc.textContent = details.desc
  connectionPopup.hidden = false
}

function toggleConnectionPopup() {
  if (connectionPopup.hidden) showConnectionPopup()
  else hideConnectionPopup()
}

lockIconBtn.addEventListener('click', event => {
  event.stopPropagation()
  toggleConnectionPopup()
})

document.addEventListener('click', event => {
  if (connectionPopup.hidden) return
  if (connectionPopup.contains(event.target) || lockIconBtn.contains(event.target)) return
  hideConnectionPopup()
})
