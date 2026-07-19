const GROQ_WORKER      = 'https://ai.cdn.plutoniumnet.work';
const HISTORY_DOC      = 'ai_chats/data';
const CHARACTERS_DOC   = 'ai_characters/data';
const BYOK_DOC         = 'ai_settings/byok';
const MAX_CHATS        = 30;
const MAX_CHARACTERS   = 20;
const DEFAULT_MODEL    = 'llama-3.3-70b-versatile';
const SYSTEM_PROMPT    = `You are Stelena, the official AI assistant of Plutonium Network.

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
The intelligence behind Plutonium Network.`;

const DEFAULT_CHARACTER = { id: 'default', name: 'Stelena', prompt: SYSTEM_PROMPT, isDefault: true };

const MODELS = [
  { id: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B',      group: 'Groq' },
  { id: 'llama-3.1-8b-instant',    label: 'Llama 3.1 8B',       group: 'Groq' },
  { id: 'openai/gpt-oss-120b',     label: 'GPT OSS 120B',       group: 'Groq' },
  { id: 'openai/gpt-oss-20b',      label: 'GPT OSS 20B',        group: 'Groq' },
  { id: 'qwen/qwen3.6-27b',        label: 'Qwen 3.6 27B',       group: 'Groq' },
  { id: 'groq/compound',           label: 'Groq Compound',      group: 'Groq' },
  { id: 'groq/compound-mini',      label: 'Groq Compound Mini', group: 'Groq' },
];

// ── State ─────────────────────────────────────────────────────────────────────

let chats           = [];
let activeChatId    = null;
let isStreaming     = false;
let currentModel    = DEFAULT_MODEL;
let characters      = [];
let activeCharId    = 'default';
let tempMode        = false;

// ── DOM refs ──────────────────────────────────────────────────────────────────

const gate         = document.getElementById('ai-gate');
const app          = document.getElementById('ai-app');
const signinBtn    = document.getElementById('ai-signin-btn');
const sidebar      = document.getElementById('ai-sidebar');
const chatList     = document.getElementById('ai-chat-list');
const newChatBtn   = document.getElementById('ai-new-chat');
const messages     = document.getElementById('ai-messages');
const inputEl      = document.getElementById('ai-input');
const sendBtn      = document.getElementById('ai-send-btn');
const modelDropdown   = document.getElementById('ai-model-dropdown');
const modelBtn        = document.getElementById('ai-model-btn');
const modelBtnLabel   = document.getElementById('ai-model-btn-label');
const modelPanel      = document.getElementById('ai-model-panel');
const chatTitle      = document.getElementById('ai-chat-title');
const emptyState     = document.getElementById('ai-empty');
const sidebarToggle  = document.getElementById('ai-sidebar-toggle');
const charToggleBtn  = document.getElementById('ai-char-toggle');
const charToggleName = document.getElementById('ai-char-toggle-name');
const charModal      = document.getElementById('ai-char-modal');
const charModalClose = document.getElementById('ai-char-modal-close');
const charList       = document.getElementById('ai-char-list');
const tabChat        = document.getElementById('ai-tab-chat');
const tabStudio      = document.getElementById('ai-tab-studio');
const viewChat       = document.getElementById('ai-view-chat');
const viewStudio     = document.getElementById('ai-view-studio');
const chatOnlyEls    = document.querySelectorAll('.ai-chat-only');
const studioNew      = document.getElementById('ai-studio-new');
const studioCharList = document.getElementById('ai-studio-char-list');
const studioEditorEmpty = document.getElementById('ai-studio-editor-empty');
const studioEditor   = document.getElementById('ai-studio-editor');
const studioName     = document.getElementById('ai-studio-name');
const studioPrompt   = document.getElementById('ai-studio-prompt');
const studioSave     = document.getElementById('ai-studio-save');
const studioCancel   = document.getElementById('ai-studio-cancel');
const studioDelete   = document.getElementById('ai-studio-delete');
const rlCount           = document.getElementById('ai-rl-count');
const rlBar             = document.getElementById('ai-rl-bar');
const tempToggleBtn     = document.getElementById('ai-temp-toggle');
const rlLabel           = document.getElementById('ai-rl-label');
const rlBarTrack        = document.getElementById('ai-rl-bar-track');
const rlReset           = document.getElementById('ai-rl-reset');
const byokBtn           = document.getElementById('ai-byok-btn');
const byokPanel         = document.getElementById('ai-byok-panel');
const byokClose         = document.getElementById('ai-byok-close');
const byokInput         = document.getElementById('ai-byok-input');
const byokSave          = document.getElementById('ai-byok-save');
const byokClear         = document.getElementById('ai-byok-clear');
const confirmOverlay    = document.getElementById('ai-confirm-overlay');
const confirmDialog     = document.getElementById('ai-confirm-dialog');
const confirmMsg        = document.getElementById('ai-confirm-msg');
const confirmOkBtn      = document.getElementById('ai-confirm-ok');
const confirmCancelBtn  = document.getElementById('ai-confirm-cancel');

// ── Custom confirm dialog ─────────────────────────────────────────────────────

let _confirmResolve = null;

function showConfirm(message, okLabel = 'Delete') {
  confirmMsg.textContent = message;
  confirmOkBtn.textContent = okLabel;
  confirmOverlay.style.display = 'flex';
  confirmDialog.classList.remove('ai-confirm-dialog--out');
  confirmDialog.classList.add('ai-confirm-dialog--in');
  return new Promise(resolve => { _confirmResolve = resolve; });
}

function _closeConfirm(result) {
  confirmDialog.classList.remove('ai-confirm-dialog--in');
  confirmDialog.classList.add('ai-confirm-dialog--out');
  setTimeout(() => {
    confirmOverlay.style.display = 'none';
    confirmDialog.classList.remove('ai-confirm-dialog--out');
  }, 180);
  if (_confirmResolve) { _confirmResolve(result); _confirmResolve = null; }
}

confirmOkBtn.addEventListener('click',     () => _closeConfirm(true));
confirmCancelBtn.addEventListener('click', () => _closeConfirm(false));
confirmOverlay.addEventListener('click', e => { if (e.target === confirmOverlay) _closeConfirm(false); });

// ── Model dropdown ────────────────────────────────────────────────────────────

function buildModelPanel() {
  const groups = [...new Set(MODELS.map(m => m.group))];
  modelPanel.innerHTML = groups.map(group => {
    const items = MODELS.filter(m => m.group === group);
    return `
      <div class="ai-model-group">
        <div class="ai-model-group__label">${group}</div>
        ${items.map(m => `
          <div class="ai-model-option${m.id === currentModel ? ' selected' : ''}" data-id="${m.id}">
            <span class="ai-model-option__name">${m.label}</span>
            <span class="ai-model-option__id">${m.id}</span>
          </div>`).join('')}
      </div>`;
  }).join('');
}

function setModel(id) {
  const m = MODELS.find(m => m.id === id);
  if (!m) return;
  currentModel = m.id;
  modelBtnLabel.textContent = m.label;
  buildModelPanel();
  const chat = activeChat();
  if (chat) { chat.model = currentModel; saveChats(); }
}

modelBtn.addEventListener('click', e => {
  e.stopPropagation();
  modelDropdown.classList.toggle('open');
  if (modelDropdown.classList.contains('open')) buildModelPanel();
});

modelPanel.addEventListener('click', e => {
  const opt = e.target.closest('.ai-model-option');
  if (!opt) return;
  setModel(opt.dataset.id);
  modelDropdown.classList.remove('open');
});

document.addEventListener('click', () => modelDropdown.classList.remove('open'));

// ── BYOK ─────────────────────────────────────────────────────────────────────

let byokKey = '';

function applyByokState() {
  const active = byokKey.startsWith('gsk_');
  byokBtn.classList.toggle('active', active);
  byokBtn.innerHTML = active
    ? '<i class="fa-solid fa-key"></i> Key active - unlimited'
    : '<i class="fa-solid fa-key"></i> Use your own API key';
  rlLabel.closest('.ai-rl-footer').classList.toggle('ai-rl-footer--byok', active);
  if (active) {
    rlCount.textContent   = '∞';
    rlBar.style.width     = '0%';
    rlBarTrack.style.display = 'none';
    rlReset.style.display    = 'none';
    rlLabel.textContent      = 'Unlimited (BYOK)';
  } else {
    rlBarTrack.style.display = '';
    rlReset.style.display    = '';
    rlLabel.textContent      = 'Messages sent';
    renderRateLimit();
  }
  if (byokInput) byokInput.value = byokKey;
}

byokBtn.addEventListener('click', () => {
  byokPanel.style.display = byokPanel.style.display === 'none' ? '' : 'none';
});
byokClose.addEventListener('click', () => { byokPanel.style.display = 'none'; });

byokSave.addEventListener('click', async () => {
  const val = byokInput.value.trim();
  if (!val.startsWith('gsk_')) {
    byokInput.classList.add('ai-byok-panel__input--error');
    setTimeout(() => byokInput.classList.remove('ai-byok-panel__input--error'), 800);
    return;
  }
  byokKey = val;
  byokPanel.style.display = 'none';
  applyByokState();
  await saveByok();
});

byokClear.addEventListener('click', async () => {
  byokKey = '';
  byokInput.value = '';
  byokPanel.style.display = 'none';
  applyByokState();
  await saveByok();
});

// ── Rate limit UI ─────────────────────────────────────────────────────────────

let rlUsed = 0;

function updateRateLimit(remaining) {
  if (byokKey.startsWith('gsk_')) return;
  rlUsed = 100 - remaining;
  renderRateLimit();
}

function incrementRateLimit() {
  if (byokKey.startsWith('gsk_')) return;
  rlUsed = Math.min(100, rlUsed + 1);
  renderRateLimit();
}

function renderRateLimit() {
  if (byokKey.startsWith('gsk_')) return;
  const pct = Math.min(100, (rlUsed / 100) * 100);
  rlCount.textContent = `${rlUsed} / 100`;
  rlBar.style.width   = pct + '%';
  rlBar.className = 'ai-rl-bar-fill' +
    (pct >= 90 ? ' danger' : pct >= 65 ? ' warn' : '');
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function activeChat() {
  return chats.find(c => c.id === activeChatId) || null;
}

function titleFromMessage(text) {
  return text.replace(/\s+/g, ' ').trim().slice(0, 40) || 'New Chat';
}

// ── Simple markdown renderer (bold, inline code, code blocks, line breaks) ───

function renderMarkdown(text) {
  // code blocks
  text = text.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) => {
    return `<pre><code class="ai-code${lang ? ' lang-' + lang : ''}">${escHtml(code.trim())}</code></pre>`;
  });
  // inline code
  text = text.replace(/`([^`]+)`/g, (_, c) => `<code class="ai-inline-code">${escHtml(c)}</code>`);
  // bold
  text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  // italic
  text = text.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  // line breaks
  text = text.replace(/\n/g, '<br>');
  return text;
}

function escHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ── Render helpers ────────────────────────────────────────────────────────────

function renderChatList() {
  const visibleChats = chats.filter(c => !c.temp);
  if (!visibleChats.length) {
    chatList.innerHTML = '<div class="ai-chat-list__empty">No chats yet</div>';
    return;
  }
  chatList.innerHTML = visibleChats
    .slice()
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .map(c => `
      <div class="ai-chat-item${c.id === activeChatId ? ' active' : ''}" data-id="${c.id}">
        <span class="ai-chat-item__title">${escHtml(c.title)}</span>
        <div class="ai-chat-item__actions">
          <button class="ai-chat-item__btn ai-chat-item__rename" data-id="${c.id}" title="Rename chat">
            <i class="fa-solid fa-pen"></i>
          </button>
          <button class="ai-chat-item__btn ai-chat-item__del" data-id="${c.id}" title="Delete chat">
            <i class="fa-solid fa-trash-can"></i>
          </button>
        </div>
      </div>`)
    .join('');
}

function renderMessages(chat) {
  if (!chat || !chat.messages.length) {
    messages.innerHTML = '';
    emptyState.style.display = '';
    return;
  }
  emptyState.style.display = 'none';
  messages.innerHTML = chat.messages.map(m => renderMessage(m)).join('');
  scrollToBottom();
}

function renderMessage(m) {
  const isUser = m.role === 'user';
  return `
    <div class="ai-msg ai-msg--${isUser ? 'user' : 'assistant'}">
      <div class="ai-msg__bubble">${isUser ? escHtml(m.content).replace(/\n/g,'<br>') : renderMarkdown(m.content)}</div>
    </div>`;
}

function appendMessage(m) {
  emptyState.style.display = 'none';
  const el = document.createElement('div');
  el.className = `ai-msg ai-msg--${m.role === 'user' ? 'user' : 'assistant'}`;
  el.innerHTML = `<div class="ai-msg__bubble">${m.role === 'user' ? escHtml(m.content).replace(/\n/g,'<br>') : renderMarkdown(m.content)}</div>`;
  messages.appendChild(el);
  scrollToBottom();
  return el;
}

function scrollToBottom() {
  messages.scrollTop = messages.scrollHeight;
}

// ── Typing indicator ──────────────────────────────────────────────────────────

function showTyping() {
  const el = document.createElement('div');
  el.className = 'ai-msg ai-msg--assistant ai-msg--typing';
  el.id = 'ai-typing';
  el.innerHTML = `<div class="ai-msg__bubble"><span class="ai-typing-dot"></span><span class="ai-typing-dot"></span><span class="ai-typing-dot"></span></div>`;
  messages.appendChild(el);
  scrollToBottom();
}

function hideTyping() {
  document.getElementById('ai-typing')?.remove();
}

// ── Chat management ───────────────────────────────────────────────────────────

function createChat() {
  const chat = {
    id:        uid(),
    title:     tempMode ? 'Temporary Chat' : 'New Chat',
    model:     currentModel,
    messages:  [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    temp:      tempMode || undefined,
  };
  if (!chat.temp) chats.unshift(chat);
  activeChatId = chat.id;
  chatTitle.textContent = chat.title;
  messages.innerHTML = '';
  emptyState.style.display = '';
  renderChatList();
  if (!chat.temp) saveChats();
  inputEl.focus();
  return chat;
}

function selectChat(id) {
  activeChatId = id;
  const chat = activeChat();
  if (!chat) return;
  currentModel = chat.model || DEFAULT_MODEL;
  modelBtnLabel.textContent = MODELS.find(m => m.id === currentModel)?.label ?? currentModel;
  chatTitle.textContent = chat.title;
  renderMessages(chat);
  renderChatList();
  inputEl.focus();
}

async function deleteChat(id) {
  const chat = chats.find(c => c.id === id);
  if (!chat) return;
  if (!await showConfirm(`Delete "${chat.title}"?`)) return;
  chats = chats.filter(c => c.id !== id);
  if (activeChatId === id) {
    activeChatId = chats[0]?.id || null;
    if (activeChatId) selectChat(activeChatId);
    else {
      chatTitle.textContent = 'New Chat';
      messages.innerHTML = '';
      emptyState.style.display = '';
    }
  }
  renderChatList();
  saveChats();
}

function renameChat(id) {
  const chat = chats.find(c => c.id === id);
  if (!chat) return;

  // Replace the title span with an inline input
  const item = chatList.querySelector(`.ai-chat-item[data-id="${id}"]`);
  if (!item) return;
  const titleEl = item.querySelector('.ai-chat-item__title');
  const actions  = item.querySelector('.ai-chat-item__actions');

  const input = document.createElement('input');
  input.className = 'ai-chat-item__rename-input';
  input.value = chat.title;
  input.maxLength = 60;

  titleEl.replaceWith(input);
  actions.style.display = 'none';
  input.focus();
  input.select();

  function commit() {
    const val = input.value.trim();
    if (val) {
      chat.title = val;
      if (activeChatId === id) chatTitle.textContent = val;
      saveChats();
    }
    renderChatList();
  }

  input.addEventListener('blur', commit);
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter')  { e.preventDefault(); input.blur(); }
    if (e.key === 'Escape') { input.value = chat.title; input.blur(); }
  });
}

// ── Cloud sync ────────────────────────────────────────────────────────────────

async function loadChats() {
  if (!PlutoniumStore.currentUser) return;
  try {
    const doc = await PlutoniumStore.getDoc(HISTORY_DOC);
    const loaded = doc?.chats || [];
    // Merge: keep any chats the user already created while load was in flight
    const existingIds = new Set(chats.map(c => c.id));
    for (const c of loaded) {
      if (!existingIds.has(c.id)) chats.push(c);
    }
    chats.sort((a, b) => b.updatedAt - a.updatedAt);
    // Select most recent if nothing is active yet
    if (!activeChatId && chats.length) {
      activeChatId = chats[0].id;
      selectChat(activeChatId);
    }
    renderChatList();
  } catch (e) {
    console.warn('[ai] load failed:', e.message);
  }
}

async function saveChats() {
  if (!PlutoniumStore.currentUser) return;
  try {
    await PlutoniumStore.setDoc(HISTORY_DOC, { chats: chats.slice(0, MAX_CHATS) });
  } catch (e) {
    console.warn('[ai] save failed:', e.message);
  }
}

async function loadByok() {
  if (!PlutoniumStore.currentUser) return;
  try {
    const doc = await PlutoniumStore.getDoc(BYOK_DOC);
    byokKey = doc?.key || '';
    applyByokState();
  } catch (e) {
    console.warn('[ai] byok load failed:', e.message);
  }
}

async function saveByok() {
  if (!PlutoniumStore.currentUser) return;
  try {
    await PlutoniumStore.setDoc(BYOK_DOC, { key: byokKey });
  } catch (e) {
    console.warn('[ai] byok save failed:', e.message);
  }
}

async function loadCharacters() {
  if (!PlutoniumStore.currentUser) return;
  try {
    const doc = await PlutoniumStore.getDoc(CHARACTERS_DOC);
    characters = doc?.characters || [];
    renderCharList();
    updateCharToggle();
  } catch (e) {
    console.warn('[ai] characters load failed:', e.message);
  }
}

async function saveCharacters() {
  if (!PlutoniumStore.currentUser) return;
  try {
    await PlutoniumStore.setDoc(CHARACTERS_DOC, { characters: characters.slice(0, MAX_CHARACTERS) });
  } catch (e) {
    console.warn('[ai] characters save failed:', e.message);
  }
}

// ── Characters ────────────────────────────────────────────────────────────────

function allCharacters() {
  return [DEFAULT_CHARACTER, ...characters];
}

function activeCharacter() {
  return allCharacters().find(c => c.id === activeCharId) || DEFAULT_CHARACTER;
}

function activeSystemPrompt() {
  return activeCharacter().prompt;
}

function updateCharToggle() {
  charToggleName.textContent = activeCharacter().name;
}

// Chat modal list (select only)
function renderCharList() {
  const all = allCharacters();
  charList.innerHTML = all.map(c => `
    <div class="ai-char-item${c.id === activeCharId ? ' active' : ''}" data-id="${c.id}">
      <div class="ai-char-item__info">
        <span class="ai-char-item__name">${escHtml(c.name)}</span>
        <span class="ai-char-item__prompt">${escHtml(c.prompt.slice(0, 60))}${c.prompt.length > 60 ? '...' : ''}</span>
      </div>
    </div>`).join('');
}

charList.addEventListener('click', e => {
  const item = e.target.closest('.ai-char-item');
  if (item) {
    activeCharId = item.dataset.id;
    updateCharToggle();
    renderCharList();
    charModal.style.display = 'none';
  }
});

charToggleBtn.addEventListener('click', () => {
  renderCharList();
  charModal.style.display = charModal.style.display === 'none' ? '' : 'none';
});

charModalClose.addEventListener('click', () => {
  charModal.style.display = 'none';
});

// ── Tabs ──────────────────────────────────────────────────────────────────────

let activeTab = 'chat';

function switchTab(tab) {
  if (tab === activeTab) return;
  activeTab = tab;
  tabChat.classList.toggle('active', tab === 'chat');
  tabStudio.classList.toggle('active', tab === 'studio');
  chatOnlyEls.forEach(el => el.style.display = tab === 'chat' ? '' : 'none');

  const entering = tab === 'chat' ? viewChat : viewStudio;
  const leaving  = tab === 'chat' ? viewStudio : viewChat;

  leaving.classList.remove('ai-view--active');
  leaving.classList.add('ai-view--leave');
  setTimeout(() => {
    leaving.classList.remove('ai-view--leave');
    leaving.style.display = 'none';
  }, 160);

  entering.style.display = '';
  // Force reflow so the animation plays from the start
  entering.getBoundingClientRect();
  entering.classList.add('ai-view--active');

  if (tab === 'studio') {
    charModal.style.display = 'none';
    renderStudioList();
  }
}

tabChat.addEventListener('click',   () => switchTab('chat'));
tabStudio.addEventListener('click', () => switchTab('studio'));

// ── Studio ────────────────────────────────────────────────────────────────────

let studioEditingId = null;

function renderStudioList() {
  const all = allCharacters();
  studioCharList.innerHTML = all.map(c => `
    <div class="ai-studio__char-item${c.id === studioEditingId ? ' active' : ''}${c.id === activeCharId ? ' in-use' : ''}" data-id="${c.id}">
      <div class="ai-studio__char-item-info">
        <span class="ai-studio__char-item-name">${escHtml(c.name)}</span>
        ${c.id === activeCharId ? '<span class="ai-studio__in-use">active</span>' : ''}
      </div>
      <span class="ai-studio__char-item-preview">${escHtml(c.prompt.slice(0, 55))}${c.prompt.length > 55 ? '...' : ''}</span>
    </div>`).join('');
}

function openStudioEditor(id) {
  studioEditingId = id;
  const isNew = id === null;
  const c = isNew ? null : allCharacters().find(c => c.id === id);
  const isDefault = c?.isDefault ?? false;

  studioEditorEmpty.style.display = 'none';
  studioEditor.style.display = '';
  studioName.value   = c ? c.name   : '';
  studioPrompt.value = c ? c.prompt : '';

  studioName.readOnly   = isDefault;
  studioPrompt.readOnly = isDefault;
  studioName.style.opacity   = isDefault ? '0.5' : '';
  studioPrompt.style.opacity = isDefault ? '0.5' : '';
  studioSave.style.display   = isDefault ? 'none' : '';
  studioCancel.textContent   = isDefault ? 'Close' : 'Cancel';
  studioDelete.style.display = (!isNew && !isDefault) ? '' : 'none';

  if (!isDefault) studioName.focus();
  renderStudioList();
}

function closeStudioEditor() {
  studioEditingId = null;
  studioEditor.style.display = 'none';
  studioEditorEmpty.style.display = '';
  renderStudioList();
}

studioCharList.addEventListener('click', e => {
  const item = e.target.closest('.ai-studio__char-item');
  if (item) openStudioEditor(item.dataset.id);
});

studioNew.addEventListener('click', () => openStudioEditor(null));

studioSave.addEventListener('click', () => {
  const name   = studioName.value.trim();
  const prompt = studioPrompt.value.trim();
  if (!name || !prompt) return;

  if (studioEditingId && studioEditingId !== 'default') {
    const c = characters.find(c => c.id === studioEditingId);
    if (c) { c.name = name; c.prompt = prompt; }
  } else if (!studioEditingId) {
    if (characters.length >= MAX_CHARACTERS) return;
    const newChar = { id: uid(), name, prompt };
    characters.push(newChar);
    studioEditingId = newChar.id;
  }
  updateCharToggle();
  renderStudioList();
  saveCharacters();
  // keep editor open with updated values
  renderStudioList();
});

studioCancel.addEventListener('click', closeStudioEditor);

studioDelete.addEventListener('click', async () => {
  const c = characters.find(c => c.id === studioEditingId);
  if (!c) return;
  if (!await showConfirm(`Delete "${c.name}"?`)) return;
  characters = characters.filter(c => c.id !== studioEditingId);
  if (activeCharId === studioEditingId) {
    activeCharId = 'default';
    updateCharToggle();
  }
  saveCharacters();
  closeStudioEditor();
});

// ── Title generation ──────────────────────────────────────────────────────────

async function generateTitle(chat, firstMessage, user) {
  try {
    const res = await fetch(`${GROQ_WORKER}/chat`, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${user.idToken}`,
      },
      body: JSON.stringify({
        model:    'llama-3.1-8b-instant',
        messages: [
          { role: 'user', content: firstMessage },
          { role: 'user', content: 'Summarise the above message as a chat title. 4 words max. No punctuation. No quotes. Just the title.' },
        ],
      }),
    });
    if (!res.ok) return;
    const data = await res.json();
    const title = data.content?.trim().slice(0, 50);
    if (!title) return;
    chat.title = title;
    chatTitle.textContent = title;
    renderChatList();
    saveChats();
  } catch (_) {}
}

