PlutoniumStore.WORKER_URL = 'https://accounting.cdn.plutoniumnet.work';

const DATA_COLLECTIONS = ['games_data/saved', 'nav_prefs/data'];

const viewLoading   = document.getElementById('view-loading');
const viewSignedOut = document.getElementById('view-signed-out');
const viewSignedIn  = document.getElementById('view-signed-in');
const accountCard   = document.getElementById('account-card');

function _skelProfile() {
  document.getElementById('profile-avatar-wrap').innerHTML =
    '<div class="skel-profile"><div class="skel skel-profile__avatar"></div><div class="skel skel-profile__name"></div><div class="skel skel-profile__email"></div></div>';
  document.getElementById('profile-name').textContent  = '';
  document.getElementById('profile-email').textContent = '';
  document.getElementById('profile-uid').textContent   = '';
}

function showView(name) {
  viewLoading.style.display   = name === 'loading'    ? 'block' : 'none';
  viewSignedOut.style.display = name === 'signed-out' ? 'block' : 'none';
  viewSignedIn.style.display  = name === 'signed-in'  ? 'block' : 'none';
  accountCard.classList.toggle('is-signed-in', name === 'signed-in');
  if (name === 'loading') _skelProfile();
}

const authMsgEl = document.getElementById('auth-message');
function showAuthError(t)   { authMsgEl.textContent = t; authMsgEl.className = 'auth-message error'; }
function showAuthSuccess(t) { authMsgEl.textContent = t; authMsgEl.className = 'auth-message success'; }
function clearAuthMsg()     { authMsgEl.textContent = ''; authMsgEl.className = 'auth-message'; }

function setFb(id, text, type) {
  const el = document.getElementById(id);
  el.textContent = text;
  el.className = 'mgmt-feedback' + (type ? ' ' + type : '');
}
function clearFb(id) { setFb(id, '', ''); }

function markInvalid(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add('is-invalid');
}
function clearInvalid() {
  document.querySelectorAll('.is-invalid').forEach(el => el.classList.remove('is-invalid'));
}

function renderProfile(user) {
  document.getElementById('profile-name').textContent  = user.displayName || 'Plutonium User';
  document.getElementById('profile-email').textContent = user.email || '';
  document.getElementById('profile-uid').textContent   = 'UID: ' + user.uid;
  document.getElementById('input-displayname').value   = user.displayName || '';

  const wrap = document.getElementById('profile-avatar-wrap');
  wrap.innerHTML = '';
  if (user.photoUrl) {
    const img = document.createElement('img');
    img.src = user.photoUrl;
    img.className = 'profile-avatar';
    img.alt = user.displayName || 'Avatar';
    wrap.appendChild(img);
  } else {
    const ph = document.createElement('div');
    ph.className = 'profile-avatar-ph';
    ph.innerHTML = '<i class="fa-solid fa-circle-user"></i>';
    wrap.appendChild(ph);
  }
}

PlutoniumStore.onAuthChange(user => {
  if (user) {
    renderProfile(user);
    dataViewerOpen = false;
    dataCache = null;
    document.getElementById('data-viewer').classList.remove('open');
    document.getElementById('view-data-arrow').innerHTML = '<i class="fa-solid fa-chevron-right"></i>';
    showView('signed-in');
  } else {
    showView('signed-out');
  }
});

document.querySelectorAll('.auth-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.auth-panel').forEach(p => p.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById('panel-' + tab.dataset.tab).classList.add('active');
    clearAuthMsg();
    clearInvalid();
  });
});

document.querySelectorAll('.pw-toggle').forEach(btn => {
  btn.addEventListener('click', () => {
    const input = document.getElementById(btn.dataset.target);
    if (!input) return;
    const visible = input.type === 'text';
    input.type = visible ? 'password' : 'text';
    btn.querySelector('i').className = visible ? 'fa-solid fa-eye' : 'fa-solid fa-eye-slash';
    btn.setAttribute('aria-label', visible ? 'Show password' : 'Hide password');
  });
});

