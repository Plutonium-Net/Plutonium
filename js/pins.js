// ── Plutonium Home Pins ──────────────────────────────────────────────────────
// Pins are games (launched from the Games page) and a VM quick-launch.
//   game: { id, name, image? }   — image only for cloud (GCDN) games
//   vm:   { id: 'vm', name, type: 'vm' }
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

let _pickerDismiss = null

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

  const list = document.createElement('div')
  list.className = 'pin-picker__list'

  // VM option
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

  // Divider
  if (games.length) {
    const sep = document.createElement('div')
    sep.className = 'pin-picker__sep'
    list.appendChild(sep)
  }

  // Games
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
  })

  picker.appendChild(list)

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
      <span>Pin games here</span>
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

    const thumb = document.createElement('div')
    thumb.className = 'icon'

    if (pin.type === 'vm') {
      thumb.innerHTML = '<i class="fa-solid fa-desktop"></i>'
      item.classList.add('vm-tile')
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
      navigate(pin.type === 'vm' ? 'pluto://vms?autostart=1' : `pluto://games#${encodeURIComponent(pin.id)}`)
    })
    container.appendChild(item)
  })
}
