/**
 * Plutonium account manager.
 * Auth + cloud sync via PlutoniumStore (accounting.cdn.plutoniumnet.work).
 * Bookmarks / pins / tabs are synced to Firestore docs under users/{uid}.
 * Keeps the window.accountManager API surface used by bookmarks.js,
 * pins.js and tabs.js.
 */
class AccountManager {
  constructor() {
    this.BM_KEY      = 'plu_bookmarks'
    this.PINS_KEY    = 'plu_pins'
    this.TABS_KEY    = 'plu_tabs'
    this.RECENT_KEY  = 'plu_recent'
    this.SYNC_MS     = 8000

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

  // ── One-time migration from the old crafted-gamz keys ─────────────────────
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

  // ── Profile ────────────────────────────────────────────────────────────────

  async getUserProfile() {
    if (!this.user) return null
    return {
      name:   this.user.displayName || this.user.email.split('@')[0],
      email:  this.user.email,
      photoURL: this.user.photoURL || null,
    }
  }

  // ── Bookmarks ──────────────────────────────────────────────────────────────

  _renderAccountPanel() {
    const greetingEl = document.getElementById('acct-name-text')
    const signinEl = document.getElementById('acct-signin-text')
    const subEl = document.getElementById('acct-signin-sub')
    const fieldsEl = document.getElementById('acct-signin-fields')
    const signedEl = document.getElementById('acct-signed')
    if (!greetingEl || !signinEl || !subEl || !fieldsEl || !signedEl) return
    if (!this.user) {
      greetingEl.hidden = true
      signinEl.hidden = false
      subEl.hidden = false
      fieldsEl.hidden = false
      signedEl.hidden = true
      this._bindSignInButton()
      return
    }
    signinEl.hidden = true
    subEl.hidden = true
    fieldsEl.hidden = true
    signedEl.hidden = false
    this._bindSignOut()
    this._renderRecentPanel()
    this._updatePanelLive()
    const name = this.user.displayName || (this.user.email || '').split('@')[0] || ''
    if (this._greetings) {
      greetingEl.textContent = this._greetingFor(name)
      greetingEl.hidden = false
    } else if (!this._greetingsLoading) {
      this._greetingsLoading = true
      fetch('data/greetings.json')
        .then(r => { if (!r.ok) throw new Error('greetings fetch failed'); return r.json() })
        .then(g => {
          this._greetings = g
          if (this.user) { greetingEl.textContent = this._greetingFor(name); greetingEl.hidden = false }
        })
        .catch(() => { greetingEl.textContent = name; greetingEl.hidden = false })
    }
  }

  _greetingFor(name) {
    const hour = String(new Date().getHours())
    const pool = (this._greetings && this._greetings[hour]) || []
    const line = pool[Math.floor(Math.random() * pool.length)] || ''
    return line.replace(/\{name\}/g, name)
  }

  _bindSignInButton() {
    if (this._signInBound) return
    this._signInBound = true
    // The home panel renders the sign-in form in-page; wiring is shared with
    // the onboarding welcome step via wireAuthForm().
    this.wireAuthForm()
  }

  _authErrorMessage(e) {
    const msgs = {
      // Firebase SDK codes
      'auth/invalid-email':          'Invalid email address.',
      'auth/user-not-found':         'No account found with that email.',
      'auth/wrong-password':         'Incorrect password.',
      'auth/invalid-credential':     'Wrong email or password.',
      'auth/email-already-in-use':   'That email is already in use.',
      'auth/weak-password':          'Password must be at least 6 characters.',
      'auth/too-many-requests':      'Too many attempts. Try again later.',
      'auth/user-disabled':          'This account has been disabled.',
      'auth/operation-not-allowed':  'Email/password sign-in is not available.',
      'auth/network-request-failed': 'Network error — check your connection.',
      'auth/popup-closed-by-user':   'Sign-in popup was closed.',
      // Firebase REST codes (returned by the gateway worker)
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
      // Union by url: cloud ordering wins, keep local-only bookmarks
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

  // ── Pins ───────────────────────────────────────────────────────────────────

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
      // Union by id: cloud ordering wins, keep local-only pins
      const remoteIds = new Set(remote.map(p => p.id))
      const localOnly = (this._getPins() || []).filter(p => !remoteIds.has(p.id))
      this._setPins([...remote, ...localOnly])
    } catch (e) {
      console.warn('[Account] Pin pull failed:', e)
    }
  }

  // ── Settings (theme / browsing engine / relay) ────────────────────────

  _getSettings() {
    const out = {}
    try {
      const theme = localStorage.getItem('plu_theme')
      if (theme) out.theme = theme
      const mode = localStorage.getItem('plu_net_mode') || localStorage.getItem('plu_proxy_engine')
      if (mode) out.proxyEngine = mode
      const relay = localStorage.getItem('plu_relay_server') || localStorage.getItem('plu_wisp_server')
      if (relay) out.wispServer = relay
      // First-run onboarding completion flag — rides the settings sync so it
      // follows the user across devices.
      if (localStorage.getItem('plu_onboarded')) out.onboarded = true
      // bgImage is embedded in the plu_theme JSON but also stored as a
      // top-level field so the pull side can merge it even when the
      // remote plu_theme predates the bgImage feature.
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
      // account.js may load before theme-state.js / net.js — retry once
      const ready = window.BrowserThemeState && window.setNetEngine && window.switchRelayServer
      if (!ready) {
        setTimeout(() => this.pullSettings(), 2500)
        return
      }
      if (doc.theme && window.BrowserThemeState.saveThemeState) {
        try {
          const parsed = JSON.parse(doc.theme)
          // Explicitly pull bgImage so it syncs across devices
          if (doc.bgImage !== undefined) parsed.bgImage = doc.bgImage
          window.BrowserThemeState.saveThemeState(parsed)
        } catch (_) {}
      }
      // Migrate pre-rename engine values stored on the remote doc.
      const legacyMode = { uv: 'core', sj: 'runtime', hb: 'remote' }
      if (doc.proxyEngine) window.setNetEngine(legacyMode[doc.proxyEngine] || doc.proxyEngine)
      if (doc.wispServer) window.switchRelayServer(doc.wispServer)
      // Onboarding flag: once the account says it's done it is never cleared
      // locally, so an older remote doc can't re-trigger onboarding.
      if (doc.onboarded) localStorage.setItem('plu_onboarded', '1')
    } catch (e) {
      console.warn('[Account] Settings pull failed:', e)
    }
  }

  // ── Tabs ───────────────────────────────────────────────────────────────────

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

  // ── Sync loop ──────────────────────────────────────────────────────────────

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
    const dot = document.getElementById('acct-sync-dot')
    const text = document.getElementById('acct-sync-text')
    if (dot && text) {
      if (s.lastErr) {
        dot.className = 'acct-sync__dot err'
        text.textContent = 'Sync failed — will retry'
      } else if (s.lastOk) {
        dot.className = 'acct-sync__dot ok'
        const mins = Math.max(0, Math.round((Date.now() - s.lastOk) / 60000))
        text.textContent = mins === 0 ? 'Synced just now' : mins < 60 ? `Synced ${mins}m ago` : `Synced ${Math.round(mins / 60)}h ago`
      } else {
        dot.className = 'acct-sync__dot syncing'
        text.textContent = 'Syncing…'
      }
    }
  }

