const GROQ_WORKER = 'https://ai.cdn.plutoniumnet.work';

// Pick the accent-coloured Stelena logo (img/logos/logo-<color>.png)
const ACCENT_LOGO_MAP = {
  '#e8175d': 'plutonium-pink',
  '#7c3aed': 'violet',
  '#2563eb': 'blue',
  '#059669': 'emerald',
  '#d97706': 'amber',
  '#dc2626': 'red',
  '#0891b2': 'cyan',
  '#c026d3': 'fuchsia',
}

function accentLogoFile() {
  try {
    const raw = localStorage.getItem('plu_theme')
    const state = raw ? JSON.parse(raw) : {}
    const accent = String(state.accentColor || '').trim().toLowerCase()
    return ACCENT_LOGO_MAP[accent] || 'plutonium-pink'
  } catch {
    return 'plutonium-pink'
  }
}

const SYSTEM_PROMPT = {
  role: 'system',
  content: `You are Stelena, the official AI assistant of Plutonium Network.

Your purpose is to provide fast, accurate, and helpful assistance across the Plutonium Network ecosystem. You act as a knowledgeable guide, technical assistant, and productivity companion while maintaining a professional, approachable, and intelligent personality.

## Identity

Name: Stelena
Organization: Plutonium Network
Role: Official AI Assistant

## Personality

- Professional without being robotic.
- Friendly and conversational.
- Confident but never arrogant.
- Honest about uncertainty.
- Concise by default, detailed when requested.
- Curious and solution-oriented.
- Never sarcastic or rude.

## Core Principles

1. Accuracy comes before speed.
2. Never fabricate information.
3. If something is unknown, clearly say so.
4. Explain technical concepts in an understandable way.
5. Prioritize user privacy and security.
6. Help users solve problems instead of simply answering questions.

## Responsibilities

You can assist with:

- Technical support
- Programming and debugging
- Documentation
- Plutonium Network products and services
- General technology questions
- Writing and editing
- Brainstorming ideas
- Learning and education
- Productivity
- Research summaries
- General conversation

## Communication Style

- Write naturally.
- Avoid unnecessary filler.
- Prefer short paragraphs.
- Use markdown when it improves readability.
- Match the user's level of technical knowledge.
- Be enthusiastic about innovation without sounding like marketing.

## Technical Behavior

When writing code:

- Produce clean, modern code.
- Follow best practices.
- Explain important decisions.
- Minimize unnecessary complexity.
- Include comments only when they add value.

When debugging:

- Identify likely causes first.
- Walk through solutions logically.
- Ask clarifying questions only when necessary.

## Safety

- Refuse harmful or illegal requests.
- Protect user privacy.
- Never expose confidential or internal information.
- Do not pretend to have abilities you do not possess.

## Tone

Stelena should feel like a knowledgeable engineer sitting beside the user, not a corporate chatbot.

She is calm, capable, and efficient.

## Plutonium Network

Represent Plutonium Network with professionalism.

Never invent features, products, pricing, or policies.

If information about Plutonium Network is unavailable, state that clearly rather than guessing.

## Response Philosophy

Every response should strive to be:

- Helpful
- Accurate
- Honest
- Efficient
- Easy to understand

The goal is not merely to answer questions, but to empower users to accomplish their goals.

You are Stelena.
The intelligence behind Plutonium Network.`
};

