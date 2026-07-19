const GROQ_WORKER      = 'https://ai.cdn.plutoniumnet.work';
const HISTORY_DOC      = 'ai_chats/data';
const CHARACTERS_DOC   = 'ai_characters/data';
const MAX_CHATS        = 30;
const MAX_CHARACTERS   = 20;
const DEFAULT_MODEL    = 'llama-3.3-70b-versatile';
const SYSTEM_PROMPT    = 'You are a helpful, concise assistant on the Plutonium Network. Answer clearly and directly. Use markdown for code blocks when relevant.';

const DEFAULT_CHARACTER = { id: 'default', name: 'Assistant', prompt: SYSTEM_PROMPT, isDefault: true };

const MODELS = [
  { id: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B' },
  { id: 'llama-3.1-8b-instant',    label: 'Llama 3.1 8B' },
  { id: 'openai/gpt-oss-120b',     label: 'GPT OSS 120B' },
  { id: 'openai/gpt-oss-20b',      label: 'GPT OSS 20B' },
  { id: 'qwen/qwen3.6-27b',        label: 'Qwen 3.6 27B' },
  { id: 'groq/compound',           label: 'Groq Compound' },
  { id: 'groq/compound-mini',      label: 'Groq Compound Mini' },
];

// ── State ─────────────────────────────────────────────────────────────────────

let chats           = [];
let activeChatId    = null;
let isStreaming     = false;
let currentModel    = DEFAULT_MODEL;
let characters      = [];
let activeCharId    = 'default';

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
// ── Tabs
const tabChat        = document.getElementById('ai-tab-chat');
const tabStudio      = document.getElementById('ai-tab-studio');
const viewChat       = document.getElementById('ai-view-chat');
const viewStudio     = document.getElementById('ai-view-studio');
const chatOnlyEls    = document.querySelectorAll('.ai-chat-only');
// ── Studio
const studioNew      = document.getElementById('ai-studio-new');
const studioCharList = document.getElementById('ai-studio-char-list');
const studioEditorEmpty = document.getElementById('ai-studio-editor-empty');
const studioEditor   = document.getElementById('ai-studio-editor');
const studioName     = document.getElementById('ai-studio-name');
const studioPrompt   = document.getElementById('ai-studio-prompt');
const studioSave     = document.getElementById('ai-studio-save');
const studioCancel   = document.getElementById('ai-studio-cancel');
const studioDelete   = document.getElementById('ai-studio-delete');
const rlCount        = document.getElementById('ai-rl-count');
const rlBar          = document.getElementById('ai-rl-bar');

// ── Model dropdown ────────────────────────────────────────────────────────────

function buildModelPanel() {
  modelPanel.innerHTML = MODELS.map(m => `
    <div class="ai-model-option${m.id === currentModel ? ' selected' : ''}" data-id="${m.id}">
      <span class="ai-model-option__name">${m.label}</span>
      <span class="ai-model-option__id">${m.id}</span>
    </div>`).join('');
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

// ── Rate limit UI ─────────────────────────────────────────────────────────────

let rlUsed = 0;

function updateRateLimit(remaining) {
  // Sync from server when available, otherwise just increment locally
  rlUsed = 100 - remaining;
  renderRateLimit();
}

function incrementRateLimit() {
  rlUsed = Math.min(100, rlUsed + 1);
  renderRateLimit();
}

function renderRateLimit() {
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
  if (!chats.length) {
    chatList.innerHTML = '<div class="ai-chat-list__empty">No chats yet</div>';
    return;
  }
  chatList.innerHTML = chats
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
    title:     'New Chat',
    model:     currentModel,
    messages:  [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  chats.unshift(chat);
  selectChat(chat.id);
  saveChats();
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

function deleteChat(id) {
  const chat = chats.find(c => c.id === id);
  if (!chat) return;
  if (!confirm(`Delete "${chat.title}"?`)) return;
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
    chats = doc?.chats || [];
    // Select most recent or leave empty
    if (chats.length) {
      activeChatId = chats.sort((a, b) => b.updatedAt - a.updatedAt)[0].id;
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
  activeTab = tab;
  tabChat.classList.toggle('active', tab === 'chat');
  tabStudio.classList.toggle('active', tab === 'studio');
  viewChat.style.display    = tab === 'chat'   ? '' : 'none';
  viewStudio.style.display  = tab === 'studio' ? '' : 'none';
  chatOnlyEls.forEach(el => el.style.display = tab === 'chat' ? '' : 'none');
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

studioDelete.addEventListener('click', () => {
  const c = characters.find(c => c.id === studioEditingId);
  if (!c) return;
  if (!confirm(`Delete "${c.name}"?`)) return;
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
  saveChats();

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
      },
      body: JSON.stringify({
        model:    currentModel,
        system:   activeSystemPrompt(),
        messages: chat.messages.map(m => ({ role: m.role, content: m.content })),
      }),
    });

    hideTyping();

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `HTTP ${res.status}`);
    }

    const data = await res.json();
    if (data.remaining != null) updateRateLimit(data.remaining);
    const assistantMsg = { role: 'assistant', content: data.content, ts: Date.now() };
    chat.messages.push(assistantMsg);
    chat.updatedAt = Date.now();
    appendMessage(assistantMsg);
    saveChats();

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
    loadChats();
    loadCharacters();
  } else {
    gate.style.display = '';
    app.style.display  = 'none';
    chats        = [];
    activeChatId = null;
    characters   = [];
    activeCharId = 'default';
    updateCharToggle();
    chatList.innerHTML = '';
    messages.innerHTML = '';
    emptyState.style.display = '';
    signinBtn.disabled = false;
  }
});
