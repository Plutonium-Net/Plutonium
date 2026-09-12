
const HOME_SIGNIN_TITLE = 'Welcome to<br>Plutonium Network'

const GREETING_NAME_TOKEN = '{name}'

// Crossfade timings: the outgoing line fades out while the incoming one fades in, with a
// real overlap (~220ms) so you see one dissolve into the other rather than a dip to blank.
const FADE_OUT_MS = 330
const FADE_DELAY_MS = 110
const FADE_IN_MS = 330

function prefersReducedMotion() {
  return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches)
}

class AccountManager {
  constructor() {
    this.BM_KEY      = 'plu_bookmarks'
    this.PINS_KEY    = 'plu_pins'
    this.TABS_KEY    = 'plu_tabs'
    this.RECENT_KEY  = 'plu_recent'
    this.RECENT_MAX  = 10
    this.SYNC_MS     = 8000
    this.AVATAR_KEY  = 'plu_avatar_'

    this.photoDataUrl   = null
    this.gravatarUrl    = null
    this._gravatarTried = false

    this.greetings       = null
    this._greetingsReq   = null
    this._greeting       = { hour: null, index: 0 }
    this._greetingTimer  = null
    this._greetingParts  = null
    this._greetFitBound  = false
    this._greetFitTimer  = null

    this.user          = null
    this.isGuest       = false
    this.firebaseLoaded = true

    this.syncIntervalId = null
    this.syncCount      = 0
    this.lastSyncHash   = ''
    this._lastTabsHash  = ''
    this.syncStatus     = { lastOk: null, lastErr: null, syncing: false }

    this._migrateLegacyKeys()
    this._init()
  }

  _migrateLegacyKeys() {
    try {
      if (!localStorage.getItem(this.BM_KEY)   && localStorage.getItem('cg_bookmarks')) localStorage.setItem(this.BM_KEY, localStorage.getItem('cg_bookmarks'))
      if (!localStorage.getItem(this.PINS_KEY) && localStorage.getItem('cg_pins'))      localStorage.setItem(this.PINS_KEY, localStorage.getItem('cg_pins'))
      if (!localStorage.getItem(this.TABS_KEY) && localStorage.getItem('cg_tabs'))      localStorage.setItem(this.TABS_KEY, localStorage.getItem('cg_tabs'))
    } catch (_) {}
  }

  _init() {
    if (typeof PlutoniumStore === 'undefined') return

    PlutoniumStore.onAuthChange(u => {
      if (u) {
        const sameUser = !!(this.user && this.user.uid === u.uid)
        if (!sameUser) {
          this.photoDataUrl   = null
          this.gravatarUrl    = null
          this._gravatarTried = false
        }
        this.user = {
          uid:         u.uid,
          email:       u.email || '',
          displayName: u.displayName || '',
          photoURL:    u.photoUrl || '',
        }
        this.isGuest = false
        this.pullBookmarks()
        this.pullPins()
        this.pullTabs()
        this.pullSettings()
        this.pullRecent()
        this._startSync()
        this._renderAccountPanel()
      } else {
        this.user = null
        this._stopSync()
        this._renderAccountPanel()
      }
    })
  }


  async getUserProfile() {
    if (!this.user) return null
    return {
      name:   this.user.displayName || this.user.email.split('@')[0],
      email:  this.user.email,
      photoURL: this.user.photoURL || null,
    }
  }


  _renderAccountPanel() {
    const fieldsEl = document.getElementById('acct-signin-fields')
    const signedEl = document.getElementById('acct-signed')
    if (!fieldsEl || !signedEl) return
    if (!this.user) {
      fieldsEl.hidden = false
      signedEl.hidden = true
      this._bindSignInButton()
      this._bindForgotPassword()
      this._renderHomePanel()
      return
    }
    fieldsEl.hidden = true
    signedEl.hidden = false
    this._bindSignOut()
    this._bindDeleteAccount()
    if (this._deleteReset) this._deleteReset()
    this._renderProfile()
    this._pullAvatar()
    this._renderRecentPanel()
    this._updatePanelLive()
    this._renderProviders()
    this._renderQuota()
    this._bindPasswordForm()
    this._bindExport()
    this._renderHomePanel()
  }

  _bindSignInButton() {
    if (this._signInBound) return
    this._signInBound = true
    this.wireAuthForm()
  }

  _authErrorMessage(e) {
    const msgs = {
      'auth/invalid-email':          'Invalid email address.',
      'auth/user-not-found':         'No account found with that email.',
      'auth/wrong-password':         'Incorrect password.',
      'auth/invalid-credential':     'Wrong email or password.',
      'auth/email-already-in-use':   'That email is already in use.',
      'auth/weak-password':          'Password must be at least 6 characters.',
      'auth/too-many-requests':      'Too many attempts. Try again later.',
      'auth/user-disabled':          'This account has been disabled.',
      'auth/operation-not-allowed':  'Email/password sign-in is not available.',
      'auth/network-request-failed': 'Network error; check your connection.',
      'auth/popup-closed-by-user':   'Sign-in popup was closed.',
      'INVALID_LOGIN_CREDENTIALS':   'Wrong email or password.',
      'EMAIL_NOT_FOUND':             'No account found with that email.',
      'INVALID_PASSWORD':            'Incorrect password.',
      'INVALID_EMAIL':               'Invalid email address.',
      'EMAIL_EXISTS':                'That email is already in use.',
      'WEAK_PASSWORD':               'Password must be at least 6 characters.',
      'TOO_MANY_ATTEMPTS_TRY_LATER': 'Too many attempts. Try again later.',
      'USER_DISABLED':               'This account has been disabled.',
      'OPERATION_NOT_ALLOWED':       'Email/password sign-in is not available.',
    }
    const raw = ((e && e.message) || String(e)).replace(/^\[PlutoniumStore\]\s*/, '')
    const sdk = raw.match(/(auth\/[a-z0-9-]+)/)
    const rest = raw.match(/([A-Z][A-Z0-9_]{3,})/)
    const code = (sdk && sdk[1]) || (rest && rest[1])
    if (code && msgs[code]) return msgs[code]
    if (raw.includes('failed:')) return 'Something went wrong. Please try again.'
    return raw || 'Something went wrong. Please try again.'
  }

