function showToast(msg) {
  const t = document.getElementById('acct-toast')
  t.textContent = msg
  t.classList.add('show')
  clearTimeout(t._tid)
  t._tid = setTimeout(() => t.classList.remove('show'), 2200)
}

// Keep the shell in sync after import/clear (runs inside the account iframe).
function scheduleLocalSync(type) {
  const shell = (window.parent && window.parent !== window) ? window.parent : window
  const am = shell.accountManager
  try {
    if (type === 'pins') {
      if (typeof shell.renderPins === 'function') shell.renderPins()
      if (am && typeof am.schedulePinSync === 'function') am.schedulePinSync()
    } else if (type === 'bookmarks') {
      if (am && typeof am.scheduleBookmarkSync === 'function') am.scheduleBookmarkSync()
    }
  } catch (_) {}
}

function confirm(title, desc, onConfirm) {
  const overlay = document.createElement('div')
  overlay.className = 'confirm-overlay'
  overlay.innerHTML = `
    <div class="confirm-box">
      <div class="confirm-box-title">${title}</div>
      <div class="confirm-box-desc">${desc}</div>
      <div class="confirm-box-actions">
        <button class="btn btn-ghost" id="conf-cancel">Cancel</button>
        <button class="btn btn-danger" id="conf-ok">Confirm</button>
      </div>
    </div>
  `
  document.body.appendChild(overlay)
  overlay.querySelector('#conf-cancel').addEventListener('click', () => overlay.remove())
  overlay.querySelector('#conf-ok').addEventListener('click', () => { overlay.remove(); onConfirm() })
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove() })
}

function exportData(type) {
  const key = type === 'bookmarks' ? 'plu_bookmarks' : 'plu_pins'
  let data = []
  try { data = JSON.parse(localStorage.getItem(key)) || [] } catch {}
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `plu_${type}_${Date.now()}.json`
  a.click()
  showToast(`${type.charAt(0).toUpperCase() + type.slice(1)} exported`)
}

function importData(type) {
  const input = document.getElementById('import-file-input')
  input.onchange = () => {
    const file = input.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = e => {
      try {
        const data = JSON.parse(e.target.result)
        if (!Array.isArray(data)) { showToast('Invalid file format'); return }
        const key = type === 'bookmarks' ? 'plu_bookmarks' : 'plu_pins'
        localStorage.setItem(key, JSON.stringify(data))
        showToast(`Imported ${data.length} ${type}`)
        renderBookmarks()
        updateStats()
        scheduleLocalSync(type)
      } catch { showToast('Failed to parse file') }
    }
    reader.readAsText(file)
    input.value = ''
  }
  input.click()
}

function clearData(type) {
  confirm(
    `Clear all ${type}?`,
    `This will permanently remove all your saved ${type} from this device. This cannot be undone.`,
    () => {
      const key = type === 'bookmarks' ? 'plu_bookmarks' : 'plu_pins'
      localStorage.removeItem(key)
      showToast(`${type.charAt(0).toUpperCase() + type.slice(1)} cleared`)
      renderBookmarks()
      updateStats()
      scheduleLocalSync(type)
    }
  )
}

function renderBookmarks() {
  const list = document.getElementById('acct-bm-list')
  if (!list) return
  let bookmarks = []
  try { bookmarks = JSON.parse(localStorage.getItem('plu_bookmarks')) || [] } catch {}

  const countLabel = document.getElementById('bm-count-label')
  const badge = document.getElementById('bm-count-badge')
  if (countLabel) countLabel.textContent = bookmarks.length ? `${bookmarks.length} saved` : 'No bookmarks saved'
  if (badge) {
    badge.textContent = bookmarks.length
    badge.className = 'badge ' + (bookmarks.length > 0 ? 'active' : 'inactive')
  }

  if (!bookmarks.length) {
    list.innerHTML = '<div class="bm-empty">No bookmarks yet</div>'
    return
  }

  list.innerHTML = ''
  bookmarks.slice(0, 8).forEach(bm => {
    const row = document.createElement('div')
    row.className = 'bm-row'

    const fav = document.createElement('div')
    fav.className = 'bm-favicon'
    const img = document.createElement('img')
    img.src = `https://www.google.com/s2/favicons?sz=32&domain_url=${encodeURIComponent(bm.url)}`
    img.onerror = () => { img.replaceWith(Object.assign(document.createElement('i'), { className: 'fa-solid fa-globe' })) }
    fav.appendChild(img)

    const title = document.createElement('div')
    title.className = 'bm-title'
    title.textContent = bm.title || bm.url

    const url = document.createElement('div')
    url.className = 'bm-url'
    url.textContent = bm.url

    const removeBtn = document.createElement('button')
    removeBtn.className = 'bm-remove'
    removeBtn.title = 'Remove'
    removeBtn.innerHTML = '<i class="fa-solid fa-xmark"></i>'
    removeBtn.addEventListener('click', () => {
      try {
        let bms = JSON.parse(localStorage.getItem('plu_bookmarks')) || []
        bms = bms.filter(b => b.url !== bm.url)
        localStorage.setItem('plu_bookmarks', JSON.stringify(bms))
      } catch {}
      renderBookmarks()
      updateStats()
      showToast('Bookmark removed')
    })

    row.appendChild(fav)
    row.appendChild(title)
    row.appendChild(url)
    row.appendChild(removeBtn)
    list.appendChild(row)
  })

  if (bookmarks.length > 8) {
    const more = document.createElement('div')
    more.style.cssText = 'padding:10px 16px;font-size:11px;color:rgba(255,255,255,.3);text-align:center'
    more.textContent = `+${bookmarks.length - 8} more`
    list.appendChild(more)
  }
}

