// ── Custom right-click context menus ────────────────────────────────────────
// Generic engine (ContextMenu) + wiring for the browser chrome:
//   • Tab strip / tabs    — new tab, reload, duplicate, copy link, close…
//   • New-tab page, toolbar & bookmarks bar empty space — browser menu
//   • App tiles           — open / open in new tab
//   • Home pins           — open / open in new tab / unpin

const ContextMenu = (() => {
  let menuEl = null
  let cleanup = null

  function close() {
    if (menuEl) { menuEl.remove(); menuEl = null }
    if (cleanup) { cleanup(); cleanup = null }
  }

  function moveFocus(dir) {
    if (!menuEl) return
    const items = Array.from(menuEl.querySelectorAll('.plu-ctx-item:not(.disabled)'))
    if (!items.length) return
    let idx = items.indexOf(document.activeElement)
    idx = (idx + dir + items.length) % items.length
    items[idx].focus()
  }

  function onKey(e) {
    if (e.key === 'Escape') { e.stopPropagation(); close(); return }
    if (e.key === 'ArrowDown') { e.preventDefault(); moveFocus(1); return }
    if (e.key === 'ArrowUp') { e.preventDefault(); moveFocus(-1); return }
  }

  function show(items, x, y) {
    close()
    if (!Array.isArray(items) || !items.length) return

    menuEl = document.createElement('div')
    menuEl.className = 'plu-ctx-menu'
    menuEl.setAttribute('role', 'menu')

    items.forEach(item => {
      if (!item) return
      if (item === '-' || item.separator) {
        const sep = document.createElement('div')
        sep.className = 'plu-ctx-sep'
        sep.setAttribute('role', 'separator')
        menuEl.appendChild(sep)
        return
      }
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.className = 'plu-ctx-item' + (item.danger ? ' danger' : '') + (item.disabled ? ' disabled' : '')
      btn.setAttribute('role', 'menuitem')
      if (item.icon) btn.innerHTML = `<i class="${item.icon}" aria-hidden="true"></i>`
      const label = document.createElement('span')
      label.textContent = item.label
      btn.appendChild(label)
      if (item.disabled) {
        btn.disabled = true
        btn.tabIndex = -1
      } else {
        btn.addEventListener('click', e => {
          e.stopPropagation()
          close()
          try { item.onClick && item.onClick() } catch (err) { console.error('[ContextMenu]', err) }
        })
      }
      menuEl.appendChild(btn)
    })

    document.body.appendChild(menuEl)
    const mw = menuEl.offsetWidth
    const mh = menuEl.offsetHeight
    menuEl.style.left = Math.max(4, Math.min(x, window.innerWidth - mw - 6)) + 'px'
    menuEl.style.top = Math.max(4, Math.min(y, window.innerHeight - mh - 6)) + 'px'

    const dismiss = e => {
      if (menuEl && e && e.target && (menuEl === e.target || menuEl.contains(e.target))) return
      close()
    }
    setTimeout(() => {
      document.addEventListener('click', dismiss, true)
      document.addEventListener('contextmenu', dismiss, true)
      document.addEventListener('keydown', onKey, true)
      window.addEventListener('blur', dismiss)
      window.addEventListener('resize', dismiss)
    }, 0)
    cleanup = () => {
      document.removeEventListener('click', dismiss, true)
      document.removeEventListener('contextmenu', dismiss, true)
      document.removeEventListener('keydown', onKey, true)
      window.removeEventListener('blur', dismiss)
      window.removeEventListener('resize', dismiss)
    }
  }

  return { show, close }
})()
window.ContextMenu = ContextMenu

/* ── Helpers ─────────────────────────────────────────────────────────────── */

function copyToClipboard(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).catch(() => {})
    return
  }
  const ta = document.createElement('textarea')
  ta.value = text
  ta.style.cssText = 'position:fixed;opacity:0'
  document.body.appendChild(ta)
  ta.select()
  try { document.execCommand('copy') } catch {}
  ta.remove()
}