document.getElementById('btn-sign-in').addEventListener('click', async () => {
  clearAuthMsg(); clearInvalid();
  const email    = document.getElementById('signin-email').value.trim();
  const password = document.getElementById('signin-password').value;
  if (!email)    { markInvalid('signin-email');    showAuthError('Enter your email address.'); return; }
  if (!password) { markInvalid('signin-password'); showAuthError('Enter your password.'); return; }

  const btn = document.getElementById('btn-sign-in');
  btn.disabled = true; btn.textContent = 'Signing in…';
  showView('loading');
  try {
    await PlutoniumStore.signInWithEmail(email, password);
  } catch (e) {
    showView('signed-out');
    showAuthError(friendlyError(e.message));
  } finally {
    btn.disabled = false; btn.textContent = 'Sign In';
  }
});

async function handleOAuth(provider) {
  clearAuthMsg(); clearInvalid();
  showView('loading');
  try {
    await PlutoniumStore.signInWithOAuth(provider);
  } catch (e) {
    showView('signed-out');
    if (!e.message.includes('popup closed')) {
      showAuthError(e.message.includes('OAuth failed') ? e.message.replace('[PlutoniumStore] OAuth failed: ', '') : 'Sign-in failed — please try again.');
    }
  }
}

document.getElementById('btn-oauth-google-signin').addEventListener('click', () => handleOAuth('google'));
document.getElementById('btn-oauth-github-signin').addEventListener('click', () => handleOAuth('github'));
document.getElementById('btn-oauth-google-signup').addEventListener('click', () => handleOAuth('google'));
document.getElementById('btn-oauth-github-signup').addEventListener('click', () => handleOAuth('github'));

document.getElementById('btn-sign-up').addEventListener('click', async () => {
  clearAuthMsg(); clearInvalid();
  const name     = document.getElementById('signup-name').value.trim();
  const email    = document.getElementById('signup-email').value.trim();
  const password = document.getElementById('signup-password').value;
  if (!email)    { markInvalid('signup-email');    showAuthError('Enter your email address.'); return; }
  if (!password) { markInvalid('signup-password'); showAuthError('Enter a password (min. 6 characters).'); return; }

  const btn = document.getElementById('btn-sign-up');
  btn.disabled = true; btn.textContent = 'Creating account…';
  showView('loading');
  try {
    await PlutoniumStore.signUp(email, password, name);
  } catch (e) {
    showView('signed-out');
    document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.auth-panel').forEach(p => p.classList.remove('active'));
    document.querySelector('[data-tab="signup"]').classList.add('active');
    document.getElementById('panel-signup').classList.add('active');
    showAuthError(friendlyError(e.message));
  } finally {
    btn.disabled = false; btn.textContent = 'Create Account';
  }
});

document.getElementById('btn-forgot').addEventListener('click', async () => {
  clearAuthMsg(); clearInvalid();
  const email = document.getElementById('signin-email').value.trim();
  if (!email) { markInvalid('signin-email'); showAuthError('Enter your email above first.'); return; }
  try {
    await PlutoniumStore.resetPassword(email);
    showAuthSuccess('Password reset email sent - check your inbox.');
  } catch (e) {
    showAuthError(friendlyError(e.message));
  }
});

document.getElementById('btn-save-name').addEventListener('click', async () => {
  clearFb('fb-name');
  const newName = document.getElementById('input-displayname').value.trim();
  if (!newName) { setFb('fb-name', 'Enter a display name.', 'error'); return; }

  const btn = document.getElementById('btn-save-name');
  btn.disabled = true; btn.textContent = 'Saving…';
  try {
    await PlutoniumStore.updateProfile(newName);
    document.getElementById('profile-name').textContent = newName;
    setFb('fb-name', 'Display name updated.', 'success');
  } catch (e) {
    setFb('fb-name', friendlyError(e.message), 'error');
  } finally {
    btn.disabled = false; btn.textContent = 'Save';
  }
});

document.getElementById('btn-send-reset').addEventListener('click', async () => {
  clearFb('fb-password');
  const user = PlutoniumStore.currentUser;
  if (!user?.email) return;
  try {
    await PlutoniumStore.resetPassword(user.email);
    setFb('fb-password', 'Reset email sent to ' + user.email, 'success');
  } catch (e) {
    setFb('fb-password', friendlyError(e.message), 'error');
  }
});

