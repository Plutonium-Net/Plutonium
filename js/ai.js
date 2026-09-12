const GROQ_WORKER = 'https://ai.cdn.plutoniumnet.work';

const STELENA_LOGO = 'img/logos/stelena.svg?v=2';

const TTS_MODEL = 'canopylabs/orpheus-v1-english';
const TTS_VOICES = [
  { id: 'hannah', label: 'Hannah', desc: 'Female · balanced' },
  { id: 'autumn', label: 'Autumn', desc: 'Female · warm' },
  { id: 'diana',  label: 'Diana',  desc: 'Female · clear' },
  { id: 'austin', label: 'Austin', desc: 'Male · confident' },
  { id: 'daniel', label: 'Daniel', desc: 'Male · deep' },
  { id: 'troy',   label: 'Troy',   desc: 'Male · upbeat' },
];
let ttsVoice = (() => {
  try { return localStorage.getItem('plu_ai_voice') || 'hannah'; } catch (_) { return 'hannah'; }
})();

const SYSTEM_PROMPT = {
  role: 'system',
  content: `You are Stelena, the official AI assistant of Plutonium Network.

Your purpose is to provide fast, accurate, and helpful assistance across the Plutonium Network ecosystem. You act as a knowledgeable guide, technical assistant, and productivity companion while maintaining a professional, approachable, and intelligent personality.

## Identity

Name: Stelena (pronounced like the word tell)
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

const TALK_SYSTEM_PROMPT = `You are Stelena (pronounced like the word "tell"), the voice assistant of Plutonium Network. You are speaking aloud to the user.

STRICT RULES: follow them always:
1. Keep every response under 5 sentences. 1-2 sentences is ideal.
2. Never use markdown, tables, charts, lists, headings, or bullets; plain spoken words only.
3. Sound natural and conversational, like a quick spoken chat. No robotic filler.
4. When a topic could get long, give the short spoken answer and offer to go deeper.`;

const SYSTEM_BUDGET = 7800;

const CONTINUE_DIRECTIVE = '\n\n## Continuation instruction\n' +
  'The user has asked you to CONTINUE your previous response from exactly where it stopped. ' +
  'Do not repeat anything already written, begin directly with the continuation. ' +
  'If the previous response is already complete, say so briefly.';

const MEMORY_DIRECTIVE = '\n\n## Silent memory\n' +
  'You have a silent memory system. When the user reveals a durable personal fact worth remembering ' +
  '(name, job, location, hobby, goal, preference, project), append exactly one block at the very end of your reply, ' +
  'after all other text, with nothing after it:\n' +
  '[MEMORY:{"key":"short label","value":"the fact"}]\n' +
  'Rules: only one block per reply; never mention it, never say you will remember, never explain or reference it. ' +
  'The block is hidden from the user. Skip it when there is nothing worth remembering.';

const BUILTIN_PERSONAS = [
  { id: 'p_stelena', name: 'Stelena', emoji: '✦', builtin: true, prompt: SYSTEM_PROMPT.content },
  { id: 'p_code', name: 'Code Expert', emoji: '⌘', builtin: true, prompt: 'You are Code Expert, a senior software engineer inside Plutonium Network\'s Stelena AI. You write clean, modern, well-structured code and explain the important decisions behind it. Prefer minimal, working solutions over clever abstractions. When debugging, identify the most likely cause first, then walk through the fix logically. Use markdown code blocks with language tags. Ask a clarifying question only when the task is genuinely ambiguous.' },
  { id: 'p_writer', name: 'Creative Writer', emoji: '✎', builtin: true, prompt: 'You are Creative Writer, a storyteller inside Plutonium Network\'s Stelena AI. You craft vivid, engaging prose, build believable characters and help with plot, pacing and voice. Offer constructive, specific feedback and always keep the user\'s own style in mind. When asked to write, produce the work itself rather than describing it.' },
  { id: 'p_tutor', name: 'Tutor', emoji: '◎', builtin: true, prompt: 'You are Tutor, a patient teacher inside Plutonium Network\'s Stelena AI. You explain ideas in plain language, check understanding, and build on what the user already knows. Use short steps, concrete examples and analogies. Encourage curiosity and never make the user feel stupid for asking. If a question is ambiguous, ask what they already know first.' },
  { id: 'p_brainstorm', name: 'Brainstormer', emoji: '✳', builtin: true, prompt: 'You are Brainstormer, a fast, generative idea partner inside Plutonium Network\'s Stelena AI. You produce many varied options quickly, then help the user narrow them down. Favor surprising, concrete ideas over generic ones. Label tradeoffs briefly and always end with a recommended next step.' },
];

const MODELS = [
  { id: 'openai/gpt-oss-120b',       name: 'GPT OSS 120B',    label: 'ChatGPT OSS 120B',          desc: '~500 tps · flagship open-weight model' },
  { id: 'openai/gpt-oss-20b',        name: 'GPT OSS 20B',     label: 'ChatGPT OSS 20B',           desc: '~1000 tps · fast everyday model' },
  { id: 'groq/compound',             name: 'Groq Compound',   label: 'Groq Compound',             desc: '~450 tps · agentic system with web search & code execution' },
];

let currentModel = 'openai/gpt-oss-120b';
let messages = [];
let recognition = null;
let isListening = false;
let ttsAudio = null;
let authed = false;
let streaming = false;
let controller = null;
let welcomeTemplate = null;

let chats = [];
let activeChatId = null;

let personas = [];
let personasDeleted = {};
let defaultPersonaId = 'p_stelena';
let facts = [];
let factsDeleted = {};
let memoryEnabled = true;
let editingPersonaId = null;


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
    personaId: defaultPersonaId || 'p_stelena',
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
  const talk = document.getElementById('talkBtn');
  if (talk) talk.disabled = on;
  if (stop) stop.style.display = on ? 'flex' : 'none';
  if (!on && typeof refreshQuota === 'function') refreshQuota();
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
    if (!messages.length) restoreWelcome();
  } else {
    renderGate();
  }
  if (typeof refreshQuota === 'function') refreshQuota();
}

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
  window._aiCloseModelMenu = closeMenu;

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
    else { syncActive(); openMenu(); if (window._aiClosePersonaMenu) window._aiClosePersonaMenu(); if (window._aiCloseVoiceMenu) window._aiCloseVoiceMenu(); }
  });
  document.addEventListener('click', closeMenu);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeMenu(); });
  syncActive();
}

function initVoiceSelect() {
  const pill = document.getElementById('voicePill');
  const menu = document.getElementById('voiceMenu');
  const list = document.getElementById('voice-menu-list');
  const nameEl = document.getElementById('selectedVoiceName');
  if (!pill || !menu || !list) return;

  TTS_VOICES.forEach(v => {
    const opt = document.createElement('button');
    opt.className = 'ai-model-option';
    opt.dataset.value = v.id;
    opt.innerHTML = `<span class="ai-model-option__name">${v.label}</span><span class="ai-model-option__desc">${v.desc}</span>`;
    opt.addEventListener('click', () => selectVoice(v.id));
    list.appendChild(opt);
  });

  function syncActive() {
    list.querySelectorAll('.ai-model-option').forEach(o => o.classList.toggle('active', o.dataset.value === ttsVoice));
  }
  function openMenu() { menu.classList.add('open'); pill.classList.add('open'); pill.setAttribute('aria-expanded', 'true'); }
  function closeMenu() { menu.classList.remove('open'); pill.classList.remove('open'); pill.setAttribute('aria-expanded', 'false'); }
  window._aiCloseVoiceMenu = closeMenu;

  function selectVoice(id) {
    ttsVoice = id;
    const v = TTS_VOICES.find(x => x.id === id);
    if (v && nameEl) nameEl.textContent = v.label;
    try { localStorage.setItem('plu_ai_voice', id); } catch (_) {}
    syncActive();
    closeMenu();
    scheduleSync();
  }
  window._aiSelectVoice = selectVoice;

  const current = TTS_VOICES.find(x => x.id === ttsVoice);
  if (current && nameEl) nameEl.textContent = current.label;

  pill.addEventListener('click', e => {
    e.stopPropagation();
    if (menu.classList.contains('open')) closeMenu();
    else { syncActive(); openMenu(); if (window._aiCloseModelMenu) window._aiCloseModelMenu(); if (window._aiClosePersonaMenu) window._aiClosePersonaMenu(); }
  });
  document.addEventListener('click', closeMenu);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeMenu(); });
  syncActive();
}
function applyVoice(id) {
  if (!TTS_VOICES.some(v => v.id === id)) return;
  ttsVoice = id;
  try { localStorage.setItem('plu_ai_voice', id); } catch (_) {}
  const nameEl = document.getElementById('selectedVoiceName');
  const v = TTS_VOICES.find(x => x.id === id);
  if (v && nameEl) nameEl.textContent = v.label;
  const list = document.getElementById('voice-menu-list');
  if (list) list.querySelectorAll('.ai-model-option').forEach(o => o.classList.toggle('active', o.dataset.value === id));
}

function autoResize(el) { el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 140) + 'px'; }
function handleKey(e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }
function useSuggestion(text) { const input = inputEl(); input.value = text; sendMessage(); }
function hideWelcome() { const ws = document.getElementById('welcomeScreen'); if (ws) ws.remove(); }
function scrollBottom() { const c = chatContainer(); c.scrollTop = c.scrollHeight; }

function restoreWelcome() {
  const c = chatContainer();
  if (!c || document.getElementById('welcomeScreen')) return;
  if (document.getElementById('ai-gate')) return;
  if (!welcomeTemplate) return;
  const w = welcomeTemplate.cloneNode(true);
  w.id = 'welcomeScreen';
  c.appendChild(w);
  updateWelcomePersona();
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
function addMessage(content, type, idx) {
  hideWelcome();
  const row = document.createElement('div');
  row.className = `msg-row ${type}`;
  const avatar = makeAvatar(type);
  const bubble = document.createElement('div');
  bubble.className = `msg-bubble ${type}`;

  if (type === 'ai') {
    bubble.innerHTML = marked.parse(stripMemoryDirective(content || ''));
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

  if (idx === messages.length - 1) {
    const cont = document.createElement('button');
    cont.className = 'msg-act';
    cont.innerHTML = '<i class="fa-solid fa-forward"></i> Continue';
    cont.addEventListener('click', () => continueReply(idx));
    wrap.appendChild(cont);
  }

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

function renderConversation() {
  const c = chatContainer();
  if (!c) return;
  c.querySelectorAll('.msg-row, .msg-system, #typingRow').forEach(n => n.remove());
  messages.forEach((m, i) => addMessage(m.content, (m.role === 'ai' || m.role === 'assistant') ? 'ai' : 'user', i));
  if (!messages.length) restoreWelcome();
  updateWelcomePersona();
  updatePersonaPill();
  scrollBottom();
}

function allPersonas() { return BUILTIN_PERSONAS.concat(personas); }

function personaById(id) {
  if (!id) return BUILTIN_PERSONAS[0];
  return allPersonas().find(p => p.id === id) || BUILTIN_PERSONAS[0];
}

function factsSorted() {
  return facts.slice().sort((a, b) => (b.ts || 0) - (a.ts || 0));
}

function memoryFactsBlock(spoken) {
  if (!memoryEnabled || !facts.length) return '';
  const list = factsSorted();
  if (spoken) {
    return ' Things you already know about the user: ' +
      list.slice(0, 8).map(f => `${f.key}: ${f.value}`).join('; ') + '.';
  }
  return '\n\n## Known facts about this user\n' + list.map(f => `- ${f.key}: ${f.value}`).join('\n') + '\n';
}

function composeSystem(chat, opts) {
  opts = opts || {};
  const persona = personaById(chat ? chat.personaId : defaultPersonaId);
  const base = (persona && persona.prompt) || BUILTIN_PERSONAS[0].prompt;
  let tail = '';
  if (opts.continue) tail += CONTINUE_DIRECTIVE;
  if (memoryEnabled) tail += MEMORY_DIRECTIVE;

  let factsText = '';
  if (memoryEnabled && facts.length) {
    const header = '\n\n## Known facts about this user\n';
    const lines = [];
    for (const f of factsSorted()) {
      const candidate = header + lines.concat([`- ${f.key}: ${f.value}`]).join('\n') + '\n';
      if (base.length + candidate.length + tail.length > SYSTEM_BUDGET) break;
      lines.push(`- ${f.key}: ${f.value}`);
    }
    if (lines.length) factsText = header + lines.join('\n') + '\n';
  }

  let content = base + factsText + tail;
  if (content.length > SYSTEM_BUDGET) content = content.slice(0, SYSTEM_BUDGET);
  return content;
}

function talkSystemPrompt() {
  let content = TALK_SYSTEM_PROMPT + memoryFactsBlock(true);
  if (content.length > SYSTEM_BUDGET) content = content.slice(0, SYSTEM_BUDGET);
  return content;
}

function stripMemoryDirective(text) {
  let s = String(text == null ? '' : text);
  s = s.replace(/\[MEMORY:\s*\{[\s\S]*?\}\s*\]/g, '');
  s = s.replace(/\[MEMORY[\s\S]*$/, '');
  return s.replace(/\s+$/, '');
}

function extractMemory(text) {
  const s = String(text == null ? '' : text);
  const m = s.match(/\[MEMORY:\s*(\{[\s\S]*?\})\s*\]/);
  if (!m) return { clean: s.trim(), fact: null };
  let fact = null;
  try {
    const obj = JSON.parse(m[1]);
    if (obj && obj.key && obj.value) fact = { key: String(obj.key).trim(), value: String(obj.value).trim() };
  } catch (_) {
    const k = m[1].match(/"key"\s*:\s*"([^"]+)"/);
    const v = m[1].match(/"value"\s*:\s*"([^"]+)"/);
    if (k && v) fact = { key: k[1].trim(), value: v[1].trim() };
  }
  const clean = (s.slice(0, m.index) + s.slice(m.index + m[0].length)).trim();
  return { clean, fact };
}

function makeFactId() { return 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

function saveFact(fact) {
  if (!fact || !fact.key || !fact.value) return false;
  const keyLower = fact.key.toLowerCase();
  const existing = facts.find(f => (f.key || '').toLowerCase() === keyLower);
  const now = Date.now();
  if (existing) {
    if (existing.value === fact.value) return false;
    existing.value = String(fact.value).slice(0, MAX_FACT_VALUE);
    existing.ts = now;
  } else {
    if (facts.length >= MAX_FACTS) facts.shift();
    facts.push({ id: makeFactId(), key: String(fact.key).slice(0, 80), value: String(fact.value).slice(0, MAX_FACT_VALUE), ts: now });
  }
  persistMemoryLocal();
  scheduleMemorySync();
  renderMemoryStudio();
  return true;
}

function deleteFact(id) {
  const i = facts.findIndex(f => f.id === id);
  if (i < 0) return;
  facts.splice(i, 1);
  factsDeleted[id] = Date.now();
  persistMemoryLocal();
  scheduleMemorySync();
  renderMemoryStudio();
}

function clearAllFacts() {
  const now = Date.now();
  facts.forEach(f => { factsDeleted[f.id] = now; });
  facts = [];
  persistMemoryLocal();
  scheduleMemorySync();
  renderMemoryStudio();
}

function attachMemoryChip(bubble, fact) {
  if (!bubble || !fact) return;
  const chip = document.createElement('div');
  chip.className = 'memory-chip';
  chip.innerHTML = `<i class="fa-solid fa-brain"></i> <span>Memory saved: <strong>${escapeHtml(fact.value)}</strong></span>`;
  bubble.appendChild(chip);
}

function makePersonaId() { return 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

function studioError(msg) {
  const el = document.getElementById('studioError');
  if (!el) return;
  el.textContent = msg || '';
  el.style.display = msg ? 'block' : 'none';
}

function fillStudioForm(p) {
  const nameEl = document.getElementById('studioName');
  const emojiEl = document.getElementById('studioEmoji');
  const promptEl = document.getElementById('studioPrompt');
  if (nameEl) nameEl.value = p.name || '';
  if (emojiEl) emojiEl.value = p.emoji || '';
  if (promptEl) promptEl.value = p.prompt || '';
  studioError('');
}

function resetStudioForm() {
  editingPersonaId = null;
  fillStudioForm({});
  const saveBtn = document.getElementById('studioSaveBtn');
  const resetBtn = document.getElementById('studioResetBtn');
  const form = document.querySelector('#studioOverlay .studio-form');
  const title = document.getElementById('studioFormTitle');
  if (saveBtn) saveBtn.innerHTML = '<i class="fas fa-plus"></i> Create persona';
  if (resetBtn) resetBtn.style.display = 'none';
  if (form) form.classList.remove('editing');
  if (title) title.textContent = 'New persona';
}

function saveStudioPersona() {
  const nameEl = document.getElementById('studioName');
  const emojiEl = document.getElementById('studioEmoji');
  const promptEl = document.getElementById('studioPrompt');
  if (!nameEl || !promptEl) return;
  const name = nameEl.value.trim();
  const prompt = promptEl.value.trim();
  const emoji = ((emojiEl ? emojiEl.value.trim() : '') || '✦').slice(0, 2);
  if (!name || !prompt) { studioError('A persona needs a name and a system prompt.'); return; }
  const now = Date.now();
  if (editingPersonaId) {
    const p = personas.find(x => x.id === editingPersonaId);
    if (p) {
      p.name = name.slice(0, 40);
      p.emoji = emoji;
      p.prompt = prompt.slice(0, MAX_PERSONA_PROMPT);
      p.updatedAt = now;
    }
  } else {
    if (personas.length >= MAX_PERSONAS) { studioError('Persona limit reached (' + MAX_PERSONAS + ').'); return; }
    personas.push({ id: makePersonaId(), name: name.slice(0, 40), emoji, prompt: prompt.slice(0, MAX_PERSONA_PROMPT), builtin: false, createdAt: now, updatedAt: now });
  }
  studioError('');
  persistPersonasLocal();
  schedulePersonaSync();
  resetStudioForm();
  renderPersonaStudioList();
  renderPersonaMenu();
  updatePersonaPill();
}

function editPersona(id) {
  const p = personas.find(x => x.id === id);
  if (!p) return;
  editingPersonaId = id;
  fillStudioForm(p);
  const saveBtn = document.getElementById('studioSaveBtn');
  const resetBtn = document.getElementById('studioResetBtn');
  const form = document.querySelector('#studioOverlay .studio-form');
  const title = document.getElementById('studioFormTitle');
  if (saveBtn) saveBtn.innerHTML = '<i class="fas fa-check"></i> Save persona';
  if (resetBtn) resetBtn.style.display = 'inline-flex';
  if (form) form.classList.add('editing');
  if (title) title.textContent = 'Editing: ' + p.name;
  const nameEl = document.getElementById('studioName');
  if (nameEl) nameEl.focus();
}

function duplicatePersona(id) {
  const p = personaById(id);
  if (!p) return;
  editingPersonaId = null;
  fillStudioForm({ name: p.name + ' copy', emoji: p.emoji, prompt: p.prompt });
  const saveBtn = document.getElementById('studioSaveBtn');
  const resetBtn = document.getElementById('studioResetBtn');
  const form = document.querySelector('#studioOverlay .studio-form');
  const title = document.getElementById('studioFormTitle');
  if (saveBtn) saveBtn.innerHTML = '<i class="fas fa-plus"></i> Create persona';
  if (resetBtn) resetBtn.style.display = 'none';
  if (form) form.classList.remove('editing');
  if (title) title.textContent = 'New persona';
}

function deletePersona(id) {
  const i = personas.findIndex(x => x.id === id);
  if (i < 0) return;
  personas.splice(i, 1);
  personasDeleted[id] = Date.now();
  if (editingPersonaId === id) resetStudioForm();
  if (defaultPersonaId === id) defaultPersonaId = 'p_stelena';
  chats.forEach(c => { if (c.personaId === id) c.personaId = 'p_stelena'; });
  persistPersonasLocal();
  persistLocal();
  schedulePersonaSync();
  renderPersonaStudioList();
  renderPersonaMenu();
  updatePersonaPill();
  updateWelcomePersona();
}

function renderPersonaStudioList() {
  const list = document.getElementById('studioPersonaList');
  if (!list) return;
  list.innerHTML = '';
  allPersonas().forEach(p => {
    const row = document.createElement('div');
    row.className = 'persona-item' + (p.builtin ? ' persona-item--builtin' : '');
    row.innerHTML =
      `<span class="persona-item__emoji">${escapeHtml(p.emoji || '✦')}</span>` +
      `<span class="persona-item__main"><span class="persona-item__name">${escapeHtml(p.name)}` +
      (p.builtin ? ' <span class="persona-item__tag">Built-in</span>' : '') +
      `</span><span class="persona-item__desc">${escapeHtml((p.prompt || '').slice(0, 110))}${(p.prompt || '').length > 110 ? '…' : ''}</span></span>` +
      `<span class="persona-item__tools"></span>`;
    const tools = row.querySelector('.persona-item__tools');
    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'studio-icon-btn';
    editBtn.title = p.builtin ? 'Duplicate' : 'Edit';
    editBtn.innerHTML = p.builtin ? '<i class="fas fa-copy"></i>' : '<i class="fas fa-pen"></i>';
    editBtn.addEventListener('click', () => { if (p.builtin) duplicatePersona(p.id); else editPersona(p.id); });
    tools.appendChild(editBtn);
    if (!p.builtin) {
      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'studio-icon-btn studio-icon-btn--danger';
      delBtn.title = 'Delete';
      delBtn.innerHTML = '<i class="fas fa-trash"></i>';
      delBtn.addEventListener('click', () => {
        if (delBtn.dataset.armed === '1') { deletePersona(p.id); return; }
        delBtn.dataset.armed = '1';
        delBtn.classList.add('armed');
        delBtn.title = 'Click again to delete';
        setTimeout(() => { delete delBtn.dataset.armed; delBtn.classList.remove('armed'); delBtn.title = 'Delete'; }, 2500);
      });
      tools.appendChild(delBtn);
    }
    list.appendChild(row);
  });
}

function renderMemoryStudio() {
  const list = document.getElementById('studioMemoryList');
  const toggle = document.getElementById('memoryToggle');
  const clearBtn = document.getElementById('memoryClearBtn');
  if (toggle) {
    toggle.classList.toggle('on', memoryEnabled);
    toggle.setAttribute('aria-checked', String(memoryEnabled));
  }
  if (clearBtn) clearBtn.style.display = facts.length ? 'inline-flex' : 'none';
  if (!list) return;
  list.innerHTML = '';
  if (!facts.length) {
    const empty = document.createElement('div');
    empty.className = 'studio-empty';
    empty.textContent = 'Nothing remembered yet. Stelena will save useful facts as you chat.';
    list.appendChild(empty);
    return;
  }
  factsSorted().forEach(f => {
    const row = document.createElement('div');
    row.className = 'memory-item';
    row.innerHTML =
      `<span class="memory-item__main"><span class="memory-item__key">${escapeHtml(f.key)}</span>` +
      `<span class="memory-item__value">${escapeHtml(f.value)}</span></span>`;
    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'studio-icon-btn studio-icon-btn--danger';
    del.title = 'Forget';
    del.innerHTML = '<i class="fas fa-trash"></i>';
    del.addEventListener('click', () => deleteFact(f.id));
    row.appendChild(del);
    list.appendChild(row);
  });
}

function setStudioTab(tab) {
  document.querySelectorAll('.studio-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
  document.querySelectorAll('.studio-pane').forEach(p => p.classList.toggle('active', p.dataset.pane === tab));
}

function openStudio(tab) {
  const overlay = document.getElementById('studioOverlay');
  if (!overlay || streaming) return;
  resetStudioForm();
  renderPersonaStudioList();
  renderMemoryStudio();
  setStudioTab(tab || 'personas');
  overlay.classList.add('open');
  overlay.setAttribute('aria-hidden', 'false');
}

function closeStudio() {
  const overlay = document.getElementById('studioOverlay');
  if (!overlay) return;
  overlay.classList.remove('open');
  overlay.setAttribute('aria-hidden', 'true');
}

function toggleMemory() {
  memoryEnabled = !memoryEnabled;
  persistMemoryLocal();
  scheduleMemorySync();
  renderMemoryStudio();
}

function initChooserDock() {
  const composer = document.getElementById('composer');
  if (!composer) return;
  const apply = () => {
    const h = composer.offsetHeight || 56;
    document.documentElement.style.setProperty('--composer-h', h + 'px');
  };
  apply();
  if (window.ResizeObserver) new ResizeObserver(apply).observe(composer);
  else window.addEventListener('resize', apply);
}

function initStudio() {
  const overlay = document.getElementById('studioOverlay');
  if (!overlay) return;
  const close = document.getElementById('studioClose');
  if (close) close.addEventListener('click', closeStudio);
  overlay.addEventListener('click', e => { if (e.target === overlay) closeStudio(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && overlay.classList.contains('open')) closeStudio(); });
  document.querySelectorAll('.studio-tab').forEach(tab => tab.addEventListener('click', () => setStudioTab(tab.dataset.tab)));
  const manage = document.getElementById('personaManageBtn');
  if (manage) manage.addEventListener('click', () => openStudio('personas'));
  const saveBtn = document.getElementById('studioSaveBtn');
  if (saveBtn) saveBtn.addEventListener('click', saveStudioPersona);
  const resetBtn = document.getElementById('studioResetBtn');
  if (resetBtn) resetBtn.addEventListener('click', resetStudioForm);
  const memToggle = document.getElementById('memoryToggle');
  if (memToggle) memToggle.addEventListener('click', toggleMemory);
  const clearBtn = document.getElementById('memoryClearBtn');
  if (clearBtn) clearBtn.addEventListener('click', () => {
    if (clearBtn.dataset.armed === '1') { clearBtn.dataset.armed = ''; clearBtn.classList.remove('armed'); clearAllFacts(); return; }
    clearBtn.dataset.armed = '1';
    clearBtn.classList.add('armed');
    setTimeout(() => { clearBtn.dataset.armed = ''; clearBtn.classList.remove('armed'); }, 2500);
  });
  ['studioName', 'studioEmoji', 'studioPrompt'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', () => studioError(''));
  });
}

function initPersonaSelect() {
  const pill = document.getElementById('personaPill');
  const menu = document.getElementById('personaMenu');
  if (!pill || !menu) return;
  renderPersonaMenu();
  function closeMenu() {
    menu.classList.remove('open');
    pill.classList.remove('open');
    pill.setAttribute('aria-expanded', 'false');
  }
  window._aiClosePersonaMenu = closeMenu;
  pill.addEventListener('click', e => {
    e.stopPropagation();
    if (menu.classList.contains('open')) closeMenu();
    else {
      const mm = document.getElementById('modelMenu');
      const mp = document.getElementById('modelPill');
      if (mm) mm.classList.remove('open');
      if (mp) { mp.classList.remove('open'); mp.setAttribute('aria-expanded', 'false'); }
      if (window._aiCloseVoiceMenu) window._aiCloseVoiceMenu();
      renderPersonaMenu(); menu.classList.add('open'); pill.classList.add('open'); pill.setAttribute('aria-expanded', 'true');
    }
  });
  document.addEventListener('click', closeMenu);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeMenu(); });
}

function renderPersonaMenu() {
  const list = document.getElementById('persona-menu-list');
  if (!list) return;
  const chat = activeChat();
  const currentId = chat ? (chat.personaId || defaultPersonaId) : defaultPersonaId;
  const locked = !!(chat && messages.length > 0);
  list.innerHTML = '';
  const builtins = BUILTIN_PERSONAS;
  const customs = personas;
  const addSection = label => {
    if (label) {
      const head = document.createElement('div');
      head.className = 'persona-menu__section';
      head.textContent = label;
      list.appendChild(head);
    }
  };
  const addOption = p => {
    const opt = document.createElement('button');
    opt.type = 'button';
    opt.className = 'ai-model-option persona-option' + (p.id === currentId ? ' active' : '') + (locked ? ' disabled' : '');
    opt.innerHTML =
      `<span class="ai-model-option__name"><span class="persona-option__emoji">${escapeHtml(p.emoji || '✦')}</span>${escapeHtml(p.name)}</span>` +
      `<span class="ai-model-option__desc">${escapeHtml((p.prompt || '').slice(0, 80))}${(p.prompt || '').length > 80 ? '…' : ''}</span>`;
    opt.addEventListener('click', e => {
      e.stopPropagation();
      if (locked) return;
      selectPersona(p.id);
    });
    list.appendChild(opt);
  };
  addSection(customs.length ? 'Built-in' : '');
  builtins.forEach(addOption);
  if (customs.length) {
    addSection('Your personas');
    customs.forEach(addOption);
  }
  updatePersonaPill();
}

function selectPersona(id) {
  const chat = activeChat();
  const p = personaById(id);
  if (chat) {
    if (messages.length > 0) { addSystem('Start a new chat to change persona.'); return; }
    chat.personaId = id;
  }
  defaultPersonaId = id;
  persistLocal();
  persistPersonasLocal();
  schedulePersonaSync();
  updatePersonaPill();
  updateWelcomePersona();
  if (window._aiClosePersonaMenu) window._aiClosePersonaMenu();
  if (p) addSystem('Persona: ' + p.name);
}

function updatePersonaPill() {
  const pill = document.getElementById('personaPill');
  const nameEl = document.getElementById('selectedPersonaName');
  const emojiEl = document.getElementById('selectedPersonaEmoji');
  if (!pill || !nameEl) return;
  const chat = activeChat();
  const p = personaById(chat ? chat.personaId : defaultPersonaId);
  nameEl.textContent = p.name;
  if (emojiEl) emojiEl.textContent = p.emoji || '✦';
  const locked = !!(chat && messages.length > 0);
  pill.classList.toggle('locked', locked);
  pill.title = locked ? 'Start a new chat to change persona' : 'Choose a persona for this chat';
}

function updateWelcomePersona() {
  const el = document.getElementById('welcomePersona');
  if (!el) return;
  const chat = activeChat();
  const p = personaById(chat ? chat.personaId : defaultPersonaId);
  if (!p || p.id === 'p_stelena') { el.hidden = true; el.textContent = ''; return; }
  el.hidden = false;
  el.innerHTML = `<span class="welcome-persona__emoji">${escapeHtml(p.emoji || '✦')}</span> Chatting as <strong>${escapeHtml(p.name)}</strong>`;
}

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

async function requestReply(userContent, opts = {}) {
  setStreaming(true);
  showTyping();
  controller = new AbortController();
  const chatId = activeChatId;

  let system;
  if (talkMode) {
    system = talkSystemPrompt();
  } else {
    system = composeSystem(activeChat(), opts);
  }

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
        system,
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

    if (talkMode) beginTalkAiTurn();

    if (!contentType.includes('text/event-stream')) {
      const data = await res.json();
      const parsed = extractMemory(data.content || '');
      const reply = parsed.clean;
      if (talkMode) { setTalkAiText(reply); finishTalkAiTurn(); }
      const bubble = addMessage(reply, 'ai', messages.length - 1);
      messages.push({ role: 'assistant', content: reply });
      if (!talkMode && parsed.fact && saveFact(parsed.fact)) attachMemoryChip(bubble, parsed.fact);
      noteChange();
      if (talkMode && reply) speakReply(reply);
    } else {
      streamBubble = addMessage('', 'ai');
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let curEvent = '';
      let reply = '';
      let lastTalkMirror = 0;

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
          streamBubble.innerHTML = marked.parse(stripMemoryDirective(reply));
          scrollBottom();
          if (talkMode && Date.now() - lastTalkMirror > 80) {
            setTalkAiText(reply);
            lastTalkMirror = Date.now();
          }
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

      const parsed = talkMode ? { clean: reply, fact: null } : extractMemory(reply);
      const cleanReply = parsed.clean;
      if (cleanReply !== reply) streamBubble.innerHTML = marked.parse(cleanReply);
      messages.push({ role: 'assistant', content: cleanReply });
      attachAiActions(streamBubble, messages.length - 1);
      if (!talkMode && parsed.fact && saveFact(parsed.fact)) attachMemoryChip(streamBubble, parsed.fact);
      noteChange();
      if (talkMode) { setTalkAiText(reply); finishTalkAiTurn(); }
      if (talkMode && reply) speakReply(reply);
    }
  } catch (err) {
    hideTyping();
    if (err.name === 'AbortError') {
      if (streamBubble) {
        const partial = streamBubble.textContent.trim();
        if (partial) {
          if (talkMode) { setTalkAiText(partial); finishTalkAiTurn(); }
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
      if (talkMode) {
        const lastMini = talkMini[talkMini.length - 1];
        if (lastMini && lastMini.role === 'ai' && !lastMini.text) talkMini.pop();
        finishTalkAiTurn();
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

function regenerateMessage(idx) {
  if (streaming || idx == null || idx < 1) return;
  const prev = messages[idx - 1];
  if (!prev || prev.role !== 'user') return;
  messages = messages.slice(0, idx);
  renderConversation();
  noteChange();
  requestReply(prev.content);
}

function continueReply(idx) {
  if (streaming || idx == null) return;
  if (idx !== messages.length - 1) return;
  const last = messages[idx];
  if (!last || last.role !== 'assistant') return;
  requestReply('', { continue: true });
}

function editMessage(idx) {
  if (streaming || idx == null || idx < 0) return;
  const text = messages[idx] ? messages[idx].content : '';
  messages = messages.slice(0, idx);
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


const AI_CHATS_LS = 'plu_ai_chats';
const AI_CHATS_DOC = 'ai_chats';
let _syncT = null;

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

function scheduleSync() {
  if (!currentUser()) return;
  clearTimeout(_syncT);
  _syncT = setTimeout(pushChats, 1200);
}

async function pushChats() {
  if (!currentUser()) return;
  try {
    await PlutoniumStore.setDoc(AI_CHATS_DOC, { chats, voice: ttsVoice, lastSync: new Date() });
  } catch (e) { console.warn('[ai] chat sync push failed:', e); }
}

async function pullChats() {
  if (!currentUser()) return;
  try {
    const doc = await PlutoniumStore.getDoc(AI_CHATS_DOC);
    if (doc) {
      if (doc.voice) applyVoice(doc.voice);
      if (Array.isArray(doc.chats) && doc.chats.length) {
        chats = mergeChats(chats, doc.chats);
        if (!chats.some(c => c.id === activeChatId)) activeChatId = null;
        persistLocal();
        renderChatList();
        const target = chats.find(c => c.id === activeChatId) || chats[0] || null;
        if (target) openChat(target.id);
        else { messages = []; renderConversation(); }
      }
    }
  } catch (e) { console.warn('[ai] chat sync pull failed:', e); }
}

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
  if (bK.every((k, i) => aK[i] === k)) return b.slice();
  if (aK.every((k, i) => bK[i] === k)) return a.slice();
  const [base, other] = a.length >= b.length ? [a, b] : [b, a];
  const seen = new Set(base.map(key));
  const merged = base.slice();
  other.forEach(m => { if (!seen.has(key(m))) { merged.push(m); seen.add(key(m)); } });
  return merged;
}

const PERSONAS_LS = 'plu_ai_personas';
const MEMORY_LS = 'plu_ai_memory';
const PERSONAS_DOC = 'ai_personas';
const MEMORY_DOC = 'ai_memory';
const MAX_PERSONAS = 50;
const MAX_PERSONA_PROMPT = 4000;
const MAX_FACTS = 200;
const MAX_FACT_VALUE = 500;

let _personaSyncT = null;
let _memorySyncT = null;

function persistPersonasLocal() {
  try { localStorage.setItem(PERSONAS_LS, JSON.stringify({ personas, defaultPersonaId })); } catch (_) {}
}

function loadLocalPersonas() {
  try {
    const raw = localStorage.getItem(PERSONAS_LS);
    const data = raw ? JSON.parse(raw) : null;
    if (data) {
      if (Array.isArray(data.personas)) personas = data.personas.filter(p => p && p.id && p.name && p.prompt);
      if (typeof data.defaultPersonaId === 'string') defaultPersonaId = data.defaultPersonaId;
    }
  } catch (_) {}
  if (!Array.isArray(personas)) personas = [];
}

function persistMemoryLocal() {
  try { localStorage.setItem(MEMORY_LS, JSON.stringify({ facts, enabled: memoryEnabled })); } catch (_) {}
}

function loadLocalMemory() {
  try {
    const raw = localStorage.getItem(MEMORY_LS);
    const data = raw ? JSON.parse(raw) : null;
    if (data) {
      if (Array.isArray(data.facts)) facts = data.facts.filter(f => f && f.id && f.key && f.value);
      if (typeof data.enabled === 'boolean') memoryEnabled = data.enabled;
    }
  } catch (_) {}
  if (!Array.isArray(facts)) facts = [];
}

function mergeById(localArr, remoteArr, deletedMap, stamp) {
  const out = new Map();
  (localArr || []).forEach(x => { if (x && x.id) out.set(x.id, x); });
  (remoteArr || []).forEach(r => {
    if (!r || !r.id) return;
    const l = out.get(r.id);
    if (!l) { out.set(r.id, r); return; }
    out.set(r.id, (stamp(r) || 0) > (stamp(l) || 0) ? r : l);
  });
  Object.keys(deletedMap || {}).forEach(id => out.delete(id));
  return Array.from(out.values());
}

function schedulePersonaSync() {
  if (!currentUser()) return;
  clearTimeout(_personaSyncT);
  _personaSyncT = setTimeout(pushPersonas, 1200);
}

function scheduleMemorySync() {
  if (!currentUser()) return;
  clearTimeout(_memorySyncT);
  _memorySyncT = setTimeout(pushMemory, 1200);
}

async function pushPersonas() {
  if (!currentUser()) return;
  try {
    await PlutoniumStore.setDoc(PERSONAS_DOC, { list: personas, deleted: personasDeleted, defaultPersonaId, lastSync: new Date() });
  } catch (e) { console.warn('[ai] persona sync push failed:', e); }
}

async function pullPersonas() {
  if (!currentUser()) return;
  try {
    const doc = await PlutoniumStore.getDoc(PERSONAS_DOC);
    if (!doc) return;
    if (doc.deleted && typeof doc.deleted === 'object' && !Array.isArray(doc.deleted)) {
      personasDeleted = Object.assign({}, personasDeleted, doc.deleted);
    }
    const remote = Array.isArray(doc.list) ? doc.list.filter(p => p && p.id && p.name && p.prompt) : [];
    personas = mergeById(personas, remote, personasDeleted, x => x.updatedAt || x.createdAt || 0);
    if (typeof doc.defaultPersonaId === 'string') defaultPersonaId = doc.defaultPersonaId;
    persistPersonasLocal();
    renderPersonaMenu();
    renderPersonaStudioList();
    updatePersonaPill();
    updateWelcomePersona();
  } catch (e) { console.warn('[ai] persona sync pull failed:', e); }
}

async function pushMemory() {
  if (!currentUser()) return;
  try {
    await PlutoniumStore.setDoc(MEMORY_DOC, { facts, deleted: factsDeleted, enabled: memoryEnabled, lastSync: new Date() });
  } catch (e) { console.warn('[ai] memory sync push failed:', e); }
}

async function pullMemory() {
  if (!currentUser()) return;
  try {
    const doc = await PlutoniumStore.getDoc(MEMORY_DOC);
    if (!doc) return;
    if (doc.deleted && typeof doc.deleted === 'object' && !Array.isArray(doc.deleted)) {
      factsDeleted = Object.assign({}, factsDeleted, doc.deleted);
    }
    const remote = Array.isArray(doc.facts) ? doc.facts.filter(f => f && f.id && f.key && f.value) : [];
    facts = mergeById(facts, remote, factsDeleted, x => x.ts || 0);
    if (typeof doc.enabled === 'boolean') memoryEnabled = doc.enabled;
    persistMemoryLocal();
    renderMemoryStudio();
  } catch (e) { console.warn('[ai] memory sync pull failed:', e); }
}

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
  if (typeof accountManager !== 'undefined' && accountManager.recordRecent) {
    const n = (chat.messages || []).length;
    accountManager.recordRecent({
      type: 'ai',
      id: chat.id,
      title: chat.title || 'New chat',
      sub: n ? n + (n === 1 ? ' message' : ' messages') : '',
      href: 'pluto://ai',
    });
  }
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
  if (typeof accountManager !== 'undefined' && accountManager.removeRecent) accountManager.removeRecent('ai', id);
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
    const del = item.querySelector('.ai-chat-del');
    if (del) del.addEventListener('click', e => {
      e.stopPropagation();
      if (del.dataset.armed === '1') { deleteChat(chat.id); return; }
      del.dataset.armed = '1';
      del.classList.add('armed');
      del.title = 'Click again to delete';
      setTimeout(() => { delete del.dataset.armed; del.classList.remove('armed'); del.title = 'Delete chat'; }, 2500);
    });
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
  const nc = document.getElementById('aiNewChat');
  if (nc) nc.addEventListener('click', newChat);
}

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

function ttsFixPronunciations(text) {
  return String(text || '').replace(/\bStelena\b/gi, 'Sss-tell-n-a');
}

function resetTtsBtns() {
  document.querySelectorAll('.msg-act.playing').forEach(b => {
    b.classList.remove('playing');
    b.innerHTML = '<i class="fa-solid fa-volume-up"></i> Listen';
  });
}

function speakText(text, btn) {
  if (ttsAudio && !ttsAudio.paused) {
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
      input: ttsFixPronunciations(clean),
      voice: ttsVoice,
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


let talkMode = false;
let talkAbort = false;
let talkStream = null;
let talkRecorder = null;
let talkCtx = null;
let talkAnalyser = null;
let talkSilenceTimer = null;
let talkLiveTimer = null;
let talkLiveBusy = false;
let talkChunks = [];
let talkMini = [];
let talkAiStreaming = false;
let talkPlaySrc = null;
let talkStopReq = false;
let talkGenId = 0;
let talkOutAnalyser = null;
let talkPulseRAF = null;
let talkCurPulse = 0;
let _talkLevelBuf = null;

function setOrbState(state) {
  const orb = document.getElementById('talkOrb');
  const st = document.getElementById('talkStatus');
  const stopEl = document.getElementById('talkStop');
  if (orb) {
    orb.dataset.state = state;
    if (window.PlutoniumOrb) {
      window.PlutoniumOrb.setState(state === 'listening' ? 0 : state === 'thinking' ? 1 : state === 'voicing' ? 2 : 3);
    }
  }
  if (st) {
    st.textContent = state === 'listening' ? 'Listening…'
      : state === 'thinking' ? 'Thinking…'
      : state === 'voicing' ? 'Generating voice…'
      : 'Speaking…';
  }
  if (stopEl) stopEl.style.display = (state === 'thinking' || state === 'voicing' || state === 'speaking') ? 'flex' : 'none';
  const sendEl = document.getElementById('talkSend');
  if (sendEl) sendEl.style.display = state === 'listening' ? 'flex' : 'none';
}

function renderTalkMini() {
  const box = document.getElementById('talkMiniChat');
  if (!box) return;
  box.innerHTML = '';
  talkMini.slice(-8).forEach((m, i, arr) => {
    const el = document.createElement('div');
    el.className = 'talk-minichat__msg ' + (m.role === 'user' ? 'talk-minichat__msg--user' : 'talk-minichat__msg--ai');
    if (m.role === 'ai' && talkAiStreaming && i === arr.length - 1) el.classList.add('streaming');
    if (m.role === 'ai') el.innerHTML = marked.parse(stripMemoryDirective(m.text || ''));
    else el.textContent = m.text;
    box.appendChild(el);
  });
  box.scrollTop = box.scrollHeight;
}

function setTalkUserText(text, final) {
  if (!text) return;
  const last = talkMini[talkMini.length - 1];
  if (!last || last.role !== 'user' || last.final) talkMini.push({ role: 'user', text: '', final: false });
  const e = talkMini[talkMini.length - 1];
  e.text = text;
  if (final) e.final = true;
  renderTalkMini();
}

function beginTalkAiTurn() {
  talkMini.push({ role: 'ai', text: '' });
  talkAiStreaming = true;
  renderTalkMini();
}

function setTalkAiText(text) {
  if (!talkMini.length || talkMini[talkMini.length - 1].role !== 'ai') beginTalkAiTurn();
  talkMini[talkMini.length - 1].text = text;
  renderTalkMini();
}

function finishTalkAiTurn() {
  talkAiStreaming = false;
  renderTalkMini();
}

function openOverlay() {
  const ov = document.getElementById('talkOverlay');
  if (ov) { ov.classList.add('open'); ov.setAttribute('aria-hidden', 'false'); }
}

function closeOverlay() {
  const ov = document.getElementById('talkOverlay');
  if (ov) { ov.classList.remove('open'); ov.setAttribute('aria-hidden', 'true'); }
}

function toggleTalk() {
  if (talkMode) stopTalkMode();
  else startTalkMode();
}

async function startTalkMode() {
  if (!currentUser() || !authed) { addSystem('Please sign in to use Talk mode.'); return; }
  if (!window.MediaRecorder) { addSystem('Voice recording is not supported in this browser.'); return; }
  talkMode = true;
  const curChat = activeChat();
  if (curChat && curChat.messages.length) newChat();

  openOverlay();

  const orbCanvas = document.getElementById('talkOrbCanvas');
  if (orbCanvas && window.PlutoniumOrb) {
    const accent = (getComputedStyle(document.documentElement).getPropertyValue('--workspace-accent-rgb') || '232,23,93').trim();
    const rgb = accent.split(',').map(Number);
    const ok = window.PlutoniumOrb.attach(orbCanvas, { accent: rgb });
    const orbEl = orbCanvas.closest('.talk-orb');
    if (orbEl) orbEl.classList.toggle('shader-on', ok);
  }
  startTalkPulse();

  const btn = document.getElementById('talkBtn');
  if (btn) btn.classList.add('active');
  await beginListen();
}

function getTalkLevel(analyser) {
  if (!analyser) return 0;
  if (!_talkLevelBuf || _talkLevelBuf.length !== analyser.fftSize) _talkLevelBuf = new Uint8Array(analyser.fftSize);
  analyser.getByteTimeDomainData(_talkLevelBuf);
  let sum = 0;
  for (let i = 0; i < _talkLevelBuf.length; i++) { const v = (_talkLevelBuf[i] - 128) / 128; sum += v * v; }
  return Math.min(1, Math.sqrt(sum / _talkLevelBuf.length) * 5);
}

function talkPulseLoop() {
  if (!talkMode) { talkPulseRAF = null; return; }
  const orbEl = document.getElementById('talkOrb');
  const state = orbEl ? orbEl.dataset.state : '';
  let level = 0;
  if (state === 'listening') level = getTalkLevel(talkAnalyser);
  else if (state === 'speaking') level = getTalkLevel(talkOutAnalyser);
  talkCurPulse += (level - talkCurPulse) * 0.16;
  if (window.PlutoniumOrb) window.PlutoniumOrb.setPulse(talkCurPulse);
  talkPulseRAF = requestAnimationFrame(talkPulseLoop);
}

function startTalkPulse() {
  if (!talkPulseRAF) talkPulseRAF = requestAnimationFrame(talkPulseLoop);
}

async function beginListen() {
  if (!talkMode) return;
  setOrbState('listening');
  talkAbort = false;
  try {
    talkStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (e) {
    console.error('[ai] mic denied:', e);
    addSystem('Microphone unavailable; allow mic access to use Talk mode.');
    stopTalkMode();
    return;
  }

  talkCtx = new (window.AudioContext || window.webkitAudioContext)();
  const src = talkCtx.createMediaStreamSource(talkStream);
  talkAnalyser = talkCtx.createAnalyser();
  talkAnalyser.fftSize = 1024;
  src.connect(talkAnalyser);
  talkOutAnalyser = talkCtx.createAnalyser();
  talkOutAnalyser.fftSize = 1024;

  const mime = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : '';
  talkChunks = [];
  talkRecorder = new MediaRecorder(talkStream, mime ? { mimeType: mime } : undefined);
  talkRecorder.ondataavailable = e => { if (e.data.size) talkChunks.push(e.data); };
  talkRecorder.onstop = () => {
    if (talkAbort || !talkMode) return;
    const blob = new Blob(talkChunks, { type: mime || 'audio/webm' });
    transcribeAndReply(blob);
  };
  talkRecorder.start(1000);

  talkLiveTimer = setInterval(runLiveTranscribe, 2500);
}

function stopTalkRecording() {
  if (talkSilenceTimer) { clearInterval(talkSilenceTimer); talkSilenceTimer = null; }
  if (talkLiveTimer) { clearInterval(talkLiveTimer); talkLiveTimer = null; }
  if (talkRecorder && talkRecorder.state !== 'inactive') talkRecorder.stop();
}

async function runLiveTranscribe() {
  if (talkLiveBusy || !talkMode || !talkChunks.length) return;
  talkLiveBusy = true;
  try {
    const blob = new Blob(talkChunks.slice(), { type: 'audio/webm' });
    const form = new FormData();
    form.append('file', blob, 'talk.webm');
    form.append('model', 'whisper-large-v3-turbo');
    const res = await fetch(`${GROQ_WORKER}/transcribe`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${currentUser().idToken}` },
      body: form,
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && talkMode && (data.text || '').trim()) {
      setTalkUserText(data.text.trim());
    }
  } catch (e) {}
  finally { talkLiveBusy = false; }
}