const MODELS = [
  { id: 'llama-3.3-70b-versatile', name: 'LLaMA 3.3 70B',   label: 'LLaMA 3.3 70B Versatile',   desc: 'Most capable — best for complex tasks' },
  { id: 'llama-3.1-8b-instant',    name: 'LLaMA 3.1 8B',    label: 'LLaMA 3.1 8B Instant',      desc: 'Fast and efficient for quick responses' },
  { id: 'openai/gpt-oss-120b',     name: 'GPT OSS 120B',    label: 'ChatGPT OSS 120B',          desc: 'Large open-source model with strong reasoning' },
  { id: 'openai/gpt-oss-20b',      name: 'GPT OSS 20B',     label: 'ChatGPT OSS 20B',           desc: 'Fast open-source model for everyday tasks' },
  { id: 'qwen/qwen3.6-27b',        name: 'Qwen 3.6 27B',    label: 'Qwen 3.6 27B',              desc: 'Efficient 27B model tuned for chat' },
  { id: 'groq/compound',           name: 'Groq Compound',   label: 'Groq Compound',             desc: 'Powerful mixture of experts model' },
  { id: 'groq/compound-mini',      name: 'Compound Mini',   label: 'Groq Compound Mini',        desc: 'Lightweight mixture of experts model' },
];

let currentModel = 'llama-3.3-70b-versatile';
let messages = [];
let recognition = null;
let isListening = false;
let currentAudio = null;
let authed = false;
let streaming = false;

// ── Auth ─────────────────────────────────────────────────────────────────────

function currentUser() {
  return (typeof PlutoniumStore !== 'undefined') ? PlutoniumStore.currentUser : null;
}

function renderGate() {
  let gate = document.getElementById('ai-gate');
  if (gate) return;
  const chatContainer = document.getElementById('chatContainer');
  const existing = document.getElementById('welcomeScreen');
  if (existing) existing.remove();

  gate = document.createElement('div');
  gate.id = 'ai-gate';
  gate.className = 'ai-gate';
  gate.innerHTML = `
    <div class="ai-gate__card">
      <div class="ai-gate__icon"><i class="fas fa-robot"></i></div>
      <div class="ai-gate__title">Sign in to chat with Stelena</div>
      <div class="ai-gate__sub">Plutonium AI is powered by the Plutonium Groq worker. Sign in with your Plutonium account to start chatting.</div>
      <button class="ai-gate__btn" id="ai-gate-signin"><i class="fas fa-right-to-bracket"></i> Sign In</button>
    </div>`;
  chatContainer.appendChild(gate);
  gate.querySelector('#ai-gate-signin').addEventListener('click', () => {
    if (typeof accountManager !== 'undefined') accountManager.showAuthPrompt();
  });
}

function removeGate() {
  const gate = document.getElementById('ai-gate');
  if (gate) gate.remove();
}

function setAuthed(state) {
  authed = state;
  const input = document.getElementById('userInput');
  const sendBtn = document.getElementById('sendBtn');
  if (input && sendBtn) {
    input.disabled = !state;
    sendBtn.disabled = !state;
    input.placeholder = state ? "Let's talk about..." : 'Sign in to start chatting';
  }
  if (state) {
    removeGate();
    if (typeof hideWelcome === 'function') hideWelcome();
  } else {
    renderGate();
  }
}

// ── Speech ───────────────────────────────────────────────────────────────────

function initSpeech() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return;
  recognition = new SR();
  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.lang = 'en-US';
  recognition.onresult = e => {
    document.getElementById('userInput').value = e.results[0][0].transcript;
    autoResize(document.getElementById('userInput'));
  };
  recognition.onerror = () => stopVoice();
  recognition.onend = () => stopVoice();
}

function toggleVoice() {
  if (!recognition) { alert('Speech recognition not supported.'); return; }
  if (isListening) { recognition.stop(); stopVoice(); }
  else {
    recognition.start();
    isListening = true;
    const btn = document.getElementById('voiceBtn');
    btn.classList.add('listening');
    btn.innerHTML = '<i class="fas fa-stop"></i>';
  }
}

function stopVoice() {
  isListening = false;
  const btn = document.getElementById('voiceBtn');
  if (btn) { btn.classList.remove('listening'); btn.innerHTML = '<i class="fas fa-microphone"></i>'; }
}

// ── Model selector ───────────────────────────────────────────────────────────

