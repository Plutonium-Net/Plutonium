const pageFrame = document.getElementById('page-frame')
const newTabPage = document.getElementById('new-tab-page')
const pageLoadingScreen = document.getElementById('page-loading-screen')
const pageLoadingUrl = document.getElementById('page-loading-url')
const statusText = document.getElementById('status-text')
const btnBack = document.getElementById('btn-back')
const btnForward = document.getElementById('btn-forward')
const btnRefresh = document.getElementById('btn-refresh')
const btnHome = document.getElementById('btn-home')
const btnAbout = document.getElementById('btn-about')
const btnUserPage = document.getElementById('btn-user-page')

const tabHistory = new WeakMap()
let urlSyncIntervalId = null
let lastSyncedFrameUrl = ''

function getActiveTab() { return chromeTabs.activeTabEl }
function openNewTab(options) { chromeTabs.addTab({ title: 'New Tab', favicon: false }, options) }
function isBlankFrameSrc(src) { return !!src && /^about:blank(?:[#?].*)?$/i.test(src) }

function ensureTabHistory(tabEl) {
  if (!tabEl) return null
  if (!tabHistory.has(tabEl)) tabHistory.set(tabEl, { entries: ['newtab'], index: 0 })
  return tabHistory.get(tabEl)
}

function syncNavButtons(tabEl = getActiveTab()) {
  const state = ensureTabHistory(tabEl)
  if (!state || state.entries[state.index] === 'newtab') {
    btnBack.disabled = true
    btnForward.disabled = true
    return
  }
  btnBack.disabled = state.index <= 0
  btnForward.disabled = state.index >= state.entries.length - 1
}

function pushTabHistory(tabEl, url) {
  const state = ensureTabHistory(tabEl)
  if (!state || !url || url === 'newtab') return
  const current = state.entries[state.index]
  if (current === url) return
  state.entries = state.entries.slice(0, state.index + 1)
  state.entries.push(url)
  state.index = state.entries.length - 1
}

function showLoadingScreen(url) {
  if (!pageLoadingScreen) return
  let display = url
  try { display = new URL(url).hostname.replace(/^www\./, '') } catch {}
  pageLoadingUrl.textContent = display
  newTabPage.style.display = 'none'
  pageFrame.style.display = 'none'
  pageLoadingScreen.style.display = 'flex'
}

function hideLoadingScreen() {
  if (pageLoadingScreen) pageLoadingScreen.style.display = 'none'
}

function unloadPageFrame() {
  try {
    if (pageFrame.contentWindow && typeof pageFrame.contentWindow.stop === 'function') {
      pageFrame.contentWindow.stop()
    }
  } catch (e) {}

  lastSyncedFrameUrl = ''
  statusText.textContent = ''
  pageFrame.style.display = 'none'
  pageFrame.src = 'about:blank'
}

function syncFromFrameLocation() {
  if (pageFrame.style.display === 'none') return
  let currentUrl = ''
  try {
    currentUrl = pageFrame.contentWindow.location.href || ''
  } catch (e) {
    currentUrl = pageFrame.src || ''
  }
  currentUrl = getRealUrlFromProxy(currentUrl)
  currentUrl = getDisplayUrl(currentUrl)
  if (!currentUrl || currentUrl === lastSyncedFrameUrl) return
  lastSyncedFrameUrl = currentUrl
  urlInput.value = currentUrl
  const tab = getActiveTab()
  if (!tab) return
  tab.dataset.url = currentUrl
  pushTabHistory(tab, currentUrl)
  let hostname = currentUrl
  try { hostname = new URL(currentUrl).hostname } catch (e) {}
  const fallbackTitle = hostname.replace(/^www\./, '')
  if (fallbackTitle) {
    tab.querySelector('.chrome-tab-title').textContent = fallbackTitle
    tab.dataset.title = fallbackTitle
  }
  setAddressIndicator(currentUrl)
  syncNavButtons(tab)
  updateBookmarkStar(currentUrl)
  if (Bookmarks.isBookmarked(currentUrl)) Bookmarks.refreshFavicon(currentUrl)
}

function startUrlSyncLoop() {
  if (urlSyncIntervalId) return
  urlSyncIntervalId = window.setInterval(syncFromFrameLocation, 350)
}

async function openHistoryEntry(tabEl, index) {
  const state = ensureTabHistory(tabEl)
  if (!state) return
  if (typeof terminateHbSession === 'function') terminateHbSession()
  if (index < 0 || index >= state.entries.length) return
  state.index = index
  const url = state.entries[state.index]
  if (!url || url === 'newtab') { showNewTabPage(); return }
  const local = resolvePluUrl(url)
  if (local) {
    pageFrame.style.display = 'none'
    newTabPage.style.display = 'none'
    hideLoadingScreen()
    pageFrame.src = local.target
    urlInput.value = local.display
    setAddressIndicator(local.display)
    syncNavButtons(tabEl)
    updateBookmarkStar(local.display)
    setBookmarksBarVisible(false)
    return
  }
  if (!uvReady || !baremuxReady) await initProxyStack()
  pageFrame.style.display = 'none'
  newTabPage.style.display = 'none'
  showLoadingScreen(url)
  pageFrame.src = getProxyUrl(url)
  urlInput.value = url
  setAddressIndicator(url)
  syncNavButtons(tabEl)
  updateBookmarkStar(url)
  setBookmarksBarVisible(false)
}

function showNewTabPage() {
  if (typeof terminateHbSession === 'function') terminateHbSession()
  unloadPageFrame()
  newTabPage.style.display = 'flex'
  hideLoadingScreen()
  urlInput.value = ''
  setAddressIndicator('newtab')
  hideConnectionPopup()
  syncNavButtons()
  updateBookmarkStar('newtab')
  setBookmarksBarVisible(true)
  renderBookmarksBar()
}

async function navigate(url) {
  if (!uvReady || !baremuxReady) await initProxyStack()
  let full = url.trim()
  if (!full) return

  // Hyperbeam engine — proxy the target via a worker-hosted kiosk session
  if (typeof getProxyEngine === 'function' && getProxyEngine() === 'hb') {
    if (typeof launchHbProxy === 'function') {
      await launchHbProxy(full)
      const hbTab = getActiveTab()
      if (hbTab) {
        hbTab.querySelector('.chrome-tab-title').textContent = full.replace(/^https?:\/\//i, '').replace(/\/$/, '') || 'Hyperbeam'
        hbTab.querySelector('.chrome-tab-favicon')?.setAttribute('hidden', '')
        hbTab.dataset.url = full
        hbTab.dataset.title = full
        pushTabHistory(hbTab, full)
        syncNavButtons(hbTab)
        updateBookmarkStar(full)
        setBookmarksBarVisible(false)
        saveTabsSnapshot()
      }
    }
    return
  }

  await terminateHbSession()

  const local = resolvePluUrl(full)
  if (local) {
    full = local.display
    urlInput.value = full
    newTabPage.style.display = 'none'
    pageFrame.style.display = 'none'
    pageLoadingScreen && (pageLoadingScreen.style.display = 'none')
    pageFrame.src = local.target
    lastSyncedFrameUrl = full
    startUrlSyncLoop()
    setAddressIndicator(full)
    const localTab = getActiveTab()
    if (localTab) {
      localTab.querySelector('.chrome-tab-title').textContent = local.key.charAt(0).toUpperCase() + local.key.slice(1)
      localTab.querySelector('.chrome-tab-favicon').setAttribute('hidden', '')
      localTab.dataset.url = full
      localTab.dataset.title = local.key
      pushTabHistory(localTab, full)
    }
    statusText.textContent = ''
    syncNavButtons(localTab)
    updateBookmarkStar(full)
    setBookmarksBarVisible(false)
    saveTabsSnapshot()
    return
  }
  if (!/^https?:\/\//i.test(full) && !full.startsWith('about:')) {
    if (full.includes('.') && !full.includes(' ')) {
      full = 'https://' + full
    } else {
      full = 'https://www.duckduckgo.com/search?q=' + encodeURIComponent(full)
    }
  }
  urlInput.value = full
  newTabPage.style.display = 'none'
  pageFrame.style.display = 'none'
  showLoadingScreen(full)
  pageFrame.src = getProxyUrl(full)
  lastSyncedFrameUrl = full
  startUrlSyncLoop()
  setAddressIndicator(full)
  const tab = getActiveTab()
  if (tab) {
    let hostname = full
    try { hostname = new URL(full).hostname } catch (e) {}
    const title = hostname.replace(/^www\./, '')
    tab.querySelector('.chrome-tab-title').textContent = title
    const faviconEl = tab.querySelector('.chrome-tab-favicon')
    faviconEl.style.backgroundImage = `url('https://www.google.com/s2/favicons?sz=16&domain_url=${encodeURIComponent(full)}')`
    faviconEl.removeAttribute('hidden')
    tab.dataset.url = full
    tab.dataset.title = title
    pushTabHistory(tab, full)
  }
  statusText.textContent = 'Loading ' + full
  syncNavButtons(tab)
  updateBookmarkStar(full)
  setBookmarksBarVisible(false)
  if (Bookmarks.isBookmarked(full)) Bookmarks.refreshFavicon(full)
  saveTabsSnapshot()
}

pageFrame.addEventListener('load', () => {
  const rawFrameSrc = pageFrame.getAttribute('src') || ''
  const activeTab = getActiveTab()
  if (isBlankFrameSrc(rawFrameSrc) || !activeTab || (activeTab.dataset.url || 'newtab') === 'newtab') {
    pageFrame.style.display = 'none'
    hideLoadingScreen()
    statusText.textContent = ''
    return
  }

  statusText.textContent = ''
  hideLoadingScreen()
  const wasHidden = pageFrame.style.display === 'none'
  pageFrame.style.display = 'block'
  if (wasHidden && !pageFrame.src) return
  let currentUrl = pageFrame.src || urlInput.value
  try { currentUrl = pageFrame.contentWindow.location.href || currentUrl } catch (e) {}
  currentUrl = getRealUrlFromProxy(currentUrl)
  currentUrl = getDisplayUrl(currentUrl)
  if (currentUrl) lastSyncedFrameUrl = currentUrl
  if (currentUrl) urlInput.value = currentUrl
  const tab = activeTab
  if (!tab || !currentUrl) return
  tab.dataset.url = currentUrl
  pushTabHistory(tab, currentUrl)
  let hostname = currentUrl
  try { hostname = new URL(currentUrl).hostname } catch (e) {}
  const fallbackTitle = hostname.replace(/^www\./, '')
  try {
    const iframeTitle = pageFrame.contentDocument && pageFrame.contentDocument.title
    const title = (iframeTitle || fallbackTitle || 'New Tab').trim()
    tab.querySelector('.chrome-tab-title').textContent = title
    tab.dataset.title = title
  } catch (e) {
    tab.querySelector('.chrome-tab-title').textContent = fallbackTitle || 'New Tab'
    tab.dataset.title = fallbackTitle || 'New Tab'
  }
  setAddressIndicator(currentUrl)
  syncNavButtons(tab)
  updateBookmarkStar(currentUrl)
  if (Bookmarks.isBookmarked(currentUrl)) Bookmarks.refreshFavicon(currentUrl)
})

btnRefresh.addEventListener('click', () => {
  if (pageFrame.style.display === 'none') return
  try { pageFrame.contentWindow.location.reload() } catch (e) { pageFrame.src = pageFrame.src }
})

btnHome.addEventListener('click', () => {
  showNewTabPage()
  const tab = getActiveTab()
  if (tab) {
    tab.querySelector('.chrome-tab-title').textContent = 'New Tab'
    const homeFaviconEl = tab.querySelector('.chrome-tab-favicon')
    homeFaviconEl.style.backgroundImage = `url('${typeof BrowserThemeState !== 'undefined' && BrowserThemeState.getAccentIconPath ? BrowserThemeState.getAccentIconPath() : 'img/favicon.png'}')`
    homeFaviconEl.removeAttribute('hidden')
    tab.dataset.url = 'newtab'
    tabHistory.set(tab, { entries: ['newtab'], index: 0 })
  }
  syncNavButtons(tab)
})

btnBack.addEventListener('click', async () => {
  const tab = getActiveTab()
  const state = ensureTabHistory(tab)
  if (!state || state.index <= 0) return
  await openHistoryEntry(tab, state.index - 1)
})

btnForward.addEventListener('click', async () => {
  const tab = getActiveTab()
  const state = ensureTabHistory(tab)
  if (!state || state.index >= state.entries.length - 1) return
  await openHistoryEntry(tab, state.index + 1)
})

btnAbout.addEventListener('click', () => { if (typeof openAboutDialog === 'function') openAboutDialog() })
btnUserPage.addEventListener('click', () => { if (typeof openAccountDialog === 'function') openAccountDialog() })

urlInput.addEventListener('keydown', e => { if (e.key === 'Enter') navigate(urlInput.value) })
urlInput.addEventListener('focus', () => urlInput.select())


function saveTabsSnapshot() {
  if (window.accountManager && typeof window.accountManager.scheduleTabSync === 'function') {
    window.accountManager.scheduleTabSync()
  }
}

async function restoreTabs(tabList) {
  if (!Array.isArray(tabList) || !tabList.length) return

  const existing = [...chromeTabs.tabEls]
  existing.forEach(t => t.parentNode.removeChild(t))

  let activeTabEl = null

  for (const tabData of tabList) {
    chromeTabs.addTab({ title: tabData.title || 'New Tab', favicon: false }, { background: true, animate: false })
    const tabEl = chromeTabs.tabEls[chromeTabs.tabEls.length - 1]
    tabEl.dataset.url   = tabData.url   || 'newtab'
    tabEl.dataset.title = tabData.title || 'New Tab'
    ensureTabHistory(tabEl)
    if (tabData.active) activeTabEl = tabEl
  }

  const target = activeTabEl || chromeTabs.tabEls[0]
  if (target) {
    chromeTabs.setCurrentTab(target)
    const url = target.dataset.url || 'newtab'
    if (url === 'newtab') {
      showNewTabPage()
    } else {
      await navigate(url)
    }
  }

  syncNavButtons()
  console.log('[Tabs] Restored', tabList.length, 'tabs from account')
}