async function transcribeAndReply(blob) {
  if (!talkMode) return;
  setOrbState('thinking');
  try {
    const form = new FormData();
    form.append('file', blob, 'talk.webm');
    form.append('model', 'whisper-large-v3-turbo');
    const res = await fetch(`${GROQ_WORKER}/transcribe`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${currentUser().idToken}` },
      body: form,
    });
    const data = await res.json().catch(() => ({}));
    const text = (data.text || '').trim();
    if (!res.ok || !text) {
      addSystem('Could not hear you; please try again.');
      resumeListening();
      return;
    }
    setTalkUserText(text, true);
    const input = inputEl();
    input.value = text;
    sendMessage();
  } catch (e) {
    console.error('[ai] transcribe failed:', e);
    addSystem('Voice error; try again.');
    resumeListening();
  }
}

function speakReply(text) {
  const clean = ttsFixPronunciations(stripMarkdown(text));
  if (!clean) { resumeListening(); return; }
  const genId = talkGenId;
  setOrbState('voicing');
  playTts(clean, () => { if (genId === talkGenId) setOrbState('speaking'); })
    .then(() => { if (genId === talkGenId) resumeListening(); })
    .catch(() => { if (genId === talkGenId) { addSystem('Voice playback failed.'); resumeListening(); } });
}
async function playTts(text, onStart) {
  const res = await fetch(`${GROQ_WORKER}/tts`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${currentUser().idToken}`,
    },
    body: JSON.stringify({ model: TTS_MODEL, input: text, voice: ttsVoice, response_format: 'wav' }),
  });
  if (!res.ok) throw new Error(`TTS HTTP ${res.status}`);
  const buf = await (await res.blob()).arrayBuffer();
  if (talkCtx && talkCtx.state === 'suspended') { try { await talkCtx.resume(); } catch (_) {} }
  const ctx = talkCtx || new (window.AudioContext || window.webkitAudioContext)();
  const audioBuf = await ctx.decodeAudioData(buf);
  if (talkStopReq) { talkStopReq = false; return; }
  await new Promise((resolve, reject) => {
    const src = ctx.createBufferSource();
    src.buffer = audioBuf;
    src.connect(ctx.destination);
    if (talkOutAnalyser && ctx === talkCtx) src.connect(talkOutAnalyser);
    const done = () => { if (talkPlaySrc === src) talkPlaySrc = null; resolve(); };
    src.onended = done;
    src.onerror = () => { if (talkPlaySrc === src) talkPlaySrc = null; reject(new Error('playback')); };
    talkPlaySrc = src;
    src.start();
    if (onStart) onStart();
  });
}

