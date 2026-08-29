const GROQ_WORKER = 'https://ai.cdn.plutoniumnet.work';

const STELENA_LOGO = 'img/logos/stelena.svg';

// Groq TTS (Orpheus) — generated server-side by the worker, played as WAV.
const TTS_MODEL = 'canopylabs/orpheus-v1-english';
const TTS_VOICE = 'hannah';

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

// Supported GroqCloud text models. Whisper (audio) and Safety GPT-OSS
// (a safeguard model) are intentionally omitted.
const MODELS = [
  { id: 'openai/gpt-oss-120b',       name: 'GPT OSS 120B',    label: 'ChatGPT OSS 120B',          desc: '~500 tps · flagship open-weight model' },
  { id: 'openai/gpt-oss-20b',        name: 'GPT OSS 20B',     label: 'ChatGPT OSS 20B',           desc: '~1000 tps · fast everyday model' },
  { id: 'groq/compound',             name: 'Groq Compound',   label: 'Groq Compound',             desc: '~450 tps · agentic system with web search & code execution' },
];

let currentModel = 'openai/gpt-oss-120b';
let messages = [];
let recognition = null;
let isListening = false;
let ttsAudio = null;   // Audio element for Groq TTS playback
let authed = false;
let streaming = false;
let controller = null;   // AbortController for the in-flight request
let welcomeTemplate = null;

// Multi-chat state. Each chat: { id, title, messages:[{role,content}], createdAt, updatedAt }
let chats = [];
let activeChatId = null;

// ── Element + auth helpers ─────────────────────────────────────────────────

function chatContainer() { return document.getElementById('chatContainer'); }
function inputEl() { return document.getElementById('userInput'); }
function sendBtn() { return document.getElementById('sendBtn'); }
function voiceBtn() { return document.getElementById('voiceBtn'); }
function stopBtn() { return document.getElementById('stopBtn'); }

function currentUser() {
  return (typeof PlutoniumStore !== 'undefined') ? PlutoniumStore.currentUser : null;
}

function activeChat() { return chats.find(c => c.id === activeChatId) || null; }

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function titleFrom(text) {
  const t = text.replace(/\s+/g, ' ').trim();
  return t.length > 36 ? t.slice(0, 36).trimEnd() + '…' : (t || 'New chat');
}

function relTime(ts) {
  if (!ts) return '';
  const d = Date.now() - ts;
  if (d < 60e3) return 'just now';
  if (d < 3600e3) return Math.floor(d / 60e3) + 'm ago';
  if (d < 86400e3) return Math.floor(d / 3600e3) + 'h ago';
  if (d < 7 * 86400e3) return Math.floor(d / 86400e3) + 'd ago';
  return new Date(ts).toLocaleDateString();
}

function makeChat(title) {
  const now = Date.now();
  return {
    id: 'c' + now.toString(36) + Math.random().toString(36).slice(2, 7),
    title: title || 'New chat',
    messages: [],
    createdAt: now,
    updatedAt: now,
  };
}

function renderGate() {
  let gate = document.getElementById('ai-gate');
  if (gate) return;
  const chatContainerEl = chatContainer();
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
  chatContainerEl.appendChild(gate);
  gate.querySelector('#ai-gate-signin').addEventListener('click', () => {
    if (typeof accountManager !== 'undefined') accountManager.showAuthPrompt();
  });
}

function removeGate() {
  const gate = document.getElementById('ai-gate');
  if (gate) gate.remove();
}

function setStreaming(on) {
  streaming = on;
  const input = inputEl();
  const stop = stopBtn();
  if (input) input.disabled = on;
  if (sendBtn()) sendBtn().disabled = on || !authed;
  if (voiceBtn()) voiceBtn().disabled = on;
  if (stop) stop.style.display = on ? 'flex' : 'none';
}

function setAuthed(state) {
  authed = state;
  const input = inputEl();
  if (input) {
    input.disabled = streaming;
    input.placeholder = state ? 'Message Stelena...' : 'Sign in to start chatting';
  }
  if (sendBtn()) sendBtn().disabled = !state;
  if (state) {
    removeGate();
    // Keep the welcome screen visible until the user actually starts chatting
    // (addMessage / addSystem hide it). Signed-out users get the sign-in gate,
    // and signing in brings the welcome back if the conversation is empty.
    if (!messages.length) restoreWelcome();
  } else {
    renderGate();
  }
}

