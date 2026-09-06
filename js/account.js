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
        this._hideOverlay()
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
    const el = document.getElementById('acct-signin-text')
    if (el) el.addEventListener('click', () => this.showAuthPrompt())
    const nameEl = document.getElementById('acct-name-input')
    const nameField = nameEl ? nameEl.parentElement : null
    const emailEl = document.getElementById('acct-email-input')
    const passEl = document.getElementById('acct-password-input')
    const errorEl = document.getElementById('acct-error')
    const toggleEl = document.getElementById('acct-toggle')
    if (!nameEl || !nameField || !emailEl || !passEl || !errorEl || !toggleEl) return
    let isSignUp = false
    const setMode = up => {
      isSignUp = up
      nameField.hidden = !up
      toggleEl.textContent = up ? 'Already have an account? Sign in' : 'No Account? Make a free one!'
      errorEl.textContent = ''
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
      try {
        if (isSignUp) await PlutoniumStore.signUp(email, pass, name)
        else await PlutoniumStore.signInWithEmail(email, pass)
      } catch (e) {
        errorEl.textContent = this._authErrorMessage(e)
      }
    }
    emailEl.addEventListener('keydown', e => { if (e.key === 'Enter') trySignIn() })
    passEl.addEventListener('keydown', e => { if (e.key === 'Enter') trySignIn() })
    nameEl.addEventListener('keydown', e => { if (e.key === 'Enter') trySignIn() })
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

  showAuthPrompt() {
    this.isGuest = false
    this._showOverlay()
  }

  // ── Sign-in overlay ────────────────────────────────────────────────────────

  _showOverlay() {
    if (document.getElementById('plu-auth-overlay')) return

    const cfg = window.PLU_AUTH_CONFIG || {}
    const title = cfg.title || 'Welcome to<br>Plutonium Network'
    const sub   = cfg.sub   || 'Sign in to sync your bookmarks, pins and settings across devices.'

    const overlay = document.createElement('div')
    overlay.id = 'plu-auth-overlay'
    overlay.innerHTML = `
      <style>
        #plu-auth-overlay {
          position:fixed;inset:0;background:rgba(0,0,0,.82);
          display:flex;align-items:center;justify-content:center;
          z-index:10000;
          font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;
        }
        #plu-auth-box {
          position:relative;width:min(780px,92vw);aspect-ratio:16/9;
          border-radius:20px;overflow:hidden;
          box-shadow:0 20px 60px rgba(var(--ui-shadow-rgb),.6);
          display:flex;flex-direction:column;
        }
        .plu-glass {
          position:absolute;inset:0;z-index:0;
          backdrop-filter:blur(20px) saturate(150%);
          background:rgba(25,25,25,.48);
        }
        .plu-glass-border {
          position:absolute;inset:0;border-radius:inherit;z-index:1;pointer-events:none;
          box-shadow:inset 1px 1px 0 rgba(var(--ui-accent-rgb),.15),inset 0 0 14px rgba(var(--ui-accent-rgb),.05);
        }
        .plu-auth-body { position:relative;z-index:2;display:flex;flex:1;min-height:0; }
        .plu-auth-left {
          flex:1;display:flex;flex-direction:column;justify-content:center;
          padding:2rem 1.75rem 1.5rem 2.25rem;
          border-right:1px solid rgba(255,255,255,.1);
        }
        .plu-auth-right {
          flex:1;display:flex;flex-direction:column;justify-content:center;
          padding:2rem 2.25rem 1.5rem 1.75rem;
        }
        #plu-auth-box h2 {
          color:#fff;font-size:clamp(22px,3.5vw,40px);font-weight:300;margin:0 0 6px;
          line-height:1.15;
        }
        .plu-sub { color:rgba(255,255,255,.55);font-size:13px;margin:0 0 1.4rem; }
        .plu-input {
          width:100%;padding:10px 14px;margin-bottom:10px;
          background:rgba(255,255,255,.07);border:1.5px solid rgba(255,255,255,.16);
          border-radius:10px;color:#fff;font-size:14px;font-family:inherit;
          outline:none;box-sizing:border-box;transition:border-color .2s,background .2s;
        }
        .plu-input::placeholder { color:rgba(255,255,255,.35); }
        .plu-input:focus { border-color:rgba(232,23,93,.6);background:rgba(255,255,255,.11); }
        .plu-btn {
          width:100%;padding:10px 18px;margin-bottom:9px;
          border-radius:10px;cursor:pointer;font-size:14px;font-family:inherit;font-weight:500;
          border:1.5px solid rgba(255,255,255,.18);
          display:flex;align-items:center;justify-content:center;gap:10px;
          box-sizing:border-box;transition:all .2s;
        }
        .plu-btn:disabled { opacity:.45;cursor:not-allowed;transform:none!important; }
        .plu-btn-google  { background:rgba(255,255,255,.94);color:#202124;border-color:transparent; }
        .plu-btn-google:hover:not(:disabled)  { background:#fff;box-shadow:0 0 20px rgba(var(--ui-accent-rgb),.2);transform:translateY(-1px); }
        .plu-btn-github  { background:rgba(22,27,34,.9);color:#fff;border-color:rgba(255,255,255,.1); }
        .plu-btn-github:hover:not(:disabled)  { background:rgba(22,27,34,1);transform:translateY(-1px); }
        .plu-btn-primary { background:var(--pink);color:#fff;border-color:transparent; }
        .plu-btn-primary:hover:not(:disabled) { filter:brightness(1.1);transform:translateY(-1px); }
        .plu-btn-ghost   { background:transparent;color:rgba(255,255,255,.6);border-color:rgba(255,255,255,.1);margin-bottom:0; }
        .plu-btn-ghost:hover { background:rgba(255,255,255,.07); }
        .plu-divider {
          display:flex;align-items:center;gap:10px;
          color:rgba(255,255,255,.38);font-size:12px;margin-bottom:12px;
        }
        .plu-divider::before,.plu-divider::after { content:'';flex:1;border-bottom:1px solid rgba(255,255,255,.1); }
        .plu-error  { color:var(--ui-danger);font-size:12px;min-height:16px;margin:-4px 0 8px; }
        .plu-toggle { text-align:center;font-size:12px;color:rgba(255,255,255,.5);cursor:pointer;margin-top:8px;transition:color .15s; }
        .plu-toggle:hover { color:#fff; }
        .plu-oauth-icon { width:17px;height:17px;flex-shrink:0; }
        .plu-footer {
          position:relative;z-index:2;text-align:center;padding:7px 0 10px;
          font-size:11px;color:rgba(255,255,255,.28);
          border-top:1px solid rgba(255,255,255,.07);flex-shrink:0;
        }
      </style>

      <div id="plu-auth-box">
        <div class="plu-glass"></div>
        <div class="plu-glass-border"></div>

        <div class="plu-auth-body">
          <!-- Left: OAuth -->
          <div class="plu-auth-left">
            <h2>${title}</h2>
            <p class="plu-sub">${sub}</p>

            <button class="plu-btn plu-btn-google" id="plu-google-btn">
              <svg class="plu-oauth-icon" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              Continue with Google
            </button>

            <button class="plu-btn plu-btn-github" id="plu-github-btn">
              <svg class="plu-oauth-icon" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 0C5.37 0 0 5.37 0 12c0 5.3 3.44 9.8 8.21 11.39.6.11.79-.26.79-.58v-2.23c-3.34.73-4.03-1.42-4.03-1.42-.55-1.39-1.33-1.76-1.33-1.76-1.09-.74.08-.73.08-.73 1.2.08 1.84 1.24 1.84 1.24 1.07 1.83 2.81 1.3 3.49 1 .11-.78.42-1.31.76-1.61-2.67-.3-5.47-1.33-5.47-5.93 0-1.31.47-2.38 1.24-3.22-.12-.3-.54-1.52.12-3.18 0 0 1.01-.32 3.3 1.23a11.5 11.5 0 0 1 3-.4c1.02.005 2.05.14 3 .4 2.28-1.55 3.29-1.23 3.29-1.23.66 1.66.24 2.88.12 3.18.77.84 1.24 1.91 1.24 3.22 0 4.61-2.81 5.63-5.48 5.92.43.37.82 1.1.82 2.22v3.29c0 .32.19.69.8.58C20.57 21.8 24 17.3 24 12c0-6.63-5.37-12-12-12z"/>
              </svg>
              Continue with GitHub
            </button>
          </div>

          <!-- Right: Email -->
          <div class="plu-auth-right">
            <div class="plu-divider">or sign in with email</div>
            <input id="plu-name"     class="plu-input" type="text"     placeholder="Your name"  style="display:none" autocomplete="name">
            <input id="plu-email"    class="plu-input" type="email"    placeholder="Email"       autocomplete="email">
            <input id="plu-password" class="plu-input" type="password" placeholder="Password"    autocomplete="current-password">
            <div class="plu-error" id="plu-error"></div>
            <button class="plu-btn plu-btn-primary" id="plu-submit">Sign In</button>
            <button class="plu-btn plu-btn-ghost"   id="plu-guest">Continue as Guest</button>
            <div class="plu-toggle" id="plu-toggle">Don't have an account? Sign up</div>
          </div>
        </div>

        <div class="plu-footer">Plutonium Network · your bookmarks, pins and tabs sync to the cloud when signed in</div>
      </div>
    `

    document.body.appendChild(overlay)

    let isSignUp = false
    const nameEl   = overlay.querySelector('#plu-name')
    const emailEl  = overlay.querySelector('#plu-email')
    const passEl   = overlay.querySelector('#plu-password')
    const submitEl = overlay.querySelector('#plu-submit')
    const googleEl = overlay.querySelector('#plu-google-btn')
    const githubEl = overlay.querySelector('#plu-github-btn')
    const guestEl  = overlay.querySelector('#plu-guest')
    const toggleEl = overlay.querySelector('#plu-toggle')
    const errorEl  = overlay.querySelector('#plu-error')

    const setErr   = msg => { errorEl.textContent = msg }
    const clearErr = ()  => { errorEl.textContent = '' }

    const makeOAuthHandler = (provider, btn) => async () => {
      clearErr()
      btn.disabled = true
      const orig = btn.innerHTML
      btn.innerHTML = '<span>Signing in…</span>'
      try {
        await PlutoniumStore.signInWithOAuth(provider)
      } catch (e) {
        btn.disabled = false
        btn.innerHTML = orig
        setErr(this._authErrorMessage(e))
      }
    }
    googleEl.addEventListener('click', makeOAuthHandler('google', googleEl))
    githubEl.addEventListener('click', makeOAuthHandler('github', githubEl))

    submitEl.addEventListener('click', async () => {
      clearErr()
      const email = emailEl.value.trim()
      const pass  = passEl.value
      const name  = nameEl.value.trim()
      if (!email || !pass) { setErr('Please enter your email and password.'); return }
      submitEl.disabled = true
      submitEl.textContent = isSignUp ? 'Creating account…' : 'Signing in…'
      try {
        if (isSignUp) {
          if (!name) { setErr('Please enter your name.'); submitEl.disabled = false; submitEl.textContent = 'Sign Up'; return }
          await PlutoniumStore.signUp(email, pass, name)
        } else {
          await PlutoniumStore.signInWithEmail(email, pass)
        }
      } catch (e) {
        submitEl.disabled = false
        submitEl.textContent = isSignUp ? 'Sign Up' : 'Sign In'
        setErr(this._authErrorMessage(e))
      }
    })

    toggleEl.addEventListener('click', () => {
      isSignUp = !isSignUp
      nameEl.style.display    = isSignUp ? 'block' : 'none'
      submitEl.textContent    = isSignUp ? 'Sign Up' : 'Sign In'
      toggleEl.textContent    = isSignUp ? 'Already have an account? Sign in' : "Don't have an account? Sign up"
      clearErr()
    })

    guestEl.addEventListener('click', () => {
      this.isGuest = true
      this._hideOverlay()
    })

    const onEnter = e => { if (e.key === 'Enter') submitEl.click() }
    emailEl.addEventListener('keydown', onEnter)
    passEl.addEventListener('keydown',  onEnter)
    nameEl.addEventListener('keydown',  onEnter)
  }

  _hideOverlay() {
    const el = document.getElementById('plu-auth-overlay')
    if (el) el.remove()
  }
}

const accountManager = new AccountManager()
window.accountManager = accountManager