function initModelSelect() {
  const overlay = document.getElementById('modelOverlay');
  const pill = document.getElementById('modelPill');
  const nameEl = document.getElementById('selectedModelName');
  pill.addEventListener('click', () => overlay.classList.add('active'));
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.classList.remove('active'); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') overlay.classList.remove('active'); });
  document.querySelectorAll('.model-option').forEach(opt => {
    opt.addEventListener('click', () => {
      document.querySelectorAll('.model-option').forEach(o => o.classList.remove('selected'));
      opt.classList.add('selected');
      currentModel = opt.dataset.value;
      nameEl.textContent = opt.dataset.name;
      overlay.classList.remove('active');
      addSystem(`Model switched to ${opt.querySelector('.model-option-name').textContent}`);
    });
  });
}

// ── Chat helpers ─────────────────────────────────────────────────────────────

function autoResize(el) { el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 140) + 'px'; }
function handleKey(e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }
function useSuggestion(text) { document.getElementById('userInput').value = text; sendMessage(); }
function hideWelcome() { const ws = document.getElementById('welcomeScreen'); if (ws) ws.remove(); }
function scrollBottom() { const c = document.getElementById('chatContainer'); c.scrollTop = c.scrollHeight; }

function addSystem(text) {
  hideWelcome();
  const el = document.createElement('div');
  el.className = 'msg-system';
  el.textContent = text;
  document.getElementById('chatContainer').appendChild(el);
  scrollBottom();
}

function addMessage(content, type) {
  hideWelcome();
  const container = document.getElementById('chatContainer');
  const row = document.createElement('div');
  row.className = `msg-row ${type}`;
  const avatar = document.createElement('div');
  avatar.className = `msg-avatar ${type}`;
  if (type === 'ai') {
    const img = document.createElement('img');
    img.src = `../img/logos/logo-${accentLogoFile()}.png`;
    img.alt = 'Stelena';
    avatar.appendChild(img);
  } else {
    avatar.textContent = 'U';
  }
  const bubble = document.createElement('div');
  bubble.className = `msg-bubble ${type}`;
  if (type === 'ai') {
    bubble.innerHTML = marked.parse(content);
    const listenBtn = document.createElement('button');
    listenBtn.className = 'listen-btn';
    listenBtn.innerHTML = '<i class="fas fa-volume-up"></i> Listen';
    listenBtn.onclick = () => speakText(content, listenBtn);
    bubble.appendChild(listenBtn);
  } else {
    bubble.textContent = content;
  }
  row.appendChild(avatar);
  row.appendChild(bubble);
  container.appendChild(row);
  scrollBottom();
  return bubble;
}

function showTyping() {
  hideWelcome();
  const container = document.getElementById('chatContainer');
  const row = document.createElement('div');
  row.className = 'msg-row ai';
  row.id = 'typingRow';
  const avatar = document.createElement('div');
  avatar.className = 'msg-avatar ai';
  const img = document.createElement('img');
  img.src = `../img/logos/logo-${accentLogoFile()}.png`;
  img.alt = 'Stelena';
  avatar.appendChild(img);
  const bubble = document.createElement('div');
  bubble.className = 'msg-bubble ai';
  bubble.innerHTML = '<div class="typing-dots"><span></span><span></span><span></span></div>';
  row.appendChild(avatar);
  row.appendChild(bubble);
  container.appendChild(row);
  scrollBottom();
}

function hideTyping() { const el = document.getElementById('typingRow'); if (el) el.remove(); }

// ── Send message (streams from the Plutonium Groq worker) ───────────────────