function resumeListening() {
  if (!talkMode) return;
  cleanupTalkAudio();
  beginListen();
}

function cleanupTalkAudio() {
  if (talkSilenceTimer) { clearInterval(talkSilenceTimer); talkSilenceTimer = null; }
  if (talkLiveTimer) { clearInterval(talkLiveTimer); talkLiveTimer = null; }
  if (talkRecorder && talkRecorder.state !== 'inactive') {
    try { talkRecorder.stop(); } catch (_) {}
  }
  talkRecorder = null;
  if (talkStream) { talkStream.getTracks().forEach(t => t.stop()); talkStream = null; }
  if (talkCtx) { try { talkCtx.close(); } catch (_) {} talkCtx = null; }
  talkAnalyser = null;
  talkOutAnalyser = null;
}

function sendTalkNow() {
  if (!talkMode) return;
  stopTalkRecording();
}

function stopTalkMode() {
  talkMode = false;
  talkAbort = true;
  if (controller) controller.abort();
  if (talkPlaySrc) { try { talkPlaySrc.stop(); } catch (_) {} talkPlaySrc = null; }
  stopTalkRecording();
  cleanupTalkAudio();
  if (window.PlutoniumOrb) window.PlutoniumOrb.detach();
  if (talkPulseRAF) { cancelAnimationFrame(talkPulseRAF); talkPulseRAF = null; }
  talkCurPulse = 0;
  talkMini = [];
  talkAiStreaming = false;
  renderTalkMini();
  closeOverlay();
  const btn = document.getElementById('talkBtn');
  if (btn) btn.classList.remove('active');
}