  _getBookmarks() {
    try { return JSON.parse(localStorage.getItem(this.BM_KEY)) || [] } catch { return [] }
  }

  _setBookmarks(list) {
    localStorage.setItem(this.BM_KEY, JSON.stringify(list))
    if (typeof renderBookmarksBar === 'function') renderBookmarksBar()
  }

  scheduleBookmarkSync() {
    clearTimeout(this._bmSyncTimer)
    this._bmSyncTimer = setTimeout(() => this.pushBookmarks(), 1200)
  }

  async pushBookmarks() {
    if (!this.user) return
    const list = this._getBookmarks()
    const hash = JSON.stringify(list)
    if (hash === this.lastSyncHash) return
    this.syncCount++
    try {
      await PlutoniumStore.setDoc('bookmarks', { list, lastSync: new Date() })
      this.lastSyncHash = hash
      this._setSyncOk()
    } catch (e) {
      console.warn('[Account] Push failed:', e)
      this._setSyncErr(e)
    }
  }

  async pullBookmarks() {
    if (!this.user) return
    try {
      const doc = await PlutoniumStore.getDoc('bookmarks')
      const remote = doc && Array.isArray(doc.list) ? doc.list : null
      if (!remote) return
      const local = this._getBookmarks()
      const localMap = Object.fromEntries(local.map(b => [b.url, b]))
      const remoteIds = new Set(remote.map(b => b.url))
      const localOnly = local.filter(b => !remoteIds.has(b.url))
      const merged = [...remote, ...localOnly].map(b => ({
        ...b,
        favicon: (localMap[b.url]?.favicon?.startsWith('data:'))
          ? localMap[b.url].favicon
          : b.favicon
      }))
      this._setBookmarks(merged)
      this.lastSyncHash = JSON.stringify(merged)
    } catch (e) {
      console.warn('[Account] Pull failed:', e)
    }
  }

  _getPins() {
    try { return JSON.parse(localStorage.getItem(this.PINS_KEY)) || null } catch { return null }
  }

  _setPins(list) {
    localStorage.setItem(this.PINS_KEY, JSON.stringify(list))
    if (typeof renderPins === 'function') renderPins()
  }

  schedulePinSync() {
    clearTimeout(this._pinSyncTimer)
    this._pinSyncTimer = setTimeout(() => this.pushPins(), 2000)
  }

  async pushPins() {
    if (!this.user) return
    const pins = this._getPins()
    if (!pins) return
    try {
      await PlutoniumStore.setDoc('pins', { list: pins, lastSync: new Date() })
      this._setSyncOk()
    } catch (e) {
      console.warn('[Account] Pin push failed:', e)
      this._setSyncErr(e)
    }
  }

  async pullPins() {
    if (!this.user) return
    try {
      const doc = await PlutoniumStore.getDoc('pins')
      const remote = doc && Array.isArray(doc.list) ? doc.list : null
      if (!remote) return
      const remoteIds = new Set(remote.map(p => p.id))
      const localOnly = (this._getPins() || []).filter(p => !remoteIds.has(p.id))
      this._setPins([...remote, ...localOnly])
    } catch (e) {
      console.warn('[Account] Pin pull failed:', e)
    }
  }

  _getSettings() {
    const out = {}
    try {
      const theme = localStorage.getItem('plu_theme')
      if (theme) out.theme = theme
      const mode = localStorage.getItem('plu_net_mode') || localStorage.getItem('plu_proxy_engine')
      if (mode) out.proxyEngine = mode
      const relay = localStorage.getItem('plu_relay_server') || localStorage.getItem('plu_wisp_server')
      if (relay) out.wispServer = relayMenuState
      if (localStorage.getItem('plu_onboarded')) out.onboarded = true
      try {
        const parsed = JSON.parse(theme || '{}')
        if (parsed.bgImage) out.bgImage = parsed.bgImage
      } catch (_) {}
    } catch (_) {}
    return out
  }

  scheduleSettingsSync() {
    clearTimeout(this._settingsSyncTimer)
    this._settingsSyncTimer = setTimeout(() => this.pushSettings(), 1200)
  }

  async pushSettings() {
    if (!this.user) return
    const settings = this._getSettings()
    try {
      await PlutoniumStore.setDoc('settings', { ...settings, lastSync: new Date() })
      this._setSyncOk()
    } catch (e) {
      console.warn('[Account] Settings push failed:', e)
      this._setSyncErr(e)
    }
  }

  async pullSettings() {
    if (!this.user) return
    try {
      const doc = await PlutoniumStore.getDoc('settings')
      if (!doc) return
      const ready = window.BrowserThemeState && window.setNetEngine && window.switchRelayServer
      if (!ready) {
        setTimeout(() => this.pullSettings(), 2500)
        return
      }
      if (doc.theme && window.BrowserThemeState.saveThemeState) {
        try {
          const parsed = JSON.parse(doc.theme)
          if (doc.bgImage !== undefined) parsed.bgImage = doc.bgImage
          window.BrowserThemeState.saveThemeState(parsed)
        } catch (_) {}
      }
      const legacyMode = { uv: 'core', sj: 'runtime', hb: 'remote' }
      if (doc.proxyEngine) window.setNetEngine(legacyMode[doc.proxyEngine] || doc.proxyEngine)
      if (doc.wispServer) window.switchRelayServer(doc.wispServer)
      if (doc.onboarded) localStorage.setItem('plu_onboarded', '1')
    } catch (e) {
      console.warn('[Account] Settings pull failed:', e)
    }
  }

  _getTabsSnapshot() {
    if (typeof chromeTabs === 'undefined') return null
    const tabs = chromeTabs.tabEls.map(tabEl => ({
      url:    tabEl.dataset.url   || 'newtab',
      title:  tabEl.dataset.title || 'New Tab',
      active: tabEl.hasAttribute('active'),
    }))
    if (!tabs.length) return null
    return tabs
  }

  async pushTabs() {
    if (!this.user) return
    const tabs = this._getTabsSnapshot()
    if (!tabs) return
    const hash = JSON.stringify(tabs)
    if (hash === this._lastTabsHash) return
    try {
      await PlutoniumStore.setDoc('tabs', { list: tabs, lastSync: new Date() })
      this._lastTabsHash = hash
      this._setSyncOk()
    } catch (e) {
      console.warn('[Account] Tab push failed:', e)
      this._setSyncErr(e)
    }
  }