// ── Speech ─────────────────────────────────────────────────────────────────

function initSpeech() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return;
  recognition = new SR();
  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.lang = 'en-US';
  recognition.onresult = e => {
    const input = inputEl();
    input.value = e.results[0][0].transcript;
    autoResize(input);
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
    const btn = voiceBtn();
    if (btn) {
      btn.classList.add('listening');
      btn.innerHTML = '<i class="fas fa-stop"></i>';
    }
  }
}

function stopVoice() {
  isListening = false;
  const btn = voiceBtn();
  if (btn) { btn.classList.remove('listening'); btn.innerHTML = '<i class="fas fa-microphone"></i>'; }
}

// ── Model selector (wisp-style dropdown) ───────────────────────────────────

function initModelSelect() {
  const pill = document.getElementById('modelPill');
  const menu = document.getElementById('modelMenu');
  const list = document.getElementById('model-menu-list');
  const nameEl = document.getElementById('selectedModelName');
  if (!pill || !menu || !list) return;

  MODELS.forEach(m => {
    const opt = document.createElement('button');
    opt.className = 'ai-model-option';
    opt.dataset.value = m.id;
    opt.innerHTML = `<span class="ai-model-option__name">${m.label}</span><span class="ai-model-option__desc">${m.desc}</span>`;
    opt.addEventListener('click', () => selectModel(m.id));
    list.appendChild(opt);
  });

  function syncActive() {
    list.querySelectorAll('.ai-model-option').forEach(o => o.classList.toggle('active', o.dataset.value === currentModel));
  }
  function openMenu() { menu.classList.add('open'); pill.classList.add('open'); pill.setAttribute('aria-expanded', 'true'); }
  function closeMenu() { menu.classList.remove('open'); pill.classList.remove('open'); pill.setAttribute('aria-expanded', 'false'); }

  function selectModel(id) {
    currentModel = id;
    const m = MODELS.find(x => x.id === id);
    if (m) nameEl.textContent = m.name;
    syncActive();
    closeMenu();
    addSystem(`Model switched to ${m ? m.name : id}`);
  }
  window._aiSelectModel = selectModel;

  pill.addEventListener('click', e => {
    e.stopPropagation();
    if (menu.classList.contains('open')) closeMenu();
    else { syncActive(); openMenu(); }
  });
  document.addEventListener('click', closeMenu);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeMenu(); });
  syncActive();
}

// ── Chat UI helpers ────────────────────────────────────────────────────────

function autoResize(el) { el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 140) + 'px'; }
function handleKey(e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }
function useSuggestion(text) { const input = inputEl(); input.value = text; sendMessage(); }
function hideWelcome() { const ws = document.getElementById('welcomeScreen'); if (ws) ws.remove(); }
function scrollBottom() { const c = chatContainer(); c.scrollTop = c.scrollHeight; }

function restoreWelcome() {
  const c = chatContainer();
  if (!c || document.getElementById('welcomeScreen')) return;
  if (document.getElementById('ai-gate')) return;  // signed out — the gate shows instead
  if (!welcomeTemplate) return;
  const w = welcomeTemplate.cloneNode(true);
  w.id = 'welcomeScreen';
  c.appendChild(w);
}

function addSystem(text) {
  hideWelcome();
  const el = document.createElement('div');
  el.className = 'msg-system';
  el.textContent = text;
  chatContainer().appendChild(el);
  scrollBottom();
}

function makeAvatar(type) {
  const avatar = document.createElement('div');
  avatar.className = `msg-avatar ${type}`;
  if (type === 'ai') {
    const img = document.createElement('img');
    img.src = STELENA_LOGO;
    img.alt = 'Stelena';
    avatar.appendChild(img);
  } else {
    avatar.textContent = 'U';
  }
  return avatar;
}

// Add a finished message. `idx` is its index in `messages` (used by the
// regenerated / edit actions); pass null to render an AI bubble with no actions.
function addMessage(content, type, idx) {
  hideWelcome();
  const row = document.createElement('div');
  row.className = `msg-row ${type}`;
  const avatar = makeAvatar(type);
  const bubble = document.createElement('div');
  bubble.className = `msg-bubble ${type}`;

  if (type === 'ai') {
    bubble.innerHTML = marked.parse(content || '');
    if (idx != null && content) attachAiActions(bubble, idx);
  } else {
    bubble.textContent = content;
    if (idx != null) {
      const edit = document.createElement('button');
      edit.className = 'msg-edit';
      edit.title = 'Edit and resend';
      edit.innerHTML = '<i class="fa-solid fa-pen"></i>';
      edit.addEventListener('click', () => editMessage(idx));
      row.appendChild(edit);
    }
  }

  row.appendChild(avatar);
  row.appendChild(bubble);
  chatContainer().appendChild(row);
  scrollBottom();
  return bubble;
}