function stopTalkResponse() {
  if (!talkMode) return;
  talkGenId++;
  talkStopReq = true;
  if (talkPlaySrc) { try { talkPlaySrc.stop(); } catch (_) {} talkPlaySrc = null; }
  if (controller) controller.abort();
  setOrbState('listening');
  cleanupTalkAudio();
  beginListen();
}

function initTalkMode() {
  const close = document.getElementById('talkClose');
  if (close) close.addEventListener('click', stopTalkMode);
  const stop = document.getElementById('talkStop');
  if (stop) stop.addEventListener('click', stopTalkResponse);
  const send = document.getElementById('talkSend');
  if (send) send.addEventListener('click', sendTalkNow);
  const orb = document.getElementById('talkOrb');
  if (orb) orb.addEventListener('click', stopTalkMode);
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && talkMode) stopTalkMode();
  });
}

let _inited = false;

let _quotaTimer = null;

function refreshQuota() {
  const textEl = document.getElementById('aiQuotaText');
  const barEl = document.getElementById('aiQuotaBar');
  if (!textEl) return;
  const apply = u => {
    if (!u) { textEl.textContent = 'Unavailable'; return; }
    textEl.textContent = u.remaining + ' / ' + u.max;
    if (barEl) barEl.style.width = Math.max(0, Math.min(100, Math.round((u.remaining / u.max) * 100))) + '%';
  };
  if (typeof window.fetchAIUsage === 'function') window.fetchAIUsage().then(apply);
  else textEl.textContent = 'Unavailable';
}
window.refreshQuota = refreshQuota;