let dataViewerOpen = false;
let dataCache      = null;

document.getElementById('btn-view-data').addEventListener('click', async () => {
  dataViewerOpen = !dataViewerOpen;
  const viewer = document.getElementById('data-viewer');
  const arrow  = document.getElementById('view-data-arrow');
  viewer.classList.toggle('open', dataViewerOpen);
  arrow.innerHTML = dataViewerOpen
    ? '<i class="fa-solid fa-chevron-down"></i>'
    : '<i class="fa-solid fa-chevron-right"></i>';

  if (!dataViewerOpen) return;
  if (dataCache) return;

  const loadingEl = document.getElementById('data-viewer-loading');
  const preEl     = document.getElementById('data-viewer-pre');
  loadingEl.style.display = 'block';
  preEl.style.display     = 'none';

  try {
    dataCache = await fetchAllData();
    preEl.textContent   = JSON.stringify(dataCache, null, 2);
    preEl.style.display = 'block';
    loadingEl.style.display = 'none';
  } catch (e) {
    loadingEl.textContent = 'Failed to load data.';
    setFb('fb-data', e.message, 'error');
  }
});

document.getElementById('btn-export-data').addEventListener('click', async () => {
  clearFb('fb-data');
  const btn = document.getElementById('btn-export-data');
  const labelEl = btn.querySelector('.btn-label');
  labelEl.textContent = 'Exporting…';
  btn.style.pointerEvents = 'none';
  try {
    const data = dataCache || await fetchAllData();
    dataCache = data;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = 'plutonium-data.json';
    a.click();
    URL.revokeObjectURL(url);
  } catch (e) {
    setFb('fb-data', 'Export failed: ' + e.message, 'error');
  } finally {
    labelEl.textContent = 'Export data as JSON';
    btn.style.pointerEvents = '';
  }
});

document.getElementById('btn-sign-out').addEventListener('click', async () => {
  dataCache = null;
  await PlutoniumStore.signOut();
});

document.getElementById('btn-delete-account').addEventListener('click', () => {
  document.getElementById('delete-overlay').classList.add('open');
});
document.getElementById('btn-delete-cancel').addEventListener('click', () => {
  document.getElementById('delete-overlay').classList.remove('open');
});
document.getElementById('btn-delete-confirm').addEventListener('click', async () => {
  const confirmBtn = document.getElementById('btn-delete-confirm');
  confirmBtn.disabled = true;
  confirmBtn.textContent = 'Deleting…';
  try {
    await PlutoniumStore.deleteAccount();
    document.getElementById('delete-overlay').classList.remove('open');
  } catch (e) {
    document.getElementById('delete-overlay').classList.remove('open');
    setFb('fb-delete', friendlyError(e.message), 'error');
  } finally {
    confirmBtn.disabled = false;
    confirmBtn.textContent = 'Delete';
  }
});
document.getElementById('delete-overlay').addEventListener('click', function(e) {
  if (e.target === this) this.classList.remove('open');
});

async function fetchAllData() {
  const user = PlutoniumStore.currentUser;
  const result = {
    account: {
      uid:         user.uid,
      email:       user.email,
      displayName: user.displayName,
      photoUrl:    user.photoUrl || null,
    },
    firestore: {},
  };
  await Promise.all(DATA_COLLECTIONS.map(async col => {
    try {
      const doc = await PlutoniumStore.getDoc(col);
      result.firestore[col] = doc;
    } catch (_) {
      result.firestore[col] = null;
    }
  }));
  return result;
}

function friendlyError(msg) {
  if (msg.includes('INVALID_LOGIN_CREDENTIALS') || msg.includes('INVALID_PASSWORD') || msg.includes('EMAIL_NOT_FOUND'))
    return 'Incorrect email or password.';
  if (msg.includes('EMAIL_EXISTS'))
    return 'An account with this email already exists.';
  if (msg.includes('WEAK_PASSWORD'))
    return 'Password must be at least 6 characters.';
  if (msg.includes('INVALID_EMAIL'))
    return 'Invalid email address.';
  if (msg.includes('TOO_MANY_ATTEMPTS'))
    return 'Too many attempts - try again later.';
  return 'Something went wrong - please try again.';
}
