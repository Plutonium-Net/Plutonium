import Hyperbeam from 'https://unpkg.com/@hyperbeam/web@latest/dist/index.js';

const WORKER       = 'https://vm.cdn.plutoniumnet.work';
const SESSION_SECS = 900; // 15 minutes
const HISTORY_DOC  = 'vm_history';

let hb               = null;
let countdownTimer   = null;
let timeLeft         = SESSION_SECS;
let sessionStart     = null;
let embedUrl         = null;
let currentSessionId = null;
let sessionHistory   = [];

const gate          = document.getElementById('vm-gate');
const card          = document.getElementById('vm-card');
const historyWrap   = document.getElementById('vm-history');
const statusEl      = document.getElementById('vm-status');
const timerEl       = document.getElementById('vm-timer');
const timerText     = document.getElementById('vm-timer-text');
const startBtn      = document.getElementById('vm-start-btn');
const endBtn        = document.getElementById('vm-end-btn');
const fullscreenBtn = document.getElementById('vm-fullscreen-btn');
const signinBtn     = document.getElementById('vm-signin-btn');
const embedEl       = document.getElementById('vm-embed');
const iframeEl      = document.getElementById('vm-iframe');
const placeholder   = document.getElementById('vm-placeholder');
const historyList   = document.getElementById('vm-history-list');

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatTime(secs) {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function formatDate(ts) {
  return new Date(ts).toLocaleString(undefined, {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function formatDuration(secs) {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function setStatus(text, state = '') {
  statusEl.className = 'vm-status' + (state ? ` ${state}` : '');
  const icon = state === 'active'
    ? 'fa-solid fa-circle'
    : state === 'error'
      ? 'fa-solid fa-circle-exclamation'
      : 'fa-regular fa-circle';
  statusEl.innerHTML = `<i class="${icon}"></i> ${text}`;
}

// ── Session history ───────────────────────────────────────────────────────────

async function loadHistory() {
  if (!PlutoniumStore.currentUser) return;
  try {
    const doc = await PlutoniumStore.getDoc(HISTORY_DOC);
    sessionHistory = doc?.sessions || [];
    renderHistory();
  } catch (e) {
    console.warn('[vms] history load failed:', e.message);
  }
}

async function saveHistory() {
  if (!PlutoniumStore.currentUser) return;
  try {
    await PlutoniumStore.setDoc(HISTORY_DOC, { sessions: sessionHistory.slice(0, 50) });
  } catch (e) {
    console.warn('[vms] history save failed:', e.message);
  }
}

function renderHistory() {
  if (!sessionHistory.length) {
    historyList.innerHTML = '<div class="vm-history__empty">No sessions yet</div>';
    historyWrap.style.display = 'none';
    return;
  }
  historyWrap.style.display = '';
  historyList.innerHTML = sessionHistory
    .slice()
    .sort((a, b) => b.startedAt - a.startedAt)
    .slice(0, 20)
    .map(s => `
      <div class="vm-history__row">
        <span class="vm-history__date">${formatDate(s.startedAt)}</span>
        <span class="vm-history__duration"><i class="fa-regular fa-clock"></i> ${formatDuration(s.durationSecs)}</span>
      </div>`)
    .join('');
}

function recordSession(durationSecs) {
  sessionHistory.unshift({ startedAt: sessionStart, durationSecs });
  renderHistory();
  saveHistory();
}

// ── Session lifecycle ─────────────────────────────────────────────────────────

async function startSession() {
  startBtn.disabled = true;
  setStatus('Creating session…');
  placeholder.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i><span>Creating Hyperbeam session…</span>';

  try {
    const user = PlutoniumStore.currentUser;
    if (!user) throw new Error('Not signed in');

    const res = await fetch(`${WORKER}/session`, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${user.idToken}`,
      },
      body: JSON.stringify({ action: 'create' }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `HTTP ${res.status}`);
    }

    const data = await res.json();
    embedUrl         = data.embed_url;
    currentSessionId = data.session_id;

    setStatus('Loading VM…');
    placeholder.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i><span>Loading virtual machine…</span>';

    hb = await Hyperbeam(embedEl, embedUrl);
    iframeEl.classList.add('active');
    placeholder.style.display = 'none';

    sessionStart = Date.now();
    setStatus('Session active', 'active');
    endBtn.disabled = false;
    fullscreenBtn.style.display = '';
    timerEl.style.display = '';
    timerEl.classList.remove('warning');
    startCountdown();

  } catch (err) {
    console.error('[vms] start failed:', err);
    setStatus(err.message, 'error');
    placeholder.style.display = '';
    placeholder.innerHTML = `<i class="fa-solid fa-circle-exclamation"></i><span>${err.message}</span>`;
    startBtn.disabled = false;
  }
}

function startCountdown() {
  timeLeft = SESSION_SECS;
  timerText.textContent = formatTime(timeLeft);

  countdownTimer = setInterval(() => {
    timeLeft--;
    timerText.textContent = formatTime(timeLeft);
    if (timeLeft <= 60) timerEl.classList.add('warning');
    if (timeLeft <= 0)  endSession(true);
  }, 1000);
}

async function endSession(autoEnded = false) {
  if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = null; }

  const elapsed = sessionStart ? Math.round((Date.now() - sessionStart) / 1000) : 0;
  if (elapsed > 0) recordSession(elapsed);

  try {
    const user = PlutoniumStore.currentUser;
    if (user && currentSessionId) {
      await fetch(`${WORKER}/session`, {
        method: 'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${user.idToken}`,
        },
        body: JSON.stringify({ action: 'delete', session_id: currentSessionId }),
      });
    }
  } catch (_) {}

  if (hb) { hb.destroy(); hb = null; }

  embedUrl         = null;
  sessionStart     = null;
  currentSessionId = null;
  iframeEl.classList.remove('active');
  placeholder.style.display = '';
  placeholder.innerHTML = `
    <i class="fa-solid fa-desktop"></i>
    <span>${autoEnded ? 'Session ended - 15-minute limit reached' : 'Session ended. Click Start Session to begin a new one.'}</span>`;

  setStatus(autoEnded ? 'Session auto-ended' : 'No active session');
  startBtn.disabled  = false;
  endBtn.disabled    = true;
  fullscreenBtn.style.display = 'none';
  timerEl.style.display = 'none';
  timerEl.classList.remove('warning');
}

// ── Auth ──────────────────────────────────────────────────────────────────────

signinBtn.addEventListener('click', async () => {
  signinBtn.disabled = true;
  try {
    await PlutoniumStore.signIn();
  } catch (e) {
    signinBtn.disabled = false;
  }
});

PlutoniumStore.onAuthChange(user => {
  if (user) {
    gate.style.display = 'none';
    card.style.display = '';
    loadHistory();
  } else {
    gate.style.display = '';
    card.style.display = 'none';
    historyWrap.style.display = 'none';
    signinBtn.disabled = false;
    if (hb) endSession(false);
  }
});

// ── Controls ──────────────────────────────────────────────────────────────────

startBtn.addEventListener('click', startSession);
endBtn.addEventListener('click', () => endSession(false));

fullscreenBtn.addEventListener('click', () => {
  const target = embedEl;
  if (target.requestFullscreen)            target.requestFullscreen();
  else if (target.webkitRequestFullscreen) target.webkitRequestFullscreen();
  else if (target.mozRequestFullScreen)    target.mozRequestFullScreen();
});

window.addEventListener('beforeunload', () => { if (hb) endSession(false); });