function initQuota() {
  if (!document.getElementById('aiQuotaPill')) return;
  refreshQuota();
  if (_quotaTimer) clearInterval(_quotaTimer);
  _quotaTimer = setInterval(refreshQuota, 60000);
}

function init() {
  if (_inited) return;
  _inited = true;

  const welcome = document.getElementById('welcomeScreen');
  if (welcome) welcomeTemplate = welcome.cloneNode(true);

  loadLocalChats();
  loadLocalPersonas();
  loadLocalMemory();
  initChatList();
  renderChatList();
  openChat(activeChatId);

  initSpeech();
  initModelSelect();
  initVoiceSelect();
  initTalkMode();
  initChooserDock();
  initPersonaSelect();
  initStudio();
  initQuota();
  updatePersonaPill();

  const clearBtn = document.getElementById('ai-clear-btn');
  if (clearBtn) clearBtn.addEventListener('click', clearConversation);

  const stop = stopBtn();
  if (stop) stop.addEventListener('click', stopGeneration);

  if (typeof PlutoniumStore !== 'undefined') {
    PlutoniumStore.onAuthChange(user => {
      setAuthed(!!user);
      if (user) { pullChats(); pullPersonas(); pullMemory(); }
    });
  }

  setTimeout(() => {
    setAuthed(!!currentUser());
  }, 300);
}

function consumeAiDeepLink() {
  const params = new URLSearchParams(window.PluWorkspaceRouteSuffix || location.search);
  const q = (params.get('q') || '').trim();
  if (!q) return;
  window.PluWorkspaceRouteSuffix = '';
  if (location.search) history.replaceState(null, '', location.pathname);

  const chat = makeChat(q.slice(0, 48));
  chats.unshift(chat);
  openChat(chat.id);
  const input = inputEl();
  if (input) input.value = q;

  setTimeout(() => {
    const root = document.getElementById('workspace-root');
    if (root && root.dataset.activeWorkspace !== 'ai') return;
    if (currentUser() && authed) sendMessage();
    else if (input) input.focus();
  }, 350);
}

window.addEventListener('plu-workspace-route', consumeAiDeepLink);

function runAiInit() {
  init();
  consumeAiDeepLink();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', runAiInit);
} else {
  runAiInit();
}