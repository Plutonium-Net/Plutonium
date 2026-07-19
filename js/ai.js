const GROQ_WORKER   = 'https://ai.cdn.plutoniumnet.work';
const HISTORY_DOC   = 'ai_chats';
const MAX_CHATS     = 30;
const DEFAULT_MODEL = 'llama-3.3-70b-versatile';
const SYSTEM_PROMPT = 'You are a helpful, concise assistant on the Plutonium Network. Answer clearly and directly. Use markdown for code blocks when relevant.';

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

let chats        = [];   // [{ id, title, model, messages: [{role,content,ts}], createdAt, updatedAt }]
let activeChatId = null;
let isStreaming  = false;
let currentModel = DEFAULT_MODEL;

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
const chatTitle    = document.getElementById('ai-chat-title');
const emptyState   = document.getElementById('ai-empty');
const sidebarToggle = document.getElementById('ai-sidebar-toggle');

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
        <button class="ai-chat-item__del" data-id="${c.id}" title="Delete chat">
          <i class="fa-solid fa-trash-can"></i>
        </button>
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

  // Set title from first message
  if (chat.messages.length === 1) {
    chat.title = titleFromMessage(text);
    chatTitle.textContent = chat.title;
  }

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

  try {
    const res = await fetch(`${GROQ_WORKER}/chat`, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${user.idToken}`,
      },
      body: JSON.stringify({
        model:    currentModel,
        system:   SYSTEM_PROMPT,
        messages: chat.messages.map(m => ({ role: m.role, content: m.content })),
      }),
    });

    hideTyping();

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `HTTP ${res.status}`);
    }

    const data = await res.json();
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
  } else {
    gate.style.display = '';
    app.style.display  = 'none';
    chats        = [];
    activeChatId = null;
    chatList.innerHTML = '';
    messages.innerHTML = '';
    emptyState.style.display = '';
    signinBtn.disabled = false;
  }
});