function attachAiActions(bubble, idx) {
  const wrap = document.createElement('div');
  wrap.className = 'msg-actions';

  const copy = document.createElement('button');
  copy.className = 'msg-act';
  copy.innerHTML = '<i class="fa-solid fa-copy"></i> Copy';
  copy.addEventListener('click', async () => {
    const text = messages[idx] ? messages[idx].content : '';
    try { await navigator.clipboard.writeText(text); } catch (e) {}
    copy.classList.add('copied');
    copy.innerHTML = '<i class="fa-solid fa-check"></i> Copied';
    setTimeout(() => { copy.classList.remove('copied'); copy.innerHTML = '<i class="fa-solid fa-copy"></i> Copy'; }, 1600);
  });
  wrap.appendChild(copy);

  const listen = document.createElement('button');
  listen.className = 'msg-act';
  listen.innerHTML = '<i class="fa-solid fa-volume-up"></i> Listen';
  listen.addEventListener('click', () => speakText(messages[idx] ? messages[idx].content : '', listen));
  wrap.appendChild(listen);

  const regen = document.createElement('button');
  regen.className = 'msg-act';
  regen.innerHTML = '<i class="fa-solid fa-rotate-right"></i> Regenerate';
  regen.addEventListener('click', () => regenerateMessage(idx));
  wrap.appendChild(regen);

  bubble.appendChild(wrap);
}

function showTyping() {
  hideWelcome();
  const row = document.createElement('div');
  row.className = 'msg-row ai';
  row.id = 'typingRow';
  row.appendChild(makeAvatar('ai'));
  const bubble = document.createElement('div');
  bubble.className = 'msg-bubble ai';
  bubble.innerHTML = '<div class="typing-dots"><span></span><span></span><span></span></div>';
  row.appendChild(bubble);
  chatContainer().appendChild(row);
  scrollBottom();
}

function hideTyping() { const el = document.getElementById('typingRow'); if (el) el.remove(); }

// Rebuild the message list from `messages` (drops welcome if there is content).
function renderConversation() {
  const c = chatContainer();
  if (!c) return;
  c.querySelectorAll('.msg-row, .msg-system, #typingRow').forEach(n => n.remove());
  messages.forEach((m, i) => addMessage(m.content, (m.role === 'ai' || m.role === 'assistant') ? 'ai' : 'user', i));
  if (!messages.length) restoreWelcome();
  scrollBottom();
}

// ── Send / stream from the Plutonium Groq worker ──────────────────────────

function sendMessage() {
  const input = inputEl();
  const text = input.value.trim();
  if (!text || streaming) return;
  if (!currentUser() || !authed) { addSystem('Please sign in to use Plutonium AI.'); return; }

  messages.push({ role: 'user', content: text });
  const chat = activeChat();
  if (chat && messages.length === 1 && (!chat.title || chat.title === 'New chat')) {
    chat.title = titleFrom(text);
  }
  addMessage(text, 'user', messages.length - 1);
  noteChange();
  input.value = '';
  input.style.height = 'auto';
  requestReply(text);
}

function stopGeneration() {
  if (controller) controller.abort();
}