function duplicateTab(tabEl) {
  const url = tabEl.dataset.url || 'newtab'
  const title = tabEl.dataset.title || 'New Tab'
  chromeTabs.addTab({ title, favicon: false })
  const newTab = chromeTabs.tabEls[chromeTabs.tabEls.length - 1]
  newTab.dataset.url = url
  newTab.dataset.title = title
  const srcState = ensureTabHistory(tabEl)
  if (srcState) tabHistory.set(newTab, { entries: [...srcState.entries], index: srcState.index })
  ensureTabHistory(newTab)
  saveTabsSnapshot()
  if (url === 'newtab') showNewTabPage()
  else navigate(url)
}

function closeOtherTabs(keep) {
  chromeTabs.tabEls.slice().forEach(t => { if (t !== keep) chromeTabs.removeTab(t) })
}

function closeTabsToTheRight(tabEl) {
  const tabs = chromeTabs.tabEls
  const idx = tabs.indexOf(tabEl)
  if (idx < 0) return
  tabs.slice(idx + 1).forEach(t => chromeTabs.removeTab(t))
}

/* ── Tab strip / tab context menu ───────────────────────────────────────── */

const chromeTabsEl = document.getElementById('tabs-el')

chromeTabsEl.addEventListener('contextmenu', e => {
  const tabEl = e.target.closest('.chrome-tab')
  if (tabEl) {
    e.preventDefault()
    const url = tabEl.dataset.url || 'newtab'
    const isActive = tabEl === chromeTabs.activeTabEl
    const frameSrc = pageFrame.getAttribute('src') || ''
    const canReload = isActive && url !== 'newtab' && !!frameSrc && !isBlankFrameSrc(frameSrc)

    const items = [
      { label: 'New Tab', icon: 'fa-solid fa-plus', onClick: () => openNewTab() },
      {
        label: 'Reload', icon: 'fa-solid fa-rotate-right', disabled: !canReload,
        onClick: () => {
          if (tabEl !== chromeTabs.activeTabEl) chromeTabs.setCurrentTab(tabEl)
          try { pageFrame.contentWindow.location.reload() } catch { pageFrame.src = pageFrame.src }
        },
      },
      { label: 'Duplicate', icon: 'fa-solid fa-copy', onClick: () => duplicateTab(tabEl) },
    ]
    if (url && url !== 'newtab') {
      items.push({ label: 'Copy Link', icon: 'fa-solid fa-link', onClick: () => copyToClipboard(url) })
    }
    items.push('-')
    items.push({ label: 'Close Tab', icon: 'fa-solid fa-xmark', onClick: () => chromeTabs.removeTab(tabEl) })
    if (chromeTabs.tabEls.some(t => t !== tabEl)) {
      items.push({ label: 'Close Other Tabs', icon: 'fa-solid fa-window-close', onClick: () => closeOtherTabs(tabEl) })
    }
    const idx = chromeTabs.tabEls.indexOf(tabEl)
    if (idx >= 0 && idx < chromeTabs.tabEls.length - 1) {
      items.push({ label: 'Close Tabs to the Right', icon: 'fa-solid fa-angles-right', onClick: () => closeTabsToTheRight(tabEl) })
    }
    ContextMenu.show(items, e.clientX, e.clientY)
    return
  }

  // Empty tab-strip space → browser menu
  if (!e.target.closest('button')) {
    e.preventDefault()
    showBrowserMenu(e.clientX, e.clientY)
  }
})

/* ── Browser menu (new tab, nav, apps, customize, about, account) ────────── */