async function sendMessage() {
  const input = document.getElementById('userInput');
  const sendBtn = document.getElementById('sendBtn');
  const text = input.value.trim();
  if (!text || streaming) return;
  const user = currentUser();
  if (!user || !authed) { addSystem('Please sign in to use Plutonium AI.'); return; }

  addMessage(text, 'user');
  messages.push({ role: 'user', content: text });
  input.value = '';
  input.style.height = 'auto';
  streaming = true;
  input.disabled = true;
  sendBtn.disabled = true;
  showTyping();

  try {
    const res = await fetch(`${GROQ_WORKER}/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${user.idToken}`,
        'Accept': 'text/event-stream',
      },
      body: JSON.stringify({
        model: currentModel,
        system: SYSTEM_PROMPT.content,
        messages: messages.map(m => ({ role: m.role, content: m.content })),
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `HTTP ${res.status}`);
    }

    hideTyping();

    const contentType = (res.headers.get('Content-Type') || '').toLowerCase();

    if (!contentType.includes('text/event-stream')) {
      const data = await res.json();
      const reply = data.content || '';
      addMessage(reply, 'ai');
      messages.push({ role: 'assistant', content: reply });
    } else {
      // SSE streaming
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let curEvent = '';
      let reply = '';
      const bubble = addMessage('', 'ai');
      const textNode = bubble.firstChild;

      const processLine = line => {
        if (line.startsWith('event:')) { curEvent = line.slice(6).trim(); return; }
        if (!line.startsWith('data:')) {
          if (line === '') curEvent = '';
          return;
        }
        const payload = line.slice(5).trim();
        if (payload === '[DONE]') return;
        let chunk;
        try { chunk = JSON.parse(payload); } catch { return; }
        if (curEvent === 'rl') return; // rate-limit event — no UI needed here
        const token = chunk.choices?.[0]?.delta?.content;
        if (token) {
          reply += token;
          bubble.innerHTML = marked.parse(reply);
          scrollBottom();
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();
        for (const line of lines) processLine(line);
      }
      if (buffer) processLine(buffer);

      messages.push({ role: 'assistant', content: reply });
    }
  } catch (err) {
    hideTyping();
    addMessage('Sorry, I encountered an error. Please try again.', 'ai');
    console.error('[ai] send failed:', err);
  } finally {
    streaming = false;
    input.disabled = false;
    sendBtn.disabled = false;
    input.focus();
  }
}

// ── Text to speech ───────────────────────────────────────────────────────────

function speakText(text, btn) {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
    document.querySelectorAll('.listen-btn.playing').forEach(b => {
      b.classList.remove('playing');
      b.innerHTML = '<i class="fas fa-volume-up"></i> Listen';
    });
  }
  if (btn.classList.contains('playing')) {
    btn.classList.remove('playing');
    btn.innerHTML = '<i class="fas fa-volume-up"></i> Listen';
    return;
  }
  const clean = text
    .replace(/#{1,6}\s/g, '')
    .replace(/\*\*/g, '')
    .replace(/\*/g, '')
    .replace(/`{1,3}[^`]*`{1,3}/g, '')
    .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1')
    .replace(/^\s*[-*+]\s/gm, '')
    .trim();
  if (!('speechSynthesis' in window)) { alert('Text-to-speech not supported.'); return; }
  const utt = new SpeechSynthesisUtterance(clean);
  utt.rate = 1.0; utt.pitch = 1.0; utt.volume = 1.0;
  btn.classList.add('playing');
  btn.innerHTML = '<i class="fas fa-stop"></i> Stop';
  utt.onend = utt.onerror = () => {
    btn.classList.remove('playing');
    btn.innerHTML = '<i class="fas fa-volume-up"></i> Listen';
    currentAudio = null;
  };
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utt);
  currentAudio = { pause: () => window.speechSynthesis.cancel() };
}

// ── Init ─────────────────────────────────────────────────────────────────────

let _inited = false;

function init() {
  if (_inited) return;
  _inited = true;

  initSpeech();
  initModelSelect();

  if (typeof PlutoniumStore !== 'undefined') {
    PlutoniumStore.onAuthChange(user => {
      setAuthed(!!user);
    });
  }

  // If auth state is already resolved, apply it now
  setTimeout(() => {
    setAuthed(!!currentUser());
  }, 300);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
