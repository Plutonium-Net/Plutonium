import Hyperbeam from 'https://unpkg.com/@hyperbeam/web@latest/dist/index.js';

const CONTAINER_ID = 'remote-container';
const SESSION_DURATION = 900;
const API_ENDPOINT = 'https://vm.cdn.plutoniumnet.work/session';

let hb = null;
let countdownInterval = null;
let timeRemaining = SESSION_DURATION;
let currentSessionId = null;
let embedUrl = null;
const fullscreenTarget = document.querySelector('.vm-frame-shell');

const startBtn = document.getElementById('startBtn');
const endBtn = document.getElementById('endBtn');
const fullscreenBtn = document.getElementById('fullscreenBtn');
const timerEl = document.getElementById('timer');
const statusEl = document.getElementById('status');
const container = document.getElementById(CONTAINER_ID);
const containerMessage = document.getElementById('containerMessage');

function currentUser() {
  return (typeof PlutoniumStore !== 'undefined') ? PlutoniumStore.currentUser : null;
}

// ── Pin to Home (quick launch from the new-tab page) ─────────────────────────

const VM_PIN = { id: 'vm', name: 'Virtual Machine', type: 'vm' };
const pinBtn = document.getElementById('vm-pin-btn');

function shellPins() {
  try { return window.Pins || (window.parent && window.parent.Pins) } catch (_) { return null; }
}

function updatePinBtn() {
  if (!pinBtn) return;
  const P = shellPins();
  const pinned = P ? !!P.find(VM_PIN.id) : false;
  pinBtn.classList.toggle('is-pinned', pinned);
  pinBtn.title = pinned ? 'Unpin from Home' : 'Pin a quick-launch to your home screen';
  pinBtn.innerHTML = `<i class="fa-solid fa-thumbtack"></i><span>${pinned ? 'Unpin from Home' : 'Pin to Home'}</span>`;
}

if (pinBtn) {
  pinBtn.addEventListener('click', () => {
    const P = shellPins();
    if (!P) return;
    if (P.find(VM_PIN.id)) P.remove(VM_PIN.id);
    else P.add(VM_PIN);
    updatePinBtn();
  });
}

function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function requireAuth() {
    if (currentUser()) return true;
    statusEl.innerHTML = '<i class="fa-solid fa-lock"></i> Sign in required to start a VM';
    containerMessage.innerHTML = `<div style="display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 20px;">
        <div style="font-size: 24px; margin-bottom: 10px;"><i class="fa-solid fa-lock"></i></div>
        <div style="margin-bottom: 12px;">Sign in to launch a virtual machine</div>
        <button id="vm-signin-btn" style="padding: 9px 20px; border: none; border-radius: 8px; cursor: pointer; font-family: inherit; font-size: 13.5px; font-weight: 600; color: #fff; background: var(--pink);">Sign In</button>
    </div>`;
    const btn = document.getElementById('vm-signin-btn');
    if (btn) btn.addEventListener('click', () => {
        if (typeof accountManager !== 'undefined') accountManager.showAuthPrompt();
    });
    return false;
}