function showBrowserMenu(x, y) {
  const btnBackEl = document.getElementById('btn-back')
  const btnForwardEl = document.getElementById('btn-forward')
  const btnHomeEl = document.getElementById('btn-home')
  ContextMenu.show([
    { label: 'Back', icon: 'fa-solid fa-arrow-left', disabled: !btnBackEl || btnBackEl.disabled, onClick: () => btnBackEl && btnBackEl.click() },
    { label: 'Forward', icon: 'fa-solid fa-arrow-right', disabled: !btnForwardEl || btnForwardEl.disabled, onClick: () => btnForwardEl && btnForwardEl.click() },
    { label: 'Home', icon: 'fa-solid fa-house', onClick: () => btnHomeEl && btnHomeEl.click() },
    { label: 'New Tab', icon: 'fa-solid fa-plus', onClick: () => openNewTab() },
    '-',
    { label: 'Apps', icon: 'fa-solid fa-bars', onClick: () => { if (typeof toggleWaffleMenu === 'function') toggleWaffleMenu() } },
    { label: 'Customize', icon: 'fa-solid fa-paintbrush', onClick: () => { if (typeof toggleCustomizeMenu === 'function') toggleCustomizeMenu() } },
    { label: 'About', icon: 'fa-solid fa-circle-info', onClick: () => { if (typeof openAboutDialog === 'function') openAboutDialog() } },
    { label: 'Account', icon: 'fa-solid fa-user', onClick: () => { if (typeof openAccountDialog === 'function') openAccountDialog() } },
  ], x, y)
}

// New-tab page background
const newTabPageEl = document.getElementById('new-tab-page')
newTabPageEl.addEventListener('contextmenu', e => {
  if (e.target.closest('.app-tile, .search-box, .shortcut, .logo, .proxy-engine-switch, .news-ticker, .status-bar, input, textarea, a, button')) return
  e.preventDefault()
  showBrowserMenu(e.clientX, e.clientY)
})

// Toolbar empty space
const toolbarEl = document.querySelector('.toolbar')
toolbarEl && toolbarEl.addEventListener('contextmenu', e => {
  if (e.target.closest('input, textarea, a, button, .address-bar-wrap, .wisp-switcher-shell')) return
  e.preventDefault()
  showBrowserMenu(e.clientX, e.clientY)
})

// Bookmarks bar empty space (bookmark items keep their own menu)
const bookmarksBarEl = document.getElementById('bookmarks-bar')
bookmarksBarEl && bookmarksBarEl.addEventListener('contextmenu', e => {
  if (e.target.closest('.bm-item')) return
  e.preventDefault()
  showBrowserMenu(e.clientX, e.clientY)
})

/* ── App tiles on the new tab page ───────────────────────────────────────── */

document.querySelectorAll('.app-tile').forEach(btn => {
  btn.addEventListener('contextmenu', e => {
    e.preventDefault()
    const uri = btn.dataset.localUri
    const name = btn.dataset.name || 'App'
    ContextMenu.show([
      { label: `Open ${name}`, icon: 'fa-solid fa-play', onClick: () => navigate(uri) },
      { label: 'Open in New Tab', icon: 'fa-solid fa-plus', onClick: () => { openNewTab(); navigate(uri) } },
    ], e.clientX, e.clientY)
  })
})

/* ── Home pins (shortcuts) ───────────────────────────────────────────────── */

document.addEventListener('contextmenu', e => {
  const shortcut = e.target.closest('.shortcut')
  if (!shortcut) return
  const pinId = shortcut.dataset.pinId
  const pinName = shortcut.dataset.pinName
  const pinType = shortcut.dataset.pinType
  if (!pinId || !pinName) return
  e.preventDefault()
  const url = pinType === 'vm' ? 'pluto://vms?autostart=1' : `pluto://games#${encodeURIComponent(pinId)}`
  ContextMenu.show([
    { label: `Open ${pinName}`, icon: 'fa-solid fa-play', onClick: () => navigate(url) },
    { label: 'Open in New Tab', icon: 'fa-solid fa-plus', onClick: () => { openNewTab(); navigate(url) } },
    '-',
    { label: `Unpin ${pinName}`, icon: 'fa-solid fa-thumbtack', danger: true, onClick: () => Pins.remove(pinId) },
  ], e.clientX, e.clientY)
})
