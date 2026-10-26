/*
 * Home-screen app rail — an icon-only strip down the right edge of the new tab
 * page. Clicking an icon opens an OptionWheel popout (js/option-wheel.js)
 * titled with the app name, listing that app's entry points.
 *
 * The lists live in WHEELS, keyed by the tile's data-local-uri:
 *
 *   label  what the wheel shows
 *   uri    where the option goes (defaults to the icon's own route)
 *   work   called after navigation, once every tick, until it returns true.
 *          Workspace bundles (games.js, ai.js, …) load after the route opens,
 *          so anything that needs their listeners has to be retried rather
 *          than fired once. `helpers` is { q, focus, click }.
 *
 * Editing WHEELS is all that is needed to change what an icon offers.
 */
import OptionWheel from './option-wheel.js?v=3'

// Short names on purpose: the title is stacked one upright letter per row, so
// the full label ("Artificial Intelligence") would never fit at that size. The
// tiles keep their full names for the tooltip and aria-label.
const WHEELS = {
  'pluto://games': {
    title: 'Games',
    items: [
      { label: 'All Games' },
      // The search field lives in the first source panel, so make sure that
      // panel is the visible one before focusing it.
      { label: 'Search Games', work: (h) => selectSource(h, 'pgcdn') && h.focus('#pgcdn-search') },
      { label: 'My Games', work: (h) => selectSource(h, 'mygames') },
      { label: 'History', work: (h) => selectSource(h, 'history') }
    ]
  },
  'pluto://ai': {
    title: 'Artificial Intelligence',
    items: [
      { label: 'Chat' },
      { label: 'Personas', work: (h) => call('openStudio', 'personas') },
      { label: 'Memory', work: (h) => call('openStudio', 'memory') }
    ]
  },
  'pluto://media': {
    title: 'Media',
    items: [
      { label: 'Movies', uri: 'pluto://media?category=m' },
      { label: 'TV Shows', uri: 'pluto://media?category=t' },
      { label: 'Anime', uri: 'pluto://media?category=a' }
    ]
  },
  'pluto://vms': {
    title: 'Virtual Machines',
    items: [
      { label: 'New Session', uri: 'pluto://vms?autostart=1' },
      { label: 'Virtual Machines' }
    ]
  },
  'pluto://apps': {
    title: 'Apps',
    items: [
      { label: 'Browse' },
      { label: 'Search Apps', work: (h) => h.focus('#apps-search') },
      { label: 'Change Server', work: () => call('openAppsServerMenu') }
    ]
  }
}

// The ring is built by repeating the option list until it has at least this
// many rows. Sizing the fade from the list length instead (the obvious 2/count)
// broke the short wheels: two options put the neighbour at exactly zero opacity
// so only one row was ever visible, and three options parked both neighbours at
// 33% so nothing ever faded — a flat list, not a ring. Repeating the entries
// gives every wheel the same arc to travel, and puts the wrap-around well past
// the point where a row has already faded to nothing.
const RING_MIN = 8
// Rows between the selection and full transparency. Three puts two options in
// the band above the selection and two below it (at 2/3 and 1/3 opacity) before
// anything reaches the edge, which is the depth the wheel is meant to read at;
// at two, the second neighbour sat at exactly zero and the wheel showed only
// one row either side. RING_MIN keeps the wrap-around past the last faded row.
const FADE_ROWS = 3

// Repeat the option list around the ring so even a two-entry app has enough
// arc to fade across, and hand back the index that carries a remembered
// selection: the copy nearest the middle of the ring, so the arc stays
// symmetric whichever option was last used.
function ringLayout(real) {
  const count = real.length
  const reps = count ? Math.max(1, Math.ceil(RING_MIN / count)) : 1
  const ring = []
  for (let r = 0; r < reps; r++) ring.push(...real)
  const base = Math.floor(reps / 2) * count
  return {
    ring,
    count,
    at(wanted) {
      return count ? base + (((Math.round(wanted) % count) + count) % count) : 0
    }
  }
}

