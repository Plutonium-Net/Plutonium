const bookmarkStarBtn = document.getElementById('btn-bookmark-star')
const bookmarksBar = document.getElementById('bookmarks-bar')

function updateBookmarkStar(url) {
  if (!bookmarkStarBtn) return
  const bookmarkable = url && url !== 'newtab' && !/^(?:plu|pluto):\/\//i.test(url)
  bookmarkStarBtn.style.display = bookmarkable ? 'flex' : 'none'
  if (!bookmarkable) return
  const starred = Bookmarks.isBookmarked(url)
  bookmarkStarBtn.title = starred ? 'Remove bookmark' : 'Bookmark this page'
  bookmarkStarBtn.setAttribute('aria-label', starred ? 'Remove bookmark' : 'Bookmark this page')
  bookmarkStarBtn.classList.toggle('starred', starred)
  const icon = bookmarkStarBtn.querySelector('i')
  if (icon) icon.className = starred ? 'fa-solid fa-star' : 'fa-regular fa-star'
}

bookmarkStarBtn && bookmarkStarBtn.addEventListener('click', () => {
  const url = currentAddressValue()
  if (!url || url === 'newtab' || /^(?:plu|pluto):\/\//i.test(url)) return
  if (Bookmarks.isBookmarked(url)) {
    Bookmarks.remove(url)
    updateBookmarkStar(url)
    renderBookmarksBar()
    showBookmarkToast('Bookmark removed')
  } else {
    const tab = getActiveTab()
    let title = ''
    if (tab) title = tab.dataset.title || tab.querySelector('.chrome-tab-title').textContent || ''
    if (!title || title === 'New Tab') {
      try { title = new URL(url).hostname.replace(/^www\./, '') } catch { title = url }
    }
    const favicon = `https://www.google.com/s2/favicons?sz=32&domain_url=${encodeURIComponent(url)}`
    Bookmarks.add({ url, title, favicon, addedAt: Date.now() })
    renderBookmarksBar()
    updateBookmarkStar(url)
    showBookmarkToast('Bookmark added')
    Bookmarks.fetchAndCacheFavicon(url)
  }
})

function showBookmarkToast(msg) {
  let toast = document.getElementById('bm-toast')
  if (!toast) {
    toast = document.createElement('div')
    toast.id = 'bm-toast'
    document.body.appendChild(toast)
  }
  toast.textContent = msg
  toast.classList.add('show')
  clearTimeout(toast._hideTimer)
  toast._hideTimer = setTimeout(() => toast.classList.remove('show'), 1800)
}

function renderBookmarksBar() {
  if (!bookmarksBar) return
  const bookmarks = Bookmarks.getAll()
  bookmarksBar.innerHTML = ''
  if (bookmarks.length === 0) {
    bookmarksBar.style.display = 'none'
    return
  }
  bookmarksBar.style.display = 'flex'
  bookmarks.forEach(bm => {
    const item = document.createElement('button')
    item.className = 'bm-item'
    item.title = bm.url

    const img = document.createElement('span')
    img.className = 'bm-item-favicon'
    const faviconImg = document.createElement('img')
    faviconImg.src = Bookmarks.getFaviconUrl(bm.url)
    faviconImg.alt = ''
    faviconImg.width = 16
    faviconImg.height = 16
    faviconImg.onerror = () => { faviconImg.replaceWith(Object.assign(document.createElement('i'), { className: 'fa-solid fa-globe' })) }
    img.appendChild(faviconImg)

    const label = document.createElement('span')
    label.className = 'bm-item-label'
    label.textContent = bm.title || bm.url

    item.addEventListener('contextmenu', e => {
      e.preventDefault()
      showBookmarkContextMenu(e.clientX, e.clientY, bm.url, bm.title)
    })
    item.addEventListener('dblclick', e => {
      e.preventDefault()
      e.stopPropagation()
      showBookmarkContextMenu(e.clientX, e.clientY, bm.url, bm.title, true)
    })
    item.addEventListener('click', () => navigate(bm.url))

    item.appendChild(img)
    item.appendChild(label)
    bookmarksBar.appendChild(item)
  })
}

function showBookmarkContextMenu(x, y, url, title, focusRename = false) {
  removeBookmarkContextMenu()
  const menu = document.createElement('div')
  menu.id = 'bm-ctx-menu'
  menu.classList.add('glass')
  menu.innerHTML = `
    <div class="bm-ctx-title">${title || url}</div>
    <div class="bm-ctx-rename-row">
      <input class="bm-ctx-rename-input" id="bm-ctx-rename-input" type="text" value="${(title || '').replace(/"/g, '&quot;')}" placeholder="Bookmark name" spellcheck="false">
      <button class="bm-ctx-rename-ok" id="bm-ctx-rename-ok">Save</button>
    </div>
    <button class="bm-ctx-btn" id="bm-ctx-open">Open in new tab</button>
    <button class="bm-ctx-btn bm-ctx-remove" id="bm-ctx-remove">Remove bookmark</button>
  `
  document.body.appendChild(menu)
  const mw = menu.offsetWidth, mh = menu.offsetHeight
  menu.style.left = Math.min(x, window.innerWidth - mw - 8) + 'px'
  menu.style.top = Math.min(y, window.innerHeight - mh - 8) + 'px'

  const renameInput = document.getElementById('bm-ctx-rename-input')
  const renameOk = document.getElementById('bm-ctx-rename-ok')

  const doRename = () => {
    const newTitle = renameInput.value.trim()
    if (newTitle && newTitle !== title) {
      Bookmarks.rename(url, newTitle)
      renderBookmarksBar()
      showBookmarkToast('Bookmark renamed')
    }
    removeBookmarkContextMenu()
  }

  renameOk.addEventListener('click', doRename)
  renameInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') doRename()
    if (e.key === 'Escape') removeBookmarkContextMenu()
    e.stopPropagation()
  })
  renameInput.addEventListener('click', e => e.stopPropagation())

  if (focusRename) { renameInput.focus(); renameInput.select() }

  document.getElementById('bm-ctx-open').addEventListener('click', () => {
    removeBookmarkContextMenu()
    openNewTab()
    navigate(url)
  })
  document.getElementById('bm-ctx-remove').addEventListener('click', () => {
    removeBookmarkContextMenu()
    Bookmarks.remove(url)
    renderBookmarksBar()
    updateBookmarkStar(currentAddressValue())
    showBookmarkToast('Bookmark removed')
  })

  setTimeout(() => {
    document.addEventListener('click', removeBookmarkContextMenu, { once: true })
    document.addEventListener('keydown', e => { if (e.key === 'Escape') removeBookmarkContextMenu() }, { once: true })
  }, 0)
}

function removeBookmarkContextMenu() {
  const m = document.getElementById('bm-ctx-menu')
  if (m) m.remove()
}

function setBookmarksBarVisible(visible) {
  if (!bookmarksBar) return
  if (!visible) { bookmarksBar.style.display = 'none'; return }
  bookmarksBar.style.display = Bookmarks.getAll().length > 0 ? 'flex' : 'none'
}