async function requestReply(userContent) {
  setStreaming(true);
  showTyping();
  controller = new AbortController();
  const chatId = activeChatId;  // the chat this reply belongs to

  let streamBubble = null;
  try {
    const res = await fetch(`${GROQ_WORKER}/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${currentUser().idToken}`,
        'Accept': 'text/event-stream',
      },
      body: JSON.stringify({
        model: currentModel,
        system: SYSTEM_PROMPT.content,
        messages: messages.map(m => ({ role: m.role, content: m.content })),
      }),
      signal: controller.signal,
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
      messages.push({ role: 'assistant', content: reply });
      addMessage(reply, 'ai', messages.length - 1);
      noteChange();
    } else {
      // SSE streaming into an empty bubble, then attach actions when done.
      streamBubble = addMessage('', 'ai');
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let curEvent = '';
      let reply = '';

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
        if (curEvent === 'rl') return;
        const token = chunk.choices?.[0]?.delta?.content;
        if (token) {
          reply += token;
          streamBubble.innerHTML = marked.parse(reply);
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
      attachAiActions(streamBubble, messages.length - 1);
      noteChange();
    }
  } catch (err) {
    hideTyping();
    if (err.name === 'AbortError') {
      if (streamBubble) {
        const partial = streamBubble.textContent.trim();
        if (partial) {
          // Route the partial reply to the chat that was streaming, even if
          // the user switched chats mid-stream (openChat aborts the request).
          const target = chats.find(c => c.id === chatId);
          if (target && chatId === activeChatId) {
            messages.push({ role: 'assistant', content: partial });
            attachAiActions(streamBubble, messages.length - 1);
            noteChange();
          } else if (target) {
            target.messages.push({ role: 'assistant', content: partial });
            target.updatedAt = Date.now();
            persistLocal();
            renderChatList();
            scheduleSync();
          }
        } else if (streamBubble.closest('.msg-row')) {
          streamBubble.closest('.msg-row').remove();
        }
      }
      addSystem('Generation stopped.');
    } else {
      addMessage('Sorry, I encountered an error. Please try again.', 'ai');
      if (streamBubble && !streamBubble.textContent.trim()) streamBubble.closest('.msg-row').remove();
    }
    console.error('[ai] request failed:', err);
  } finally {
    setStreaming(false);
    const input = inputEl();
    input.focus();
  }
}

// ── Regenerate / edit / clear ──────────────────────────────────────────────

function regenerateMessage(idx) {
  if (streaming || idx == null || idx < 1) return;
  const prev = messages[idx - 1];
  if (!prev || prev.role !== 'user') return;
  messages = messages.slice(0, idx);  // drop the assistant message and anything after
  renderConversation();
  noteChange();
  requestReply(prev.content);
}

function editMessage(idx) {
  if (streaming || idx == null || idx < 0) return;
  const text = messages[idx] ? messages[idx].content : '';
  messages = messages.slice(0, idx);  // drop this user message and everything after
  renderConversation();
  noteChange();
  const input = inputEl();
  input.value = text;
  autoResize(input);
  input.focus();
  input.setSelectionRange(input.value.length, input.value.length);
}

function clearConversation() {
  if (streaming) stopGeneration();
  messages = [];
  renderConversation();
  noteChange();
}

// ── Multi-chat storage & cloud sync ───────────────────────────────────────

const AI_CHATS_LS = 'plu_ai_chats';
const AI_CHATS_DOC = 'ai_chats';
let _syncT = null;

// Local: everything is persisted to localStorage so chats survive reloads
// even when signed out.
function persistLocal() {
  try { localStorage.setItem(AI_CHATS_LS, JSON.stringify({ chats, activeChatId })); } catch (_) {}
}

function loadLocalChats() {
  try {
    const raw = localStorage.getItem(AI_CHATS_LS);
    const data = raw ? JSON.parse(raw) : null;
    if (data && Array.isArray(data.chats)) {
      chats = data.chats;
      if (typeof data.activeChatId === 'string') activeChatId = data.activeChatId;
    }
  } catch (_) {}
  if (!Array.isArray(chats) || !chats.length) chats = [makeChat()];
  if (!chats.some(c => c.id === activeChatId)) activeChatId = chats[0].id;
}

// Cloud: debounced Firestore push (users/{uid}/ai_chats).
function scheduleSync() {
  if (!currentUser()) return;
  clearTimeout(_syncT);
  _syncT = setTimeout(pushChats, 1200);
}

async function pushChats() {
  if (!currentUser()) return;
  try {
    await PlutoniumStore.setDoc(AI_CHATS_DOC, { chats, lastSync: new Date() });
  } catch (e) { console.warn('[ai] chat sync push failed:', e); }
}

async function pullChats() {
  if (!currentUser()) return;
  try {
    const doc = await PlutoniumStore.getDoc(AI_CHATS_DOC);
    if (doc && Array.isArray(doc.chats) && doc.chats.length) {
      chats = mergeChats(chats, doc.chats);
      if (!chats.some(c => c.id === activeChatId)) activeChatId = null;
      persistLocal();
      renderChatList();
      const target = chats.find(c => c.id === activeChatId) || chats[0] || null;
      if (target) openChat(target.id);
      else { messages = []; renderConversation(); }
    }
  } catch (e) { console.warn('[ai] chat sync pull failed:', e); }
}