  async pullTabs() {
    if (!this.user) return
    try {
      const doc = await PlutoniumStore.getDoc('tabs')
      const remote = doc && Array.isArray(doc.list) ? doc.list : null
      if (!remote || !remote.length) return
      localStorage.setItem(this.TABS_KEY, JSON.stringify(remote))
      if (typeof restoreTabs === 'function') restoreTabs(remote)
    } catch (e) {
      console.warn('[Account] Tab pull failed:', e)
    }
  }

  scheduleTabSync() {
    clearTimeout(this._tabSyncTimer)
    this._tabSyncTimer = setTimeout(() => this.pushTabs(), 1500)
  }

  _startSync() {
    if (this.syncIntervalId) return
    this.syncIntervalId = setInterval(() => {
      this.pushBookmarks()
      this.pushPins()
      this.pushTabs()
      this.pushSettings()
      this.pushRecent()
      this._updatePanelLive()
    }, this.SYNC_MS)
  }

  _stopSync() {
    if (this.syncIntervalId) { clearInterval(this.syncIntervalId); this.syncIntervalId = null }
    this.syncCount      = 0
    this.lastSyncHash   = ''
    this._lastRecentHash = ''
    this.syncStatus     = { lastOk: null, lastErr: null, syncing: false }
  }

  _setSyncOk() {
    const s = this.syncStatus
    s.lastOk = Date.now()
    s.lastErr = null
    s.syncing = false
  }

  _setSyncErr(e) {
    const s = this.syncStatus
    s.lastErr = Date.now()
    s.syncing = false
  }

  _updatePanelLive() {
    if (!this.user) return
    const s = this.syncStatus
    let cls = 'acct-sync__dot syncing'
    let txt = 'Syncing…'
    if (s.lastErr) {
      cls = 'acct-sync__dot err'
      txt = 'Sync failed, will retry'
    } else if (s.lastOk) {
      cls = 'acct-sync__dot ok'
      const mins = Math.max(0, Math.round((Date.now() - s.lastOk) / 60000))
      txt = mins === 0 ? 'Synced just now' : mins < 60 ? `Synced ${mins}m ago` : `Synced ${Math.round(mins / 60)}h ago`
    }
    const pairs = [
      ['acct-sync-dot', 'acct-sync-text'],
      ['home-acct-sync-dot', 'home-acct-sync-text'],
    ]
    pairs.forEach(pair => {
      const dot = document.getElementById(pair[0])
      const text = document.getElementById(pair[1])
      if (dot) dot.className = cls
      if (text) text.textContent = txt
    })
  }

  recordRecent(entry) {
    if (!entry || !entry.type || !entry.href) return
    const item = {
      type:  String(entry.type),
      id:    entry.id ? String(entry.id) : '',
      title: String(entry.title || ''),
      sub:   entry.sub ? String(entry.sub) : '',
      href:  String(entry.href),
      ts:    Date.now(),
    }
    if (typeof historyManager !== 'undefined' && historyManager.record) {
      historyManager.record({ type: item.type, title: item.title, sub: item.sub, href: item.href })
    }
    let list = this.getRecentList().filter(i => i.href !== item.href)
    list.unshift(item)
    if (list.length > this.RECENT_MAX) list = list.slice(0, this.RECENT_MAX)
    try { localStorage.setItem(this.RECENT_KEY, JSON.stringify(list)) } catch (_) {}
    this._renderRecentPanel()
    this._renderHomePanel()
    this.pushRecent()
  }

  removeRecent(type, id) {
    if (!type) return
    this._saveRecentList(this.getRecentList().filter(i => !(i.type === type && id && i.id === id)))
  }

  removeRecentByHref(href) {
    if (!href) return
    this._saveRecentList(this.getRecentList().filter(i => i.href !== href))
  }

  _saveRecentList(list) {
    try { localStorage.setItem(this.RECENT_KEY, JSON.stringify(list)) } catch (_) {}
    this._renderRecentPanel()
    this._renderHomePanel()
    this.pushRecent()
  }