async function startSession() {
    const user = currentUser();
    if (!user) { requireAuth(); return; }

    try {
        startBtn.disabled = true;
        statusEl.textContent = 'Creating session...';
        containerMessage.textContent = 'Creating remote session...';

        console.log('Sending request to:', API_ENDPOINT);

        const response = await fetch(API_ENDPOINT, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${user.idToken}`
            },
            body: JSON.stringify({ action: 'create' })
        });

        const responseText = await response.text();

        if (!response.ok) {
            let errorData;
            try {
                errorData = JSON.parse(responseText);
            } catch (e) {
                errorData = { error: responseText };
            }
            console.error('API Error:', errorData);
            throw new Error(errorData.error || errorData.message || `API Error: ${response.status}`);
        }

        const data = JSON.parse(responseText);
        console.log('Session data:', data);

        currentSessionId = data.session_id;
        embedUrl = data.embed_url;

        if (!embedUrl) {
            throw new Error('No embed_url returned from API');
        }

        statusEl.textContent = 'Loading VM...';
        containerMessage.textContent = 'Loading virtual machine...';

        console.log('Initializing remote session with URL:', embedUrl);
        hb = await Hyperbeam(container, embedUrl);

        containerMessage.style.display = 'none';
        fullscreenBtn.style.display = 'inline-block';
        statusEl.innerHTML = '<i class="fas fa-check-circle"></i> Session active';
        statusEl.classList.add('active');
        endBtn.disabled = false;
        timerEl.style.display = 'block';

        startCountdown();

    } catch (error) {
        console.error('Error starting session:', error);

        statusEl.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Error: ' + error.message;
        startBtn.disabled = false;
        containerMessage.innerHTML = `<div style="display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 20px;">
            <div style="font-size: 24px; margin-bottom: 10px;"><i class="fas fa-times-circle"></i></div>
            <div style="margin-bottom: 10px;">Failed to create session</div>
            <div style="font-size: 12px; color: rgba(255, 255, 255, 0.6);">${error.message}</div>
        </div>`;
    }
}

function startCountdown() {
    timeRemaining = SESSION_DURATION;
    updateTimerDisplay();

    countdownInterval = setInterval(() => {
        timeRemaining--;
        updateTimerDisplay();

        if (timeRemaining <= 60) {
            timerEl.classList.add('warning');
        }

        if (timeRemaining <= 0) {
            endSession(true);
        }
    }, 1000);
}

function updateTimerDisplay() {
    timerEl.innerHTML = `<i class="fas fa-clock"></i> Time remaining: ${formatTime(timeRemaining)}`;
}

async function endSession(autoEnded = false) {
    const user = currentUser();
    if (countdownInterval) {
        clearInterval(countdownInterval);
        countdownInterval = null;
    }

    if (currentSessionId) {
        try {
            console.log('Terminating session:', currentSessionId);
            const response = await fetch(API_ENDPOINT, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${user ? user.idToken : ''}`
                },
                body: JSON.stringify({
                    action: 'delete',
                    session_id: currentSessionId
                })
            });

            const result = await response.json();
            console.log('Session termination result:', result);
        } catch (error) {
            console.error('Error terminating session:', error);
        }
        currentSessionId = null;
    }

    if (hb) {
        hb.destroy();
        hb = null;
    }

    containerMessage.style.display = 'flex';
    fullscreenBtn.style.display = 'none';
    containerMessage.textContent = autoEnded ?
        'Session ended automatically (15 minute timeout)' :
        'Session ended. Click "Start Session" to begin a new one';

    statusEl.textContent = autoEnded ? 'Session auto-ended' : 'No active session';
    statusEl.classList.remove('active');
    startBtn.disabled = false;
    endBtn.disabled = true;
    timerEl.style.display = 'none';
    timerEl.classList.remove('warning');
}

async function enterFullscreen() {
    if (!hb || !fullscreenTarget) return;

    try {
        if (document.fullscreenElement === fullscreenTarget) {
            await document.exitFullscreen();
            return;
        }

        if (fullscreenTarget.requestFullscreen) {
            await fullscreenTarget.requestFullscreen();
        } else if (fullscreenTarget.webkitRequestFullscreen) {
            await fullscreenTarget.webkitRequestFullscreen();
        }
    } catch (error) {
        console.error('Error entering fullscreen:', error);
        statusEl.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Fullscreen failed';
    }
}

function exitFullscreen() {
    if (document.fullscreenElement) {
        document.exitFullscreen().catch(error => {
            console.error('Error exiting fullscreen:', error);
        });
        return;
    }

    if (document.webkitFullscreenElement && document.webkitExitFullscreen) {
        document.webkitExitFullscreen();
    }
}

startBtn.addEventListener('click', startSession);
endBtn.addEventListener('click', () => endSession(false));
fullscreenBtn.addEventListener('click', enterFullscreen);

document.addEventListener('fullscreenchange', () => {
    if (!hb) return;
    const isFullscreen = document.fullscreenElement === fullscreenTarget;
    fullscreenBtn.innerHTML = isFullscreen
        ? '<i class="fas fa-compress"></i> Exit Fullscreen'
        : '<i class="fas fa-expand"></i> Fullscreen';
});

window.addEventListener('beforeunload', () => {
    if (hb) {
        hb.destroy();
    }
});

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && document.fullscreenElement === fullscreenTarget) {
        exitFullscreen();
    }
});

console.log('VM.js loaded, API endpoint:', API_ENDPOINT);

updatePinBtn();

// Quick launch from a home pin: pluto://vms?autostart=1
if (new URLSearchParams(window.PluWorkspaceRouteSuffix || location.search).get('autostart') === '1') {
  setTimeout(() => startSession(), 400);
}
