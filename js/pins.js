// ── Plutonium Home Pins ──────────────────────────────────────────────────────
// Pins are games (launched from the Games page), cloud-streamed games, and a
// VM quick-launch.
//   game:  { id, name, image? }   — image only for GCDN games
//   cloud: { id: 'cloud:<game_key>', name, image?, type: 'cloud' }
//   vm:    { id: 'vm', name, type: 'vm' }
// Legacy URL pins (Google/Reddit/etc.) from the old pin model are dropped.

const Pins = (() => {
  const LS_KEY   = 'plu_pins'
  const MAX_PINS = 12

  const DEFAULTS = []

  function load() {
    try {
      const raw = localStorage.getItem(LS_KEY)
      if (raw) return JSON.parse(raw)
    } catch {}
    return null
  }

  function save(list) {
    localStorage.setItem(LS_KEY, JSON.stringify(list))
    if (window.accountManager && typeof window.accountManager.schedulePinSync === 'function') {
      window.accountManager.schedulePinSync()
    }
  }

  // Keep only pins this model understands (game pins / vm pin), dropping
  // legacy URL-only entries on first load.
  function sanitize(list) {
    if (!Array.isArray(list)) return []
    return list.filter(p => p && typeof p.id === 'string')
  }

  function getAll() {
    let stored = load()
    if (stored === null) {
      save(DEFAULTS)
      return DEFAULTS
    }
    const clean = sanitize(stored)
    if (clean.length !== stored.length) save(clean)
    return clean
  }

  function add(pin) {
    if (!pin || !pin.id) return
    const list = getAll().filter(p => p.id !== pin.id)
    list.unshift(pin)
    if (list.length > MAX_PINS) list.pop()
    save(list)
    renderPins()
  }

  function remove(id) {
    save(getAll().filter(p => p.id !== id))
    renderPins()
  }

  function find(id) { return getAll().find(p => p.id === id) }

  return { getAll, add, remove, find, save, load, LS_KEY, DEFAULTS, MAX_PINS }
})()

// Expose on window so local pages (games/vms iframes) can pin via window.parent.Pins
window.Pins = Pins

/* ── Pin picker (shown when no pins exist) ────────────────────────────── */
let _pgcdnCache = null
let _pgcdnFetching = null

async function _fetchPgcdnGames() {
  if (_pgcdnCache) return _pgcdnCache
  if (_pgcdnFetching) return _pgcdnFetching
  _pgcdnFetching = fetch('https://g.cdn.plutoniumnet.work/config.json')
    .then(r => r.json())
    .then(cfg => { _pgcdnCache = cfg.games || []; return _pgcdnCache })
    .catch(() => [])
    .finally(() => { _pgcdnFetching = null })
  return _pgcdnFetching
}

let _cloudGamesCache = null
let _cloudGamesFetching = null

async function _fetchCloudGames() {
  if (_cloudGamesCache) return _cloudGamesCache
  if (_cloudGamesFetching) return _cloudGamesFetching
  _cloudGamesFetching = fetch('data/cloud.json')
    .then(r => r.json())
    .then(games => { _cloudGamesCache = games || []; return _cloudGamesCache })
    .catch(() => [])
    .finally(() => { _cloudGamesFetching = null })
  return _cloudGamesFetching
}