// Big type in the band between the rail and the search box: one row per ~56px,
// a pronounced rightward curl, and a hard fade so only the selection and its
// immediate neighbours read. inset stays 0 — the centred rows carry the shape.
//
// fade is in "rows": 1 / FADE_ROWS reaches full transparency two rows out, so
// the selection, one neighbour either side, and nothing else. It is a constant
// on purpose — see ringLayout() for why it must not be derived from the list.
const WHEEL_PROPS = {
  side: 'right',
  textColor: '#a6a6a6',
  activeColor: '#ffffff',
  // Sized to the band the rail leaves: the longest option ("Virtual Machines")
  // has to fit the popout's width, which shrinks as the tiles grow.
  fontSize: 2.2,
  spacing: 1.55,
  curve: 1,
  tilt: 10,
  blur: 1.8,
  fade: 1 / FADE_ROWS,
  minOpacity: 0,
  smoothing: 200,
  inset: 0,
  loop: true,
  draggable: true
}

// Height of one option row, used to size the popout to the band it holds.
function rowHeightPx() {
  const rem = parseFloat(getComputedStyle(document.documentElement).fontSize)
  return WHEEL_PROPS.fontSize * WHEEL_PROPS.spacing * (Number.isFinite(rem) && rem > 0 ? rem : 16)
}

// Shortest popout a name still gets, so the compact wheels are not all title.
const TITLE_MIN_HEIGHT = 240

const SELECTED_KEY = 'plu_app_wheel_selected'
const CLOSE_MS = 150
const WORK_RETRY_MS = 100
const WORK_RETRIES = 60

// The games source tabs only get their listeners when games.js has loaded, so
// click until the tab reports itself active.
function selectSource(helpers, panel) {
  const tab = helpers.q('.source-tab[data-panel="' + panel + '"]')
  if (!tab) return false
  if (!tab.classList.contains('active')) {
    helpers.click(tab)
    return false
  }
  return true
}

// Workspace scripts publish their entry points as globals; wait for the one we
// need before calling it.
function call(name, ...args) {
  if (typeof window[name] !== 'function') return false
  window[name](...args)
  return true
}

const helpers = {
  q: (selector) => document.querySelector(selector),
  // Only reports success once the element actually holds focus, so a field in
  // a hidden panel keeps the retry loop running instead of ending the action.
  focus(selector) {
    const el = document.querySelector(selector)
    if (!el || typeof el.focus !== 'function') return false
    el.focus()
    return document.activeElement === el
  },
  click(el) {
    if (el && typeof el.click === 'function') el.click()
  }
}

const flanks = document.getElementById('app-flanks')
const panel = document.getElementById('app-wheel')
const titleEl = document.getElementById('app-wheel-title')

// The name is big by design. If the popout is too short for it, step the size
// down until it fits rather than letting it run off the top and bottom; the CSS
// variable is the size to aim for, never a minimum.
function fitTitle() {
  titleEl.style.fontSize = ''
  const wanted = parseFloat(getComputedStyle(titleEl).fontSize) || 33
  const available = panel.clientHeight
  const natural = titleEl.scrollHeight
  const scale = available && natural > available ? available / natural : 1
  titleEl.style.fontSize = Math.max(12, Math.floor(wanted * scale)) + 'px'
}
const wheelHost = document.getElementById('app-wheel-options')
const tiles = flanks ? Array.from(flanks.querySelectorAll('.app-tile')) : []