function updateStats() {
  let bms = []
  try { bms = JSON.parse(localStorage.getItem('plu_bookmarks')) || [] } catch {}
  let pins = []
  try { pins = JSON.parse(localStorage.getItem('plu_pins')) || [] } catch {}
  const bmEl = document.getElementById('stat-bookmarks')
  const pinEl = document.getElementById('stat-pins')
  const storEl = document.getElementById('stat-storage')
  if (bmEl) bmEl.textContent = bms.length
  if (pinEl) pinEl.textContent = pins.length
  if (storEl) storEl.textContent = localStorage.length

  const guestBm = document.getElementById('guest-bm-count')
  const guestPin = document.getElementById('guest-pin-count')
  if (guestBm) guestBm.textContent = bms.length + ' saved'
  if (guestPin) guestPin.textContent = pins.length + ' pinned'
}

function fillProfile(am) {
  const user = am.user
  if (!user) return

  const avatarEl = document.getElementById('acct-avatar')
  if (user.photoURL) {
    avatarEl.innerHTML = `<img src="${user.photoURL}" alt="avatar">`
  } else {
    avatarEl.textContent = (user.displayName || user.email || '?')[0].toUpperCase()
  }

  am.getUserProfile().then(profile => {
    const name = (profile && profile.name) || user.displayName || user.email.split('@')[0]
    document.getElementById('acct-name').textContent = name
  }).catch(() => {
    document.getElementById('acct-name').textContent = user.displayName || user.email.split('@')[0]
  })

  document.getElementById('acct-email').textContent = user.email
}

function setupPasswordReset(am) {
  const row = document.getElementById('pw-reset-row')
  if (!row) return

  let sending = false

  row.addEventListener('click', async () => {
    if (sending) return
    const user = am.user
    if (!user || !user.email) { showToast('No email on file'); return }

    sending = true
    const sub = document.getElementById('pw-reset-sub')
    const chevron = document.getElementById('pw-reset-chevron')
    if (sub) sub.textContent = 'Sending…'
    if (chevron) chevron.className = 'fa-solid fa-circle-notch fa-spin-custom'

    try {
      if (typeof am.resetPassword !== 'function') throw new Error('no-op')
      await am.resetPassword(user.email)
      showToast('Reset link sent to ' + user.email)
      if (sub) sub.textContent = 'Reset link sent — check your inbox'
      if (chevron) chevron.className = 'row-chevron fa-solid fa-check'
      setTimeout(() => {
        if (sub) sub.textContent = 'Send a reset link to your email'
        if (chevron) chevron.className = 'row-chevron fa-solid fa-chevron-right'
        sending = false
      }, 4000)
    } catch (err) {
      showToast('Failed to send reset link')
      if (sub) sub.textContent = 'Send a reset link to your email'
      if (chevron) chevron.className = 'row-chevron fa-solid fa-chevron-right'
      sending = false
    }
  })
}

function setupSignedInListeners(am) {
  const signoutBtn = document.getElementById('signout-btn')
  if (signoutBtn) {
    signoutBtn.addEventListener('click', async () => {
      await am.signOut()
      showToast('Signed out')
      setTimeout(() => location.reload(), 600)
    })
  }

  const deleteBtn = document.getElementById('delete-account-btn')
  if (deleteBtn) {
    deleteBtn.addEventListener('click', () => {
      confirm(
        'Delete your account?',
        'This permanently deletes your account and all synced data. This action cannot be undone.',
        async () => {
          try {
            if (am.deleteAccount) await am.deleteAccount()
            showToast('Account deleted')
            setTimeout(() => location.reload(), 800)
          } catch { showToast('Failed to delete account') }
        }
      )
    })
  }

  setupPasswordReset(am)
}

function renderPage() {
  const am = window.parent && window.parent.accountManager
    ? window.parent.accountManager
    : window.accountManager

  if (!am || !am.firebaseLoaded) { setTimeout(renderPage, 200); return }

  document.getElementById('loading-state').style.display = 'none'

  if (!am.user && !am.isGuest) { setTimeout(renderPage, 200); return }

  updateStats()

  if (!am.user) {
    document.getElementById('guest-state').style.display = 'block'
    document.getElementById('signed-in-state').style.display = 'none'
    document.getElementById('acct-signin-btn').addEventListener('click', () => {
      am.isGuest = false
      am.showAuthPrompt()
    })
    return
  }

  document.getElementById('guest-state').style.display = 'none'
  document.getElementById('signed-in-state').style.display = 'block'

  fillProfile(am)
  renderBookmarks()
  setupSignedInListeners(am)

  setInterval(() => { updateStats() }, 5000)
}

renderPage()