  // ── Recent activity (Continue From Where You Left Off) ────────────────────

  recordRecent(entry) {
    if (!entry || !entry.type) return
    const recent = {
      type:  String(entry.type),
      title: String(entry.title || ''),
      sub:   entry.sub ? String(entry.sub) : '',
      href:  String(entry.href || ''),
      ts:    Date.now(),
    }
    try { localStorage.setItem(this.RECENT_KEY, JSON.stringify(recent)) } catch (_) {}
    this._renderRecentPanel()
    this.pushRecent()
  }

  getRecent() {
    try { return JSON.parse(localStorage.getItem(this.RECENT_KEY)) || null } catch (_) { return null }
  }

  _renderRecentPanel() {
    const row = document.getElementById('acct-recent')
    if (!row) return
    const recent = this.getRecent()
    if (!recent || !recent.href) { row.hidden = true; return }
    row.hidden = false
    const icon  = document.getElementById('acct-recent-icon')
    const title = document.getElementById('acct-recent-title')
    const sub   = document.getElementById('acct-recent-sub')
    const icons = { game: 'fa-gamepad', vm: 'fa-display', media: 'fa-clapperboard', ai: 'fa-robot' }
    if (icon)  icon.className = 'fa-solid ' + (icons[recent.type] || 'fa-clock-rotate-left')
    if (title) title.textContent = recent.title
    if (sub)   { sub.textContent = recent.sub; sub.hidden = !recent.sub }
    if (!this._recentBound) {
      this._recentBound = true
      row.addEventListener('click', () => {
        const r = this.getRecent()
        if (r && r.href && typeof navigate === 'function') navigate(r.href)
      })
    }
  }

  async pushRecent() {
    if (!this.user) return
    const recent = this.getRecent()
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
      const remote = doc && doc.recent && doc.recent.href ? doc.recent : null
      if (!remote) return
      localStorage.setItem(this.RECENT_KEY, JSON.stringify(remote))
      this._renderRecentPanel()
    } catch (e) {
      console.warn('[Account] Recent pull failed:', e)
    }
  }

  // ── Auth actions ───────────────────────────────────────────────────────────

  _bindSignOut() {
    if (this._signOutBound) return
    this._signOutBound = true
    const el = document.getElementById('acct-signout')
    if (el) el.addEventListener('click', () => { this.signOut() })
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

  // In-page sign-in lives in the account panel on the home screen (and the
  // onboarding welcome step). No popup — just land on the panel and focus
  // the email field.
  showAuthPrompt() {
    this.isGuest = false
    if (typeof showNewTabPage === 'function') showNewTabPage()
    const email = document.getElementById('acct-email-input')
    if (email) setTimeout(() => email.focus(), 60)
  }

  // Wires the in-page sign-in form (email / password / name, OAuth buttons,
  // submit, sign-up toggle). Shared by the home account panel and the
  // onboarding welcome step — both pages include account.js and use the same
  // element ids/classes. Idempotent per document.
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