// Union by chat id; same-id chats merge their messages (newest message count
// wins when one list is a prefix of the other, otherwise unique messages are
// appended). Mirrors the continue-watching merge in stream.js.
function mergeChats(local, remote) {
  const out = new Map();
  local.forEach(c => out.set(c.id, Object.assign({}, c, { messages: (c.messages || []).slice() })));
  remote.forEach(r => {
    const l = out.get(r.id);
    if (!l) { out.set(r.id, Object.assign({}, r)); return; }
    const lm = l.messages || [], rm = r.messages || [];
    if (JSON.stringify(lm) !== JSON.stringify(rm)) l.messages = mergeMessages(lm, rm);
    if ((r.updatedAt || 0) > (l.updatedAt || 0)) l.updatedAt = r.updatedAt;
    if (r.title && r.title !== 'New chat' && (!l.title || l.title === 'New chat')) l.title = r.title;
    if (!l.createdAt) l.createdAt = r.createdAt;
  });
  return Array.from(out.values()).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

function mergeMessages(a, b) {
  const key = m => m.role + '\u0000' + m.content;
  const aK = a.map(key), bK = b.map(key);
  if (bK.every((k, i) => aK[i] === k)) return b.slice();   // a is a prefix of b
  if (aK.every((k, i) => bK[i] === k)) return a.slice();   // b is a prefix of a
  const [base, other] = a.length >= b.length ? [a, b] : [b, a];
  const seen = new Set(base.map(key));
  const merged = base.slice();
  other.forEach(m => { if (!seen.has(key(m))) { merged.push(m); seen.add(key(m)); } });
  return merged;
}

// Call after any change to `messages` or chat metadata: sync the working
// array back into the chat object, persist locally, and schedule a cloud push.
function noteChange() {
  const chat = activeChat();
  if (chat) { chat.messages = messages; chat.updatedAt = Date.now(); }
  persistLocal();
  renderChatList();
  scheduleSync();
}

function openChat(id) {
  const chat = chats.find(c => c.id === id);
  if (!chat) return;
  if (streaming) stopGeneration();
  activeChatId = id;
  messages = chat.messages || (chat.messages = []);
  renderConversation();
  renderChatList();
  persistLocal();
}

function newChat() {
  if (streaming) stopGeneration();
  const chat = makeChat();
  chats.unshift(chat);
  persistLocal();
  scheduleSync();
  openChat(chat.id);
  const input = inputEl();
  if (input) input.focus();
}

function deleteChat(id) {
  const idx = chats.findIndex(c => c.id === id);
  if (idx < 0) return;
  chats.splice(idx, 1);
  persistLocal();
  scheduleSync();
  if (activeChatId === id) {
    activeChatId = null;
    const next = chats[Math.min(idx, chats.length - 1)];
    if (next) openChat(next.id);
    else { messages = []; renderConversation(); renderChatList(); }
  } else {
    renderChatList();
  }
}

function renderChatList() {
  const list = document.getElementById('aiChatList');
  if (!list) return;
  list.innerHTML = '';
  chats.forEach(chat => {
    const item = document.createElement('div');
    item.className = 'ai-chat-item' + (chat.id === activeChatId ? ' active' : '');
    item.dataset.id = chat.id;
    const n = (chat.messages || []).length;
    item.innerHTML =
      `<span class="ai-chat-item__icon"><i class="fa-solid fa-comment-dots"></i></span>` +
      `<span class="ai-chat-item__main"><span class="ai-chat-item__title">${escapeHtml(chat.title || 'New chat')}</span>` +
      `<span class="ai-chat-item__meta">${relTime(chat.updatedAt)} · ${n} msg${n === 1 ? '' : 's'}</span></span>` +
      `<span class="ai-chat-item__tools"><button class="ai-chat-del" type="button" title="Delete chat" data-id="${chat.id}"><i class="fa-solid fa-trash"></i></button></span>`;
    item.addEventListener('click', () => openChat(chat.id));
    item.addEventListener('dblclick', e => { e.stopPropagation(); startRename(item, chat); });
    list.appendChild(item);
  });
  if (!chats.length) {
    const empty = document.createElement('div');
    empty.className = 'ai-chat-empty';
    empty.textContent = 'No chats yet';
    list.appendChild(empty);
  }
}

function startRename(item, chat) {
  if (streaming) return;
  const titleEl = item.querySelector('.ai-chat-item__title');
  if (!titleEl) return;
  const input = document.createElement('input');
  input.className = 'ai-chat-rename';
  input.value = chat.title === 'New chat' ? '' : chat.title;
  input.placeholder = 'Name this chat';
  titleEl.replaceWith(input);
  input.focus();
  input.select();
  let done = false;
  const commit = save => {
    if (done) return;
    done = true;
    const val = input.value.trim();
    if (save && val) { chat.title = val; noteChange(); }
    else renderChatList();
  };
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); commit(true); }
    else if (e.key === 'Escape') commit(false);
  });
  input.addEventListener('blur', () => commit(true));
}