// ── Send message ──────────────────────────────────────────────────────────────

async function sendMessage() {
  const text = inputEl.value.trim();
  if (!text || isStreaming) return;

  const user = PlutoniumStore.currentUser;
  if (!user) return;

  let chat = activeChat();
  if (!chat) chat = createChat();

  const userMsg = { role: 'user', content: text, ts: Date.now() };
  chat.messages.push(userMsg);

  const isFirstMessage = chat.messages.length === 1;

  chat.updatedAt = Date.now();
  inputEl.value = '';
  inputEl.style.height = '';
  renderChatList();
  appendMessage(userMsg);
  if (!chat.temp) saveChats();

  isStreaming = true;
  sendBtn.disabled = true;
  inputEl.disabled = true;
  showTyping();
  incrementRateLimit();

  // Fire title generation in parallel with the main response (first message only)
  if (isFirstMessage) generateTitle(chat, text, user);

  try {
    const res = await fetch(`${GROQ_WORKER}/chat`, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${user.idToken}`,
        'Accept':        'text/event-stream',
        ...(byokKey.startsWith('gsk_') ? { 'X-Groq-Key': byokKey } : {}),
      },
      body: JSON.stringify({
        model:    currentModel,
        system:   activeSystemPrompt(),
        messages: chat.messages.map(m => ({ role: m.role, content: m.content })),
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `HTTP ${res.status}`);
    }

    hideTyping();

    // Create the assistant bubble immediately and stream tokens into it
    const assistantMsg = { role: 'assistant', content: '', ts: Date.now() };
    chat.messages.push(assistantMsg);
    const bubble = appendStreamingMessage();

    const reader  = res.body.getReader();
    const decoder = new TextDecoder();
    let   buffer  = '';
    let   curEvent = '';

    const processLine = line => {
      if (line.startsWith('event:')) {
        curEvent = line.slice(6).trim();
        return;
      }
      if (!line.startsWith('data:')) {
        if (line === '') curEvent = ''; // blank line resets event type
        return;
      }
      const payload = line.slice(5).trim();
      if (payload === '[DONE]') return;

      let chunk;
      try { chunk = JSON.parse(payload); } catch { return; }

      if (curEvent === 'rl') {
        if (chunk.remaining != null) updateRateLimit(chunk.remaining);
        return;
      }

      const token = chunk.choices?.[0]?.delta?.content;
      if (token) {
        assistantMsg.content += token;
        bubble.innerHTML = renderMarkdown(assistantMsg.content);
        scrollToBottom();
      }
    };

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop(); // keep incomplete last line
      for (const line of lines) processLine(line);
    }
    // flush
    if (buffer) processLine(buffer);

    chat.updatedAt = Date.now();
    if (!chat.temp) saveChats();

  } catch (err) {
    hideTyping();
    const errMsg = { role: 'assistant', content: `Error: ${err.message}`, ts: Date.now(), error: true };
    chat.messages.push(errMsg);
    appendMessage(errMsg);
    console.error('[ai] send failed:', err);
  } finally {
    isStreaming = false;
    sendBtn.disabled = false;
    inputEl.disabled = false;
    inputEl.focus();
    renderChatList();
  }
}

// Creates an empty streaming assistant bubble and returns its inner bubble div
function appendStreamingMessage() {
  emptyState.style.display = 'none';
  const el = document.createElement('div');
  el.className = 'ai-msg ai-msg--assistant';
  const bubble = document.createElement('div');
  bubble.className = 'ai-msg__bubble';
  el.appendChild(bubble);
  messages.appendChild(el);
  scrollToBottom();
  return bubble;
}

// ── Input auto-resize ─────────────────────────────────────────────────────────

inputEl.addEventListener('input', () => {
  inputEl.style.height = 'auto';
  inputEl.style.height = Math.min(inputEl.scrollHeight, 160) + 'px';
});

inputEl.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

sendBtn.addEventListener('click', sendMessage);

// ── Sidebar ───────────────────────────────────────────────────────────────────

newChatBtn.addEventListener('click', () => {
  createChat();
});

chatList.addEventListener('click', e => {
  const del = e.target.closest('.ai-chat-item__del');
  if (del) {
    e.stopPropagation();
    deleteChat(del.dataset.id);
    return;
  }
  const rename = e.target.closest('.ai-chat-item__rename');
  if (rename) {
    e.stopPropagation();
    renameChat(rename.dataset.id);
    return;
  }
  const item = e.target.closest('.ai-chat-item');
  if (item) selectChat(item.dataset.id);
});

sidebarToggle.addEventListener('click', () => {
  sidebar.classList.toggle('collapsed');
});

tempToggleBtn.addEventListener('click', () => {
  tempMode = !tempMode;
  tempToggleBtn.classList.toggle('active', tempMode);
  // Start a fresh temp chat immediately when enabling, or a normal new chat when disabling
  activeChatId = null;
  messages.innerHTML = '';
  emptyState.style.display = '';
  chatTitle.textContent = tempMode ? 'Temporary Chat' : 'New Chat';
  renderChatList();
});

// ── Auth ──────────────────────────────────────────────────────────────────────

signinBtn.addEventListener('click', async () => {
  signinBtn.disabled = true;
  try {
    await PlutoniumStore.signIn();
  } catch (_) {
    signinBtn.disabled = false;
  }
});

PlutoniumStore.onAuthChange(user => {
  if (user) {
    gate.style.display = 'none';
    app.style.display  = '';
    loadByok();
    loadChats();
    loadCharacters();
  } else {
    gate.style.display = '';
    app.style.display  = 'none';
    chats        = [];
    activeChatId = null;
    characters   = [];
    activeCharId = 'default';
    tempMode     = false;
    byokKey      = '';
    tempToggleBtn.classList.remove('active');
    applyByokState();
    updateCharToggle();
    chatList.innerHTML = '';
    messages.innerHTML = '';
    emptyState.style.display = '';
    signinBtn.disabled = false;
  }
});