// Normalize a cloud game image path (e.g. '../img/cloud/x.jpg') to
// a root-relative path that works from index.html.
function _cloudImgRoot(img) {
  if (!img) return ''
  // Strip leading '../' that is relative to pages/cloud.html
  return img.replace(/^\.\.\//, '')
}

let _pickerDismiss = null
let _pickerSlashHandler = null

function _dismissPicker() {
  const picker = document.querySelector('.pin-picker')
  if (picker) picker.remove()
  const scrim = document.querySelector('.pin-picker-scrim')
  if (scrim) scrim.remove()
  if (_pickerDismiss) {
    document.removeEventListener('click', _pickerDismiss, true)
    document.removeEventListener('keydown', _pickerEsc, true)
    _pickerDismiss = null
  }
  if (_pickerSlashHandler) {
    document.removeEventListener('keydown', _pickerSlashHandler, true)
    _pickerSlashHandler = null
  }
}

function _pickerEsc(e) {
  if (e.key === 'Escape') _dismissPicker()
}

async function _openPinPicker(anchorEl) {
  _dismissPicker()

  const scrim = document.createElement('div')
  scrim.className = 'pin-picker-scrim'
  document.body.appendChild(scrim)
  scrim.addEventListener('click', _dismissPicker)

  const picker = document.createElement('div')
  picker.className = 'pin-picker glass'
  picker.innerHTML = '<div class="pin-picker__loading"><i class="fa-solid fa-spinner fa-spin"></i> Loading…</div>'
  document.body.appendChild(picker)

  // Fetch games
  const games = await _fetchPgcdnGames()
  const pinned = new Set(Pins.getAll().map(p => p.id))
  picker.innerHTML = ''

  const header = document.createElement('div')
  header.className = 'pin-picker__header'
  header.textContent = 'Pin to Home'
  picker.appendChild(header)

  // ── Search input ─────────────────────────────────────────────────────────
  const searchWrap = document.createElement('div')
  searchWrap.className = 'pin-picker__search'
  searchWrap.innerHTML = '<i class="fa-solid fa-magnifying-glass"></i>'
  const searchInput = document.createElement('input')
  searchInput.type = 'text'
  searchInput.placeholder = 'Search games…'
  searchInput.autocomplete = 'off'
  searchInput.spellcheck = false
  searchWrap.appendChild(searchInput)
  picker.appendChild(searchWrap)

  const list = document.createElement('div')
  list.className = 'pin-picker__list'

  // Track all filterable items and section markers for search
  const filterItems = []  // { el, name }
  const sections = []     // { sep?, label?, items: [] }
  let currentSection = null

  function startSection(sep, label) {
    currentSection = { sep: sep || null, label: label || null, items: [] }
    sections.push(currentSection)
    if (sep) list.appendChild(sep)
    if (label) list.appendChild(label)
  }

  // ── VM option ───────────────────────────────────────────────────────────
  startSection(null, null)
  const vmItem = document.createElement('div')
  vmItem.className = 'pin-picker__item' + (pinned.has('vm') ? ' pin-picker__item--pinned' : '')
  vmItem.innerHTML = `
    <div class="pin-picker__icon"><i class="fa-solid fa-desktop"></i></div>
    <span class="pin-picker__name">Virtual Machines</span>
    ${pinned.has('vm') ? '<i class="fa-solid fa-check pin-picker__check"></i>' : ''}
  `
  vmItem.addEventListener('click', () => {
    if (Pins.find('vm')) {
      Pins.remove('vm')
    } else {
      Pins.add({ id: 'vm', name: 'Virtual Machines', type: 'vm' })
    }
    _dismissPicker()
  })
  list.appendChild(vmItem)
  filterItems.push({ el: vmItem, name: 'virtual machines' })
  if (currentSection) currentSection.items.push(vmItem)

  // ── Local GCDN games ────────────────────────────────────────────────────
  if (games.length) {
    const sep = document.createElement('div')
    sep.className = 'pin-picker__sep'
    startSection(sep, null)
  }

  games.forEach(game => {
    const item = document.createElement('div')
    item.className = 'pin-picker__item' + (pinned.has(game.id) ? ' pin-picker__item--pinned' : '')
    item.innerHTML = `
      <div class="pin-picker__icon">
        <img src="https://g.cdn.plutoniumnet.work/${game.image}" alt="" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
        <i class="fa-solid fa-gamepad" style="display:none"></i>
      </div>
      <span class="pin-picker__name">${game.name}</span>
      ${pinned.has(game.id) ? '<i class="fa-solid fa-check pin-picker__check"></i>' : ''}
    `
    item.addEventListener('click', () => {
      if (Pins.find(game.id)) {
        Pins.remove(game.id)
      } else {
        Pins.add({ id: game.id, name: game.name, image: game.image || undefined })
      }
      _dismissPicker()
    })
    list.appendChild(item)
    filterItems.push({ el: item, name: game.name.toLowerCase() })
    if (currentSection) currentSection.items.push(item)
  })

  // ── Cloud games ─────────────────────────────────────────────────────────
  const cloudGames = await _fetchCloudGames()

  if (cloudGames.length) {
    const cloudSep = document.createElement('div')
    cloudSep.className = 'pin-picker__sep'
    const cloudLabel = document.createElement('div')
    cloudLabel.className = 'pin-picker__header'
    cloudLabel.textContent = 'Cloud Games'
    cloudLabel.style.padding = '6px 10px 2px'
    startSection(cloudSep, cloudLabel)
  }

  cloudGames.forEach(game => {
    const pinId = 'cloud:' + game.game_key
    const imgPath = _cloudImgRoot(game.image)
    const item = document.createElement('div')
    item.className = 'pin-picker__item' + (pinned.has(pinId) ? ' pin-picker__item--pinned' : '')
    item.innerHTML = `
      <div class="pin-picker__icon">
        <img src="${imgPath}" alt="" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
        <i class="fa-solid fa-cloud" style="display:none"></i>
      </div>
      <span class="pin-picker__name">${game.name}</span>
      ${pinned.has(pinId) ? '<i class="fa-solid fa-check pin-picker__check"></i>' : ''}
    `
    item.addEventListener('click', () => {
      if (Pins.find(pinId)) {
        Pins.remove(pinId)
      } else {
        Pins.add({ id: pinId, name: game.name, image: imgPath || undefined, type: 'cloud' })
      }
      _dismissPicker()
    })
    list.appendChild(item)
    filterItems.push({ el: item, name: game.name.toLowerCase() })
    if (currentSection) currentSection.items.push(item)
  })

  picker.appendChild(list)

  // ── No-results message ───────────────────────────────────────────────────
  const noResults = document.createElement('div')
  noResults.className = 'pin-picker__no-results'
  noResults.innerHTML = '<i class="fa-solid fa-magnifying-glass"></i> No games found'
  noResults.style.display = 'none'
  list.appendChild(noResults)

  // ── Search filtering ─────────────────────────────────────────────────────
  function _filterPicker() {
    const q = searchInput.value.trim().toLowerCase()
    let totalVisible = 0

    filterItems.forEach(item => {
      const match = !q || item.name.includes(q)
      item.el.style.display = match ? '' : 'none'
      if (match) totalVisible++
    })

    // Hide section headers/separators when their section has no visible items
    sections.forEach(sec => {
      const hasVisible = sec.items.some(el => el.style.display !== 'none')
      if (sec.sep) sec.sep.style.display = hasVisible ? '' : 'none'
      if (sec.label) sec.label.style.display = hasVisible ? '' : 'none'
    })

    noResults.style.display = (q && !totalVisible) ? '' : 'none'
  }

  searchInput.addEventListener('input', _filterPicker)

  // Escape in search clears text first, then dismisses on second press
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && searchInput.value) {
      e.stopPropagation()
      searchInput.value = ''
      _filterPicker()
    }
  })

  // Focus search on / key (matches the rest of the app)
  function _pickerSlash(e) {
    if (e.key === '/' && document.activeElement !== searchInput) {
      e.preventDefault()
      e.stopPropagation()
      searchInput.focus()
      searchInput.select()
    }
  }
  document.addEventListener('keydown', _pickerSlash, true)

  // Focus search automatically when picker opens
  setTimeout(() => { searchInput.focus() }, 50)

  _pickerSlashHandler = _pickerSlash

  // Dismiss on outside click
  setTimeout(() => {
    _pickerDismiss = (e) => { if (!picker.contains(e.target)) _dismissPicker() }
    document.addEventListener('click', _pickerDismiss, true)
    document.addEventListener('keydown', _pickerEsc, true)
  }, 0)
}

