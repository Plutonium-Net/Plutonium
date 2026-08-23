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

tabsEl.addEventListener('tabRemove', () => {
  if (chromeTabs.tabEls.length === 0) openNewTab()
  saveTabsSnapshot()
})