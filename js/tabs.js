tabsEl.addEventListener('activeTabChange', async ({ detail }) => {
  const tab = detail.tabEl
  const url = tab.dataset.url || 'newtab'
  if (url === 'newtab') {
    showNewTabPage()
  } else {
    const state = ensureTabHistory(tab)
    if (!state.entries.length) { state.entries = [url]; state.index = 0 }
    await openHistoryEntry(tab, state.index)
    startUrlSyncLoop()
  }
  syncNavButtons(tab)
  saveTabsSnapshot()
})

tabsEl.addEventListener('tabAdd', ({ detail }) => {
  detail.tabEl.dataset.url = 'newtab'
  detail.tabEl.dataset.title = 'New Tab'
  ensureTabHistory(detail.tabEl)
  syncNavButtons(detail.tabEl)
  saveTabsSnapshot()
})

// Stop any audio/session a closed tab was running. Workspace views and their
// players are singletons, so removing the chrome tab element alone leaves their
// iframes playing on — we have to blank/tear them down here to actually purge it.
function purgeTabSession(url) {
  const local = (typeof resolvePluUrl === 'function') ? resolvePluUrl(url) : null
  const key = local ? local.key : ''

  if (key === 'games' && window.PGViewer && typeof window.PGViewer.close === 'function') {
    window.PGViewer.close()
  } else if (key === 'media' && typeof closePlayer === 'function') {
    closePlayer()
  } else if (key === 'cloud') {
    const frame = document.getElementById('cg-launch-frame')
    if (frame) frame.src = ''
  } else if (key === 'ai' && window.speechSynthesis) {
    window.speechSynthesis.cancel()
  }

  // A non-built-in tab in Remote mode is a remote browser session — end it.
  if (!key && url && url !== 'newtab' &&
      typeof getNetEngine === 'function' && getNetEngine() === 'remote' &&
      typeof endRemoteSession === 'function') {
    endRemoteSession()
  }
}

tabsEl.addEventListener('tabRemove', ({ detail } = {}) => {
  const closed = detail && detail.tabEl
  purgeTabSession((closed && closed.dataset.url) || '')
  if (chromeTabs.tabEls.length === 0) openNewTab()
  saveTabsSnapshot()
})