  getRecentList() {
    try {
      const raw = localStorage.getItem(this.RECENT_KEY)
      if (!raw) return []
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) return parsed.filter(i => i && typeof i.href === 'string' && i.href)
      if (parsed && parsed.href) return [parsed]
      return []
    } catch (_) { return [] }
  }

  getRecent() {
    const list = this.getRecentList()
    return list.length ? list[0] : null
  }

  _renderRecentPanel() {
    this._renderRecentInto('acct-recent', false)
  }

  _renderRecentInto(panelId, removable) {
    const panel = document.getElementById(panelId)
    if (!panel) return
    panel.querySelectorAll('.acct-recent__row').forEach(el => el.remove())
    const list = this.getRecentList()
    if (!list.length) { panel.hidden = true; return }
    panel.hidden = false
    list.slice(0, 5).forEach(recent => panel.appendChild(this._recentRow(recent, removable)))
  }

  _recentRow(recent, removable) {
    const icons = { game: 'fa-gamepad', vm: 'fa-display', media: 'fa-clapperboard', ai: 'fa-robot' }
    const row = document.createElement(removable ? 'div' : 'button')
    row.className = 'acct-recent__row'
    if (removable) {
      row.setAttribute('role', 'button')
      row.tabIndex = 0
    } else {
      row.type = 'button'
    }
    row.innerHTML =
      '<i class="fa-solid ' + (icons[recent.type] || 'fa-clock-rotate-left') + '"></i>' +
      '<span class="acct-recent__meta">' +
        '<span class="acct-recent__title"></span>' +
        '<span class="acct-recent__sub"></span>' +
      '</span>' +
      (removable
        ? '<button class="acct-recent__remove" type="button"><i class="fa-solid fa-xmark"></i></button>'
        : '<i class="fa-solid fa-arrow-right acct-recent__arrow"></i>')
    row.querySelector('.acct-recent__title').textContent = recent.title || ''
    const sub = row.querySelector('.acct-recent__sub')
    sub.textContent = recent.sub || ''
    sub.hidden = !recent.sub
    const go = () => {
      if (recent.href && typeof navigate === 'function') navigate(recent.href)
    }
    row.addEventListener('click', (e) => {
      if (e.target.closest && e.target.closest('.acct-recent__remove')) return
      go()
    })
    if (!removable) return row
    row.addEventListener('keydown', (e) => {
      if (e.target !== row || (e.key !== 'Enter' && e.key !== ' ')) return
      e.preventDefault()
      go()
    })
    const remove = row.querySelector('.acct-recent__remove')
    remove.title = 'Remove from this list'
    remove.setAttribute('aria-label', 'Remove ' + (recent.title || 'this item') + ' from Continue From Where You Left Off')
    remove.addEventListener('click', (e) => {
      e.stopPropagation()
      this.removeRecentByHref(recent.href)
    })
    return row
  }

  _renderHomePanel() {
    const panel = document.getElementById('home-acct-panel')
    if (!panel) return
    const signedEl = document.getElementById('home-acct-signed')
    const signinTextEl = document.getElementById('home-acct-signin-text')
    const avatarEl = document.getElementById('home-acct-avatar')
    const subEl = document.getElementById('home-acct-signin-sub')
    const ctaEl = document.getElementById('home-acct-signin-cta')
    if (!signedEl || !signinTextEl || !subEl || !ctaEl) return
    panel.classList.toggle('has-account', !!this.user)
    if (!this.user) {
      this._stopGreetingRoll()
      signedEl.hidden = true
      if (avatarEl) avatarEl.hidden = true
      signinTextEl.hidden = false
      signinTextEl.style.minHeight = ''
      signinTextEl.innerHTML = HOME_SIGNIN_TITLE
      subEl.hidden = false
      ctaEl.hidden = false
      this._bindHomeSignIn()
      return
    }
    signinTextEl.hidden = false
    this._setHomeGreeting(signinTextEl, this._greetingTemplate(), this._firstName(), false)
    this._fitGreetingHeight(signinTextEl, this._firstName())
    this._startGreetingRoll()
    if (avatarEl) {
      avatarEl.hidden = false
      this._paintAvatar(avatarEl, this.user.displayName || firstName)
      if (!this._avatarPhoto()) this._applyGravatar()
    }
    subEl.hidden = false
    subEl.textContent = ''
    ctaEl.hidden = true
    signedEl.hidden = false
    this._renderHomeRecent()
    this._bindHomeSignOut()
    this._updatePanelLive()
  }

  _renderHomeRecent() {
    this._renderRecentInto('home-acct-recent', true)
  }

  _bindHomeSignIn() {
    const btn = document.getElementById('home-acct-signin-cta')
    if (!btn || this._homeSignInBound) return
    this._homeSignInBound = true
    btn.addEventListener('click', () => {
      if (typeof openAccountDialog === 'function') openAccountDialog()
    })
  }

  _bindHomeSignOut() {
    const btn = document.getElementById('home-acct-signout')
    if (!btn || this._homeSignOutBound) return
    this._homeSignOutBound = true
    btn.addEventListener('click', () => { this.signOut() })
  }

  async pushRecent() {
    if (!this.user) return
    const recent = this.getRecentList()
    const hash = JSON.stringify(recent)
    if (hash === this._lastRecentHash) return
    try {
      await PlutoniumStore.setDoc('recent', { recent, lastSync: new Date() })
      this._lastRecentHash = hash
      this._setSyncOk()
    } catch (e) {
      console.warn('[Account] Recent push failed:', e)
      this._setSyncErr(e)
    }
  }

  async pullRecent() {
    if (!this.user) return
    try {
      const doc = await PlutoniumStore.getDoc('recent')
      const remote = doc && doc.recent
      if (!remote) return
      let list
      if (Array.isArray(remote)) list = remote.filter(i => i && typeof i.href === 'string' && i.href)
      else if (remote && remote.href) list = [remote]
      else return
      if (!list.length) return
      localStorage.setItem(this.RECENT_KEY, JSON.stringify(list))
      this._renderRecentPanel()
      this._renderHomePanel()
    } catch (e) {
      console.warn('[Account] Recent pull failed:', e)
    }
  }

  _bindSignOut() {
    if (this._signOutBound) return
    this._signOutBound = true
    const el = document.getElementById('acct-signout')
    if (el) el.addEventListener('click', () => { this.signOut() })
  }

  _bindDeleteAccount() {
    if (this._deleteBound) return
    this._deleteBound = true
    const el = document.getElementById('acct-delete')
    const label = el ? el.querySelector('.acct-delete__label') : null
    if (!el || !label) return
    let armed = false
    let timer = null
    const reset = () => {
      armed = false
      clearTimeout(timer)
      el.classList.remove('armed')
      el.disabled = false
      label.textContent = 'Delete account'
    }
    this._deleteReset = reset
    el.addEventListener('click', async () => {
      if (!armed) {
        armed = true
        el.classList.add('armed')
        label.textContent = 'Click again to permanently delete'
        timer = setTimeout(reset, 4000)
        return
      }
      reset()
      el.disabled = true
      label.textContent = 'Deleting…'
      try {
        await this.deleteAccount()
        reset()
      } catch (e) {
        label.textContent = 'Delete failed, try again'
        setTimeout(reset, 2500)
      }
    })
  }

  async changePassword(newPassword) {
    if (typeof PlutoniumStore !== 'undefined') await PlutoniumStore.changePassword(newPassword)
  }

  async getProviders() {
    if (typeof PlutoniumStore !== 'undefined') return PlutoniumStore.getProviders()
    return []
  }

  async unlinkProvider(providerId) {
    if (typeof PlutoniumStore !== 'undefined') await PlutoniumStore.unlinkProvider(providerId)
  }

  async linkWithOAuth(provider) {
    if (typeof PlutoniumStore !== 'undefined') await PlutoniumStore.linkWithOAuth(provider)
  }

  _renderProfile() {
    const avatar = document.getElementById('acct-avatar')
    const nameEl = document.getElementById('acct-display-name')
    const emailEl = document.getElementById('acct-profile-email')
    if (!nameEl || !emailEl) return
    const name = this.user.displayName || (this.user.email || '').split('@')[0] || 'User'
    nameEl.textContent = name
    emailEl.textContent = this.user.email || ''
    this._paintAvatar(avatar, name)
    this._paintAvatar(document.getElementById('home-acct-avatar'), name)
    if (!this._avatarPhoto()) this._applyGravatar()
    this._bindNameEdit()
    this._bindAvatarUpload()
  }

  async _pullAvatar() {
    if (!this.user || !this.user.uid) return
    const cached = localStorage.getItem(this.AVATAR_KEY + this.user.uid)
    if (cached) {
      this.photoDataUrl = cached
      this._renderProfile()
    }
    try {
      if (typeof PlutoniumStore !== 'undefined') {
        const doc = await PlutoniumStore.getDoc('profile_photo')
        if (doc && doc.dataUrl) {
          this.photoDataUrl = doc.dataUrl
          try { localStorage.setItem(this.AVATAR_KEY + this.user.uid, doc.dataUrl) } catch (_) {}
          this._renderProfile()
        }
      }
    } catch (_) {}
  }

  _loadGreetings() {
    if (this._greetingsReq) return this._greetingsReq
    this._greetingsReq = fetch('data/greetings.json')
      .then(r => (r.ok ? r.json() : null))
      .catch(() => null)
      .then(data => {
        if (data && typeof data === 'object') this.greetings = data
        if (this.user) this._renderHomePanel()
        return this.greetings
      })
    return this._greetingsReq
  }

  _firstName() {
    const raw = (this.user && (this.user.displayName || (this.user.email || '').split('@')[0])) || 'there'
    return raw.split(/\s+/)[0] || 'there'
  }

  _greetingTemplate() {
    const fallback = 'Welcome back, ' + GREETING_NAME_TOKEN + '.'
    if (!this.greetings) {
      this._loadGreetings()
      return fallback
    }
    const hour = new Date().getHours()
    const list = this.greetings[String(hour)]
    if (!Array.isArray(list) || !list.length) return fallback
    if (this._greeting.hour !== hour) this._greeting = { hour, index: 0 }
    return String(list[this._greeting.index % list.length] || list[0])
  }

  // The greeting rolls every 5s through the current hour's pool, and those lines don't all wrap
  // to the same number of rows. Reserve the tallest row count the current pool can produce (in
  // px, measured on the live element so wrapping matches exactly) so the block underneath the
  // greeting - sync state, recent list, sign out - never nudges up and down mid-roll. Pools that
  // happen to be uniform stay at their natural height instead of carrying a fixed two-row gap.
  _fitGreetingHeight(el, name) {
    if (!this._greetFitBound) {
      this._greetFitBound = true
      window.addEventListener('resize', () => {
        clearTimeout(this._greetFitTimer)
        this._greetFitTimer = setTimeout(() => {
          this._fitGreetingHeight(document.getElementById('home-acct-signin-text'), this._firstName())
        }, 150)
      })
    }
    if (!el) return
    if (el.hidden) {
      el.style.minHeight = ''
      return
    }
    const list = this.greetings && this.greetings[String(new Date().getHours())]
    if (!el.getBoundingClientRect().width || !Array.isArray(list) || list.length < 2) {
      el.style.minHeight = ''
      return
    }
    const vis = el.style.visibility
    el.style.minHeight = '0'
    el.style.visibility = 'hidden'
    let tallest = 0
    for (const tpl of list) {
      const { raw, at, before, after } = this._splitGreeting(tpl)
      el.textContent = ''
      if (at < 0) el.textContent = raw
      else el.append(...this._greetingNodes(before, name, after))
      tallest = Math.max(tallest, el.getBoundingClientRect().height)
    }
    el.style.visibility = vis
    el.style.minHeight = tallest ? Math.ceil(tallest) + 'px' : ''
    // The measuring pass left plain text behind, so re-render the current line from a clean base.
    this._greetingParts = null
    this._setHomeGreeting(el, this._greetingTemplate(), name, false)
  }

  _startGreetingRoll() {
    if (this._greetingTimer) return
    this._greetingTimer = setInterval(() => this._rollGreeting(), 5000)
  }

  _stopGreetingRoll() {
    if (!this._greetingTimer) return
    clearInterval(this._greetingTimer)
    this._greetingTimer = null
  }

  _rollGreeting() {
    if (document.hidden || !this.user || !this.greetings) return
    const hour = new Date().getHours()
    const list = this.greetings[String(hour)]
    if (!Array.isArray(list) || !list.length) return
    const newHour = this._greeting.hour !== hour
    if (newHour) this._greeting = { hour, index: 0 }
    else this._greeting.index = (this._greeting.index + 1) % list.length
    const el = document.getElementById('home-acct-signin-text')
    if (el) this._setHomeGreeting(el, this._greetingTemplate(), this._firstName(), true)
    // A new hour means a new pool, so its tallest line may be a different number of rows.
    if (newHour) this._fitGreetingHeight(el, this._firstName())
  }

  // Split a greeting template around its {name} token. Whitespace hugging the token is dropped
  // so the two halves stack cleanly without a dangling gap.
  _splitGreeting(template) {
    const raw = String(template == null ? '' : template)
    const at = raw.indexOf(GREETING_NAME_TOKEN)
    const before = (at < 0 ? raw : raw.slice(0, at)).replace(/\s+$/, '')
    const after = at < 0 ? '' : raw.slice(at + GREETING_NAME_TOKEN.length).replace(/^\s+/, '')
    return { raw, at, before, after }
  }

  // The name always starts its own line: the greeting phrase sits on the first line, a <br>
  // separates them, and trailing punctuation stays glued to the name on the second line.
  _greetingNodes(before, name, after) {
    const nodes = []
    if (before) nodes.push(document.createTextNode(before), document.createElement('br'))
    nodes.push(document.createTextNode(name))
    if (after) nodes.push(document.createTextNode(after))
    return nodes
  }

  // Crossfade from the previous greeting to the next one. Both phrases sit in the same grid
  // cell so they overlap exactly, fade on opacity only (compositor-friendly), and the name is
  // rendered once outside the stacks - so it never ghosts, fades or moves. The outgoing layer
  // is taken out of flow (see .shuffle-layer--out) so only the incoming text has any width:
  // the animated layout then wraps exactly like the settled plain text, which is what
  // _fitGreetingHeight reserved space for. A layer in flow would widen the line mid-fade and
  // bump everything below the greeting down a row until it settled again.
  _setHomeGreeting(el, template, name, animate) {
    if (!el) return
    const who = name || 'there'
    const { raw, at, before, after } = this._splitGreeting(template)

    if (at < 0) {
      el.textContent = raw
      this._greetingParts = { before, after }
      return
    }

    if (!animate || prefersReducedMotion() || typeof el.animate !== 'function') {
      el.textContent = ''
      el.append(...this._greetingNodes(before, who, after))
      this._greetingParts = { before, after }
      return
    }

    const prev = this._greetingParts
    el.textContent = ''
    const running = []
    const stacks = []

    const addChunk = (oldText, newText) => {
      if (!prev || !oldText || oldText === newText) {
        el.appendChild(document.createTextNode(newText))
        return
      }
      const wrap = document.createElement('span')
      wrap.className = 'shuffle-stack'
      const out = document.createElement('span')
      out.className = 'shuffle-layer shuffle-layer--out'
      out.textContent = oldText
      out.setAttribute('aria-hidden', 'true')
      const inn = document.createElement('span')
      inn.className = 'shuffle-layer'
      inn.textContent = newText
      wrap.appendChild(out)
      wrap.appendChild(inn)
      el.appendChild(wrap)
      stacks.push({ wrap, text: newText })
      running.push(
        out.animate(
          [{ opacity: 1 }, { opacity: 0 }],
          { duration: FADE_OUT_MS, easing: 'ease-out', fill: 'forwards' }
        ),
        inn.animate(
          [{ opacity: 0 }, { opacity: 1 }],
          { duration: FADE_IN_MS, delay: FADE_DELAY_MS, easing: 'ease-out', fill: 'both' }
        )
      )
    }

    addChunk(prev ? prev.before : '', before)
    el.appendChild(document.createElement('br'))
    const nameEl = document.createElement('span')
    nameEl.className = 'shuffle-name'
    nameEl.textContent = who
    el.appendChild(nameEl)
    addChunk(prev ? prev.after : '', after)

    this._greetingParts = { before, after }
    if (!running.length) return

    // Collapse the stacks back to plain text once the fade has played, so the line keeps
    // its natural width (and the next crossfade has a clean plain-text starting point).
    Promise.all(running.map(a => a.finished.catch(() => null))).then(() => {
      stacks.forEach(({ wrap, text }) => {
        if (wrap.isConnected) wrap.replaceWith(document.createTextNode(text))
      })
    })
  }

  _avatarPhoto() {
    if (!this.user) return ''
    return this.photoDataUrl || this.user.photoURL || this.gravatarUrl || ''
  }

  _paintAvatar(el, name) {
    if (!el || !this.user) return
    const photo = this._avatarPhoto()
    if (photo) {
      el.style.backgroundImage = `url('${photo}')`
      el.classList.add('has-photo')
      el.innerHTML = ''
      return
    }
    el.style.backgroundImage = ''
    el.classList.remove('has-photo')
    const initials = (name || '').split(/\s+/).map(w => w[0] || '').slice(0, 2).join('').toUpperCase()
    el.innerHTML = `<span>${initials || 'U'}</span>`
  }

  _applyGravatar() {
    if (this._gravatarTried) return
    this._gravatarTried = true
    if (!this.user) return
    const email = (this.user.email || '').trim().toLowerCase()
    const uid = this.user.uid
    if (!email || !uid) return
    const flag = localStorage.getItem('plu_gravatar_' + uid)
    if (flag === '0') return
    const apply = src => {
      if (this.photoDataUrl || this.user.photoURL) return
      this.gravatarUrl = src
      const name = this.user.displayName || (this.user.email || '').split('@')[0] || 'User'
      this._paintAvatar(document.getElementById('acct-avatar'), name)
      this._paintAvatar(document.getElementById('home-acct-avatar'), name)
    }
    crypto.subtle.digest('SHA-256', new TextEncoder().encode(email))
      .then(buf => Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join(''))
      .then(hash => {
        const img = new Image()
        img.onload = () => {
          try { localStorage.setItem('plu_gravatar_' + uid, '1') } catch (_) {}
          apply(`https://www.gravatar.com/avatar/${hash}?d=404&s=256`)
        }
        img.onerror = () => {
          try { localStorage.setItem('plu_gravatar_' + uid, '0') } catch (_) {}
        }
        img.src = `https://www.gravatar.com/avatar/${hash}?d=404&s=256`
      })
      .catch(() => {})
  }

  _bindAvatarUpload() {
    const btn = document.getElementById('acct-change-photo')
    const input = document.getElementById('acct-photo-input')
    if (!btn || !input || this._avatarBound) return
    this._avatarBound = true
    btn.addEventListener('click', () => input.click())
    input.addEventListener('change', () => {
      const file = input.files && input.files[0]
      input.value = ''
      if (!file || !file.type.startsWith('image/')) return
      const img = new Image()
      const url = URL.createObjectURL(file)
      img.onload = () => {
        URL.revokeObjectURL(url)
        try {
          const size = 256
          const canvas = document.createElement('canvas')
          canvas.width = size
          canvas.height = size
          const ctx = canvas.getContext('2d')
          if (!ctx) return
          const min = Math.min(img.width, img.height)
          const sx = (img.width - min) / 2
          const sy = (img.height - min) / 2
          ctx.drawImage(img, sx, sy, min, min, 0, 0, size, size)
          let dataUrl
          try { dataUrl = canvas.toDataURL('image/webp', 0.82) } catch (_) {}
          if (!dataUrl || dataUrl.length > 90000) dataUrl = canvas.toDataURL('image/jpeg', 0.8)
          this.photoDataUrl = dataUrl
          if (this.user && this.user.uid) {
            try { localStorage.setItem(this.AVATAR_KEY + this.user.uid, dataUrl) } catch (_) {}
          }
          this._renderProfile()
          if (typeof PlutoniumStore !== 'undefined' && this.user) {
            PlutoniumStore.setDoc('profile_photo', { dataUrl, lastSync: new Date() }).catch(() => {})
          }
        } catch (_) {}
      }
      img.onerror = () => URL.revokeObjectURL(url)
      img.src = url
    })
  }

  _bindNameEdit() {
    const btn = document.getElementById('acct-edit-name')
    const wrap = document.querySelector('.acct-profile-name')
    if (!btn || !wrap || this._nameEditBound) return
    this._nameEditBound = true
    btn.addEventListener('click', () => {
      const textEl = document.getElementById('acct-display-name')
      if (!textEl) return
      const input = document.createElement('input')
      input.className = 'acct-name-input'
      input.type = 'text'
      input.maxLength = 40
      input.value = textEl.textContent
      wrap.replaceChild(input, textEl)
      btn.hidden = true
      input.focus()
      input.select()
      let done = false
      const commit = async save => {
        if (done) return
        done = true
        if (save) {
          const val = input.value.trim()
          if (val && val !== this.user.displayName) {
            try {
              if (typeof PlutoniumStore !== 'undefined') {
                await PlutoniumStore.updateProfile(val)
                this.user.displayName = val
              }
            } catch (_) {}
          }
        }
        wrap.replaceChild(textEl, input)
        this._renderProfile()
        btn.hidden = false
      }
      input.addEventListener('keydown', e => {
        if (e.key === 'Enter') commit(true)
        else if (e.key === 'Escape') commit(false)
      })
      input.addEventListener('blur', () => commit(true))
    })
  }

  _renderProviders() {
    const box = document.getElementById('acct-providers')
    const passSection = document.getElementById('acct-password-section')
    const passSave = document.getElementById('acct-pass-save')
    if (!box) return
    const providers = [
      { id: 'password',   label: 'Email & password', icon: 'fa-envelope' },
      { id: 'google.com', label: 'Google',           icon: 'fa-google' },
      { id: 'github.com', label: 'GitHub',           icon: 'fa-github' },
    ]
    const render = list => {
      box.innerHTML = ''
      const linked = new Set((list || []).map(p => p.providerId))
      if (passSection) passSection.hidden = !linked.has('password')
      if (passSave) passSave.textContent = linked.has('password') ? 'Update password' : 'Set password'
      const single = (list || []).length <= 1
      providers.forEach(p => {
        const row = document.createElement('div')
        row.className = 'acct-provider-row'
        const icon = document.createElement('i')
        icon.className = `fa-brands ${p.icon} acct-provider-row__icon`
        const name = document.createElement('span')
        name.className = 'acct-provider-row__name'
        name.textContent = p.label
        const action = document.createElement('button')
        action.type = 'button'
        action.className = 'acct-provider-row__action'
        if (linked.has(p.id)) {
          if (!single) {
            action.classList.add('can-unlink')
            action.textContent = 'Unlink'
            action.addEventListener('click', async () => {
              action.disabled = true
              action.textContent = '…'
              try {
                await this.unlinkProvider(p.id)
                render(await this.getProviders())
              } catch (e) {
                action.disabled = false
                action.textContent = 'Failed'
                setTimeout(() => { action.textContent = 'Unlink' }, 1800)
              }
            })
          } else {
            action.textContent = 'Linked'
          }
        } else {
          action.textContent = p.id === 'password' ? 'Set' : 'Link'
          action.addEventListener('click', async () => {
            if (p.id === 'password') {
              if (passSection) passSection.hidden = false
              const input = document.getElementById('acct-new-pass')
              if (input) input.focus()
              return
            }
            action.disabled = true
            action.textContent = 'Linking…'
            try {
              await this.linkWithOAuth(p.id.replace('.com', ''))
              render(await this.getProviders())
            } catch (e) {
              action.disabled = false
              action.textContent = 'Failed'
              setTimeout(() => { action.textContent = 'Link' }, 1800)
            }
          })
        }
        row.appendChild(icon)
        row.appendChild(name)
        row.appendChild(action)
        box.appendChild(row)
      })
    }
    this.getProviders().then(render).catch(() => render([]))
  }

  _bindPasswordForm() {
    const btn = document.getElementById('acct-pass-save')
    const input = document.getElementById('acct-new-pass')
    const err = document.getElementById('acct-pass-error')
    if (!btn || !input || !err || this._passBound) return
    this._passBound = true
    const submit = async () => {
      const val = input.value
      err.textContent = ''
      err.classList.remove('ok')
      if (!val || val.length < 6) { err.textContent = 'Password must be at least 6 characters.'; return }
      btn.disabled = true
      btn.textContent = 'Saving…'
      try {
        await this.changePassword(val)
        input.value = ''
        err.classList.add('ok')
        err.textContent = 'Password updated.'
        btn.textContent = 'Saved'
        this._renderProviders()
      } catch (e) {
        err.classList.remove('ok')
        err.textContent = 'Could not update password.'
        btn.textContent = 'Try again'
      }
      btn.disabled = false
      setTimeout(() => { btn.textContent = 'Update password' }, 2200)
    }
    btn.addEventListener('click', submit)
    input.addEventListener('keydown', e => { if (e.key === 'Enter') submit() })
  }

  async _renderQuota() {
    const el = document.getElementById('acct-quota')
    if (!el) return
    el.textContent = 'Loading…'
    const usage = await fetchAIUsage()
    if (!usage) { el.textContent = 'AI usage unavailable'; return }
    const pct = Math.max(0, Math.min(100, Math.round((usage.remaining / usage.max) * 100)))
    el.innerHTML =
      `<span class="acct-quota__track"><span class="acct-quota__bar" style="width:${pct}%"></span></span>` +
      `<span class="acct-quota__text">${usage.remaining} of ${usage.max} AI requests left in this window</span>`
  }

  _bindExport() {
    const btn = document.getElementById('acct-export')
    if (!btn || this._exportBound) return
    this._exportBound = true
    btn.addEventListener('click', () => {
      const grab = key => { try { return JSON.parse(localStorage.getItem(key)) } catch (_) { return null } }
      const data = {
        exportedAt: new Date().toISOString(),
        account: {
          email:       this.user?.email || '',
          displayName: this.user?.displayName || '',
        },
        bookmarks: grab(this.BM_KEY),
        pins:      grab(this.PINS_KEY),
        tabs:      grab(this.TABS_KEY),
        recent:    grab(this.RECENT_KEY),
        history:   grab('plu_history'),
        aiChats:   grab('plu_ai_chats'),
        games:     grab('plu_games_data'),
        settings: {
          theme:       localStorage.getItem('plu_theme') || null,
          proxyEngine: localStorage.getItem('plu_net_mode') || localStorage.getItem('plu_proxy_engine') || null,
          wispServer:  localStorage.getItem('plu_relay_server') || localStorage.getItem('plu_wisp_server') || null,
          onboarded:   localStorage.getItem('plu_onboarded') || null,
        },
      }
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `plutonium-account-data-${new Date().toISOString().slice(0, 10)}.json`
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(a.href), 2000)
    })
  }

  _bindForgotPassword() {
    const btn = document.getElementById('acct-forgot')
    const emailEl = document.getElementById('acct-email-input')
    const errEl = document.getElementById('acct-error')
    if (!btn || this._forgotBound) return
    this._forgotBound = true
    btn.addEventListener('click', async () => {
      const email = emailEl ? emailEl.value.trim() : ''
      if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
        if (errEl) { errEl.classList.remove('ok'); errEl.textContent = 'Enter your account email first.' }
        if (emailEl) emailEl.focus()
        return
      }
      if (errEl) errEl.textContent = ''
      btn.disabled = true
      btn.textContent = 'Sending…'
      try {
        if (typeof PlutoniumStore !== 'undefined') await PlutoniumStore.resetPassword(email)
        if (errEl) { errEl.classList.add('ok'); errEl.textContent = 'Reset email sent — check your inbox.' }
        btn.textContent = 'Sent ✓'
      } catch (e) {
        if (errEl) { errEl.classList.remove('ok'); errEl.textContent = 'Could not send reset email.' }
        btn.textContent = 'Forgot password?'
      }
      btn.disabled = false
    })
  }

  async signOut() {
    await this.pushBookmarks()
    await this.pushPins()
    await this.pushTabs()
    this._stopSync()
    this.isGuest = false
    if (typeof PlutoniumStore !== 'undefined') {
      await PlutoniumStore.signOut().catch(() => {})
    }
    this.user = null
    this.photoDataUrl = null
    this.gravatarUrl = null
    this._gravatarTried = false
    this._stopGreetingRoll()
    this._greeting = { hour: null, index: 0 }
    this._greetingParts = null
  }

  async deleteAccount() {
    if (typeof PlutoniumStore !== 'undefined') {
      await PlutoniumStore.deleteAccount()
    }
  }

  async resetPassword(email) {
    if (typeof PlutoniumStore !== 'undefined') {
      await PlutoniumStore.resetPassword(email)
    }
  }

  showAuthPrompt() {
    this.isGuest = false
    if (typeof showNewTabPage === 'function') showNewTabPage()
    if (typeof openAccountDialog === 'function') openAccountDialog()
    else {
      const email = document.getElementById('acct-email-input')
      if (email) setTimeout(() => email.focus(), 60)
    }
  }

  wireAuthForm() {
    if (this._authFormBound) return
    this._authFormBound = true
    const nameEl = document.getElementById('acct-name-input')
    const nameField = nameEl ? nameEl.parentElement : null
    const emailEl = document.getElementById('acct-email-input')
    const passEl = document.getElementById('acct-password-input')
    const errorEl = document.getElementById('acct-error')
    const toggleEl = document.getElementById('acct-toggle')
    const submitEl = document.getElementById('acct-auth-submit')
    if (!nameEl || !nameField || !emailEl || !passEl || !errorEl || !toggleEl) return

    let isSignUp = false
    const setMode = up => {
      isSignUp = up
      nameField.hidden = !up
      toggleEl.textContent = up ? 'Already have an account? Sign in' : 'No Account? Make a free one!'
      errorEl.textContent = ''
      if (submitEl) submitEl.textContent = up ? 'Sign Up' : 'Sign In'
    }
    setMode(false)
    toggleEl.addEventListener('click', () => setMode(!isSignUp))

    const googleBtn = document.getElementById('acct-google-btn')
    const githubBtn = document.getElementById('acct-github-btn')
    const oauth = provider => {
      errorEl.textContent = ''
      PlutoniumStore.signInWithOAuth(provider).catch(e => { errorEl.textContent = this._authErrorMessage(e) })
    }
    if (googleBtn) googleBtn.addEventListener('click', () => oauth('google'))
    if (githubBtn) githubBtn.addEventListener('click', () => oauth('github'))

    const trySignIn = async () => {
      const email = emailEl.value.trim()
      const pass = passEl.value
      const name = nameEl.value.trim()
      errorEl.textContent = ''
      if (!email || !pass) { errorEl.textContent = 'Enter your email and password.'; return }
      if (isSignUp && !name) { errorEl.textContent = 'Please enter your name.'; return }
      if (submitEl) {
        submitEl.disabled = true
        submitEl.textContent = isSignUp ? 'Creating account…' : 'Signing in…'
      }
      try {
        if (isSignUp) await PlutoniumStore.signUp(email, pass, name)
        else await PlutoniumStore.signInWithEmail(email, pass)
      } catch (e) {
        if (submitEl) {
          submitEl.disabled = false
          submitEl.textContent = isSignUp ? 'Sign Up' : 'Sign In'
        }
        errorEl.textContent = this._authErrorMessage(e)
      }
    }
    emailEl.addEventListener('keydown', e => { if (e.key === 'Enter') trySignIn() })
    passEl.addEventListener('keydown', e => { if (e.key === 'Enter') trySignIn() })
    nameEl.addEventListener('keydown', e => { if (e.key === 'Enter') trySignIn() })
    if (submitEl) submitEl.addEventListener('click', trySignIn)
  }
}

const accountManager = new AccountManager()
window.accountManager = accountManager

async function fetchAIUsage() {
  try {
    const token = (typeof PlutoniumStore !== 'undefined' && PlutoniumStore.currentUser) ? PlutoniumStore.currentUser.idToken : ''
    const res = await fetch('https://ai.cdn.plutoniumnet.work/ratelimit', { headers: { Authorization: `Bearer ${token}` } })
    if (!res.ok) return null
    const d = await res.json()
    if (d && typeof d.remaining === 'number' && typeof d.max === 'number') return { remaining: d.remaining, max: d.max }
    return null
  } catch (_) { return null }
}
window.fetchAIUsage = fetchAIUsage
