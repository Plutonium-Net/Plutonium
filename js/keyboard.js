window.addEventListener('keydown', e => {
  const key = (e && typeof e.key === 'string' ? e.key : '').toLowerCase()
  if (e.ctrlKey && key === 't') { openNewTab(); e.preventDefault(); return }
  if (e.ctrlKey && key === 'w') {
    const activeTab = chromeTabs.activeTabEl
    if (activeTab) chromeTabs.removeTab(activeTab)
    e.preventDefault()
    return
  }
  if (key === 'f5' && pageFrame && pageFrame.style.display !== 'none') { pageFrame.src = pageFrame.src; return }
})

window.addEventListener('keydown', e => {
  if (e.key === 'Escape') hideConnectionPopup()
})