if (flanks && panel && titleEl && wheelHost && tiles.length) {
  let wheel = null
  let openUri = null
  let openBtn = null
  // How many real options the open wheel has: the ring repeats them, so an
  // index coming back from the wheel has to be folded down to the real list
  // before it is remembered.
  let openCount = 0
  let closeTimer = null
  let pending = null
  const memory = readMemory()

  function readMemory() {
    try {
      const raw = localStorage.getItem(SELECTED_KEY)
      const parsed = raw ? JSON.parse(raw) : null
      return parsed && typeof parsed === 'object' ? parsed : {}
    } catch (_) {
      return {}
    }
  }

  function remember(uri, index) {
    memory[uri] = index
    try {
      localStorage.setItem(SELECTED_KEY, JSON.stringify(memory))
    } catch (_) {}
  }

  function ensureWheel() {
    if (wheel) return wheel
    wheel = OptionWheel(wheelHost, {
      ...WHEEL_PROPS,
      items: [],
      defaultSelected: 0,
      onChange: (index) => {
        if (openUri) remember(openUri, openCount ? index % openCount : index)
        if (window.SoundFX) window.SoundFX.play('tick')
      },
      onItemClick: (index, item) => commit(index, item)
    })
    return wheel
  }

  function commit(index, item) {
    if (!openBtn) return
    const uri = item && item.uri ? item.uri : openBtn.dataset.localUri
    remember(openBtn.dataset.localUri, openCount ? index % openCount : index)
    close()
    pending = item && typeof item.work === 'function' ? { work: item.work, tries: 0 } : null
    if (typeof window.navigate === 'function') window.navigate(uri)
    settlePending()
  }

  function settlePending() {
    const task = pending
    if (!task) return
    let done = false
    try {
      done = !!task.work(helpers)
    } catch (err) {
      console.warn('[app-wheel] option action failed', err)
      done = true
    }
    if (done || ++task.tries > WORK_RETRIES) {
      pending = null
      return
    }
    setTimeout(settlePending, WORK_RETRY_MS)
  }

  function open(btn) {
    const data = WHEELS[btn.dataset.localUri] || {}
    const real = data.items || []
    const layout = ringLayout(real)
    const wheelApi = ensureWheel()
    const remembered = memory[btn.dataset.localUri]

    if (closeTimer) {
      clearTimeout(closeTimer)
      closeTimer = null
    }
    // Switching straight from one icon to another: the icon that was open does
    // not get a close(), so clear it here or two tiles stay lit at once.
    if (openBtn && openBtn !== btn) {
      openBtn.classList.remove('is-active')
      openBtn.setAttribute('aria-expanded', 'false')
    }
    panel.hidden = false
    titleEl.textContent = data.title || btn.dataset.name || 'App'
    // The visible arc is the same whatever the app holds — the selection, one
    // neighbour either side and a row of slack — so the popout is sized from
    // the fade, not from the number of options. Every row is already fully
    // transparent before it reaches the edge, which is what keeps options from
    // being seen chopped off at the top and bottom.
    const band = (2 * FADE_ROWS + 1.2) * rowHeightPx()
    panel.style.height = Math.round(
      Math.min(Math.max(band, TITLE_MIN_HEIGHT), window.innerHeight * 0.62)
    ) + 'px'
    fitTitle()
    openCount = layout.count
    wheelApi.setItems(layout.ring, { selected: layout.at(remembered == null ? 0 : remembered) })

    openUri = btn.dataset.localUri
    openBtn = btn
    flanks.classList.add('wheel-open')
    btn.classList.add('is-active')
    btn.setAttribute('aria-expanded', 'true')
    requestAnimationFrame(() => panel.classList.add('is-open'))
    if (window.SoundFX) window.SoundFX.play('open')
  }

  function close() {
    if (!openUri) return
    panel.classList.remove('is-open')
    flanks.classList.remove('wheel-open')
    if (openBtn) {
      openBtn.classList.remove('is-active')
      openBtn.setAttribute('aria-expanded', 'false')
    }
    openUri = null
    openBtn = null
    if (window.SoundFX) window.SoundFX.play('close')
    if (closeTimer) clearTimeout(closeTimer)
    closeTimer = setTimeout(() => {
      closeTimer = null
      if (!openUri) panel.hidden = true
    }, CLOSE_MS)
  }

  function toggle(btn) {
    if (openBtn === btn) close()
    else open(btn)
  }

  tiles.forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault()
      toggle(btn)
    })
  })

  // Any press that is neither on the rail nor in the popout dismisses it.
  document.addEventListener(
    'pointerdown',
    (e) => {
      if (!openUri) return
      const target = e.target
      if (target && panel.contains(target)) return
      if (target && target.closest && target.closest('.app-tile')) return
      close()
    },
    true
  )

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !openUri) return
    const btn = openBtn
    close()
    if (btn) btn.focus()
  })
}