function initChatList() {
  const list = document.getElementById('aiChatList');
  const nc = document.getElementById('aiNewChat');
  if (nc) nc.addEventListener('click', newChat);
  if (list) {
    list.addEventListener('click', e => {
      const del = e.target.closest('.ai-chat-del');
      if (!del) return;
      e.stopPropagation();
      if (del.dataset.armed === '1') { deleteChat(del.dataset.id); return; }
      del.dataset.armed = '1';
      del.classList.add('armed');
      del.title = 'Click again to delete';
      setTimeout(() => { delete del.dataset.armed; del.classList.remove('armed'); del.title = 'Delete chat'; }, 2500);
    });
  }
}

// ── Text to speech (Groq Orpheus) ─────────────────────────────────────────

function stripMarkdown(text) {
  return String(text || '')
    .replace(/#{1,6}\s/g, '')
    .replace(/\*\*/g, '')
    .replace(/\*/g, '')
    .replace(/`{1,3}[^`]*`{1,3}/g, '')
    .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1')
    .replace(/^\s*[-*+]\s/gm, '')
    .trim();
}

function resetTtsBtns() {
  document.querySelectorAll('.msg-act.playing').forEach(b => {
    b.classList.remove('playing');
    b.innerHTML = '<i class="fa-solid fa-volume-up"></i> Listen';
  });
}

// Speak an AI reply with Groq's Orpheus TTS (proxied by the worker).
function speakText(text, btn) {
  if (ttsAudio && !ttsAudio.paused) {   // toggle off while playing
    ttsAudio.pause();
    ttsAudio = null;
    resetTtsBtns();
    return;
  }
  resetTtsBtns();
  if (!currentUser()) { addSystem('Please sign in to use voice output.'); return; }

  const clean = stripMarkdown(text);
  if (!clean) return;

  if (btn) {
    btn.classList.add('playing');
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Generating';
  }

  fetch(`${GROQ_WORKER}/tts`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${currentUser().idToken}`,
    },
    body: JSON.stringify({
      model: TTS_MODEL,
      input: clean,
      voice: TTS_VOICE,
      response_format: 'wav',
    }),
  })
    .then(res => {
      if (!res.ok) throw new Error(`TTS HTTP ${res.status}`);
      return res.blob();
    })
    .then(blob => {
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      ttsAudio = audio;
      const cleanup = () => { resetTtsBtns(); URL.revokeObjectURL(url); ttsAudio = null; };
      audio.onended = cleanup;
      audio.onerror = cleanup;
      if (btn) {
        btn.classList.add('playing');
        btn.innerHTML = '<i class="fas fa-stop"></i> Stop';
      }
      audio.play().catch(cleanup);
    })
    .catch(err => {
      resetTtsBtns();
      addSystem('Voice generation failed. Try again.');
      console.error('[ai] tts failed:', err);
    });
}

// ── Init ───────────────────────────────────────────────────────────────────

let _inited = false;

function init() {
  if (_inited) return;
  _inited = true;

  // Keep a pristine copy of the welcome screen so "clear" can restore it.
  const welcome = document.getElementById('welcomeScreen');
  if (welcome) welcomeTemplate = welcome.cloneNode(true);

  // Restore saved chats (or seed a fresh one) and open the active chat.
  loadLocalChats();
  initChatList();
  renderChatList();
  openChat(activeChatId);

  initSpeech();
  initModelSelect();

  const clearBtn = document.getElementById('ai-clear-btn');
  if (clearBtn) clearBtn.addEventListener('click', clearConversation);

  const stop = stopBtn();
  if (stop) stop.addEventListener('click', stopGeneration);

  if (typeof PlutoniumStore !== 'undefined') {
    PlutoniumStore.onAuthChange(user => {
      setAuthed(!!user);
      if (user) pullChats();
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