function renderPins() {
  _dismissPicker() // close picker if open when re-rendering
  const container = document.querySelector('.shortcuts')
  if (!container) return

  container.innerHTML = ''

  const pins = Pins.getAll()

  if (!pins.length) {
    const empty = document.createElement('div')
    empty.className = 'shortcut empty-pin-hint'
    empty.innerHTML = `
      <div class="icon"><i class="fa-solid fa-thumbtack"></i></div>
      <span>Pin Items.</span>
    `
    empty.title = 'Click to choose games to pin'
    empty.addEventListener('click', (e) => {
      e.stopPropagation()
      _openPinPicker(empty)
    })
    container.appendChild(empty)
    return
  }

  pins.forEach(pin => {
    const item = document.createElement('div')
    item.className = 'shortcut'
    item.title = pin.name
    item.dataset.pinId = pin.id
    item.dataset.pinName = pin.name
    item.dataset.pinType = pin.type || ''

    const thumb = document.createElement('div')
    thumb.className = 'icon'

    if (pin.type === 'vm') {
      thumb.innerHTML = '<i class="fa-solid fa-desktop"></i>'
      item.classList.add('vm-tile')
    } else if (pin.type === 'cloud' && pin.image) {
      // Cloud gaming (data/cloud.json) game — root-relative thumbnail
      const img = document.createElement('img')
      img.src = pin.image
      img.alt = ''
      img.loading = 'lazy'
      img.className = 'pin-thumb'
      img.onerror = () => {
        thumb.innerHTML = '<i class="fa-solid fa-cloud"></i>'
      }
      thumb.appendChild(img)
    } else if (pin.image) {
      // Cloud (GCDN) game — full URL thumbnail
      const img = document.createElement('img')
      img.src = `https://g.cdn.plutoniumnet.work/${pin.image}`
      img.alt = ''
      img.loading = 'lazy'
      img.className = 'pin-thumb'
      img.onerror = () => {
        thumb.innerHTML = '<i class="fa-solid fa-gamepad"></i>'
      }
      thumb.appendChild(img)
    } else {
      // Local game — bundled thumbnail
      const img = document.createElement('img')
      img.src = `img/games/${pin.id}.png`
      img.alt = ''
      img.loading = 'lazy'
      img.className = 'pin-thumb'
      img.onerror = () => {
        thumb.innerHTML = '<i class="fa-solid fa-gamepad"></i>'
      }
      thumb.appendChild(img)
    }

    const label = document.createElement('span')
    label.textContent = pin.name

    const removeBtn = document.createElement('button')
    removeBtn.className = 'pin-remove-btn'
    removeBtn.title = 'Unpin'
    removeBtn.setAttribute('aria-label', `Unpin ${pin.name}`)
    removeBtn.innerHTML = '<i class="fa-solid fa-xmark"></i>'
    removeBtn.addEventListener('click', e => {
      e.stopPropagation()
      Pins.remove(pin.id)
      renderPins()
    })

    item.appendChild(thumb)
    item.appendChild(label)
    item.appendChild(removeBtn)
    item.addEventListener('click', () => {
      if (pin.type === 'vm') navigate('pluto://vms?autostart=1')
      else if (pin.type === 'cloud') navigate(`pluto://cloud#${encodeURIComponent(pin.id)}`)
      else navigate(`pluto://games#${encodeURIComponent(pin.id)}`)
    })
    container.appendChild(item)
  })
}
