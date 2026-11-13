import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import GlassSurface from '@/components/glass-surface/GlassSurface'
import VoiceMode from '@/components/ai-page/voice-mode'
import LiteMarkdown from '@/components/ai-page/lite-markdown'
import PillGlass from '@/components/glass-pill/pill-glass'
import CharacterMark from '@/components/ai-page/character-mark'
import { CHAT_MODELS, VOICES, streamChat, type ChatMessage, type ChatModel, type VoiceId } from '@/lib/ai'
import {
  DEFAULT_CHARACTERS,
  loadCharacters,
  loadChat,
  newCharacterId,
  saveCharacters,
  type Character,
} from '@/lib/characters'
import {
  deleteConversation,
  loadConversation,
  loadConversations,
  newConversationId,
  saveConversation,
  titleFor,
  type Conversation,
  type ConversationSummary,
} from '@/lib/chats'
import { currentSession, onAuthChange, type CloudUser } from '@/lib/cloud-store'
import { getPref, loadPrefs, setPref } from '@/lib/prefs'
import './ai-page.css'

const SUGGESTIONS: Record<string, string[]> = {
  stelena: ['What can you do?', 'Explain something simply', 'Help me with a project'],
}

const FALLBACK_SUGGESTIONS = ['Start with what you need', 'Give me three options', 'Ask me a question']

export default function AiPage() {
  const [user, setUser] = useState<CloudUser | null>(() => currentSession())
  const [characters, setCharacters] = useState<Character[]>(DEFAULT_CHARACTERS)
  const [activeId, setActiveId] = useState(DEFAULT_CHARACTERS[0].id)
  const [chats, setChats] = useState<Record<string, ChatMessage[]>>({})
  const [conversations, setConversations] = useState<ConversationSummary[]>([])
  const [openId, setOpenId] = useState(() => newConversationId())
  const [rail, setRail] = useState<'chats' | 'characters'>('chats')
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [model, setModel] = useState<ChatModel>('openai/gpt-oss-120b')
  const [modelOpen, setModelOpen] = useState(false)
  const [voiceOpen, setVoiceOpen] = useState(false)
  const [muted, setMuted] = useState(false)
  const [note, setNote] = useState('')
  const [editing, setEditing] = useState<Character | null>(null)

  const prefsReady = useRef(false)
  const abortRef = useRef<AbortController | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const textRef = useRef<HTMLTextAreaElement>(null)

  const active = characters.find((character) => character.id === activeId) || characters[0]
  const messages = chats[openId] || []
  const token = user?.idToken ?? null

  useEffect(() => onAuthChange(setUser), [])

  // The last model and character are account preferences, restored before the
  // page starts writing them back.
  useEffect(() => {
    let alive = true
    void loadPrefs().then(() => {
      if (!alive) return
      const savedModel = getPref<ChatModel>('aiModel')
      if (savedModel && CHAT_MODELS.some((entry) => entry.id === savedModel)) setModel(savedModel)
      const savedCharacter = getPref<string>('aiCharacter')
      if (savedCharacter) setActiveId(savedCharacter)
      prefsReady.current = true
    })
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    if (prefsReady.current) setPref('aiModel', model)
  }, [model])

  useEffect(() => {
    if (prefsReady.current) setPref('aiCharacter', activeId)
  }, [activeId])

  // Characters, saved chats and the open thread all live in the account.
  useEffect(() => {
    let alive = true
    void loadCharacters().then(async (list) => {
      if (!alive) return
      setCharacters(list)
      const saved = await loadConversations()
      if (!alive) return
      if (saved.length) {
        setConversations(saved)
        return
      }
      // Nothing in the new index yet: adopt the old one-chat-per-character docs
      // so nobody's history disappears with the upgrade.
      const adopted = await adoptLegacyChats(list)
      if (alive && adopted.length) setConversations(adopted)
    })
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    if (chats[openId]) return
    let alive = true
    void loadConversation(openId).then((conversation) => {
      if (!alive || !conversation) return
      setChats((current) => (current[openId] ? current : { ...current, [openId]: conversation.messages }))
    })
    return () => {
      alive = false
    }
  }, [openId, chats])

  useEffect(() => {
    const node = scrollRef.current
    if (node) node.scrollTop = node.scrollHeight
  }, [messages, activeId])

  function setMessages(conversationId: string, next: ChatMessage[]) {
    setChats((current) => ({ ...current, [conversationId]: next }))
  }

  /** Saves the thread and moves it to the top of the history list. */
  function persistConversation(id: string, characterId: string, next: ChatMessage[]) {
    const existing = conversations.find((entry) => entry.id === id)
    const conversation: Conversation = {
      id,
      characterId,
      title: existing?.title || titleFor(next),
      updatedAt: Date.now(),
      messages: next,
    }
    void saveConversation(conversation).then((summary) => {
      if (!summary) return
      setConversations((current) =>
        [summary, ...current.filter((entry) => entry.id !== summary.id)].sort((a, b) => b.updatedAt - a.updatedAt),
      )
    })
  }

  function startChat(characterId = active.id) {
    abortRef.current?.abort()
    setStreaming(false)
    setActiveId(characterId)
    setOpenId(newConversationId())
    setNote('')
  }

  function deleteChat(conversation: ConversationSummary) {
    setConversations((current) => current.filter((entry) => entry.id !== conversation.id))
    setChats((current) => {
      const next = { ...current }
      delete next[conversation.id]
      return next
    })
    if (openId === conversation.id) startChat(active.id)
    void deleteConversation(conversation.id)
  }

  function openConversation(conversation: ConversationSummary) {
    abortRef.current?.abort()
    setStreaming(false)
    setActiveId(conversation.characterId)
    setOpenId(conversation.id)
    setNote('')
  }

  function systemFor(character: Character) {
    return `${character.prompt}\n\nKeep replies tight and readable in a chat window. Today is ${new Date().toDateString()}.`
  }

  /** One exchange: appends the user turn, streams the reply, then persists. */
  async function ask(text: string, onToken?: (token: string) => void): Promise<string> {
    const trimmed = text.trim()
    if (!trimmed) return ''
    const character = active
    if (!token) {
      setNote('Sign in to chat with a character.')
      window.dispatchEvent(new Event('plu:open-account'))
      return ''
    }

    const conversationId = openId
    const history = chats[conversationId] || []
    const next: ChatMessage[] = [...history, { role: 'user', content: trimmed }]
    setMessages(conversationId, next)
    persistConversation(conversationId, character.id, next)
    setInput('')
    setStreaming(true)
    setNote('')

    const controller = new AbortController()
    abortRef.current = controller
    let growing = ''
    try {
      growing = await streamChat({
        token,
        model,
        system: systemFor(character),
        messages: next,
        signal: controller.signal,
        onToken: (chunk) => {
          growing += chunk
          onToken?.(chunk)
          setMessages(conversationId, [...next, { role: 'assistant', content: growing }])
        },
      })
      const finished = [...next, { role: 'assistant' as const, content: growing }]
      setMessages(conversationId, finished)
      persistConversation(conversationId, character.id, finished)
      return growing
    } catch (error) {
      if (controller.signal.aborted) return growing
      setNote(error instanceof Error ? error.message : 'The reply failed')
      return growing
    } finally {
      abortRef.current = null
      setStreaming(false)
    }
  }

  function stop() {
    abortRef.current?.abort()
    setStreaming(false)
  }

  function clearChat() {
    startChat()
  }

  function saveCharacter(character: Character) {
    setCharacters((current) => {
      const next = current.some((item) => item.id === character.id)
        ? current.map((item) => (item.id === character.id ? character : item))
        : [...current, character]
      void saveCharacters(next)
      return next
    })
    setActiveId(character.id)
    setEditing(null)
  }

  function deleteCharacter(id: string) {
    setCharacters((current) => {
      const next = current.filter((character) => character.id !== id || character.builtin)
      void saveCharacters(next)
      return next
    })
    setConversations((current) => current.filter((entry) => entry.characterId !== id))
    setChats((current) => {
      const next = { ...current }
      for (const [key, value] of Object.entries(next)) {
        if (conversations.find((entry) => entry.id === key)?.characterId === id) delete next[key]
      }
      return next
    })
    if (activeId === id) startChat(DEFAULT_CHARACTERS[0].id)
    setEditing(null)
  }

  function submit() {
    if (streaming) return
    void ask(input)
  }

  const suggestions = useMemo(() => SUGGESTIONS[active.id] || FALLBACK_SUGGESTIONS, [active.id])

  return (
    <div
      className="ai-page"
      style={{
        ['--ai-hue' as string]: active.hue,
        ...(active.neutral ? { ['--ai-sat' as string]: '0%' } : null),
      }}
    >
      <aside className="ai-rail">
        <span className="ai-rail__glass" aria-hidden="true">
          <GlassSurface
            className="ai-rail__surface"
            width="100%"
            height="100%"
            borderRadius={16}
            backgroundOpacity={0.07}
            saturation={1.25}
            displace={0.45}
          />
        </span>

        <div className="ai-rail__head">
          <div className="ai-rail__seg" role="tablist" aria-label="Rail view">
            <button
              type="button"
              role="tab"
              aria-selected={rail === 'chats'}
              className={`ai-rail__seg-btn${rail === 'chats' ? ' is-active' : ''}`}
              onClick={() => setRail('chats')}
            >
              Chats
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={rail === 'characters'}
              className={`ai-rail__seg-btn${rail === 'characters' ? ' is-active' : ''}`}
              onClick={() => setRail('characters')}
            >
              Characters
            </button>
          </div>
          {rail === 'characters' && (
            <button
              type="button"
              className="ai-rail__add"
              onClick={() => setEditing(blankCharacter())}
              title="New character"
              aria-label="New character"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 5v14M5 12h14" />
              </svg>
            </button>
          )}
        </div>

        {rail === 'chats' ? (
          <div className="ai-rail__list">
            {conversations.length === 0 ? (
              <p className="ai-rail__empty">Saved chats show up here.</p>
            ) : (
              conversations.map((conversation) => {
                const owner = characters.find((character) => character.id === conversation.characterId) || active
                return (
                  <div
                    key={conversation.id}
                    className={`ai-chat-item${conversation.id === openId ? ' is-active' : ''}`}
                  >
                    <button
                      type="button"
                      className="ai-chat-item__open"
                      onClick={() => openConversation(conversation)}
                    >
                      <CharacterMark character={owner} className="ai-chat-item__orb" />
                      <span className="ai-chat-item__copy">
                        <span className="ai-chat-item__title">{conversation.title}</span>
                        <span className="ai-chat-item__meta">
                          {owner.name} · {when(conversation.updatedAt)}
                        </span>
                      </span>
                    </button>
                    <button
                      type="button"
                      className="ai-chat-item__delete"
                      onClick={() => deleteChat(conversation)}
                      title="Delete chat"
                      aria-label={`Delete ${conversation.title}`}
                    >
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M4 7h16M9 7V5h6v2M6.5 7l1 12.5h9L17.5 7M10 11v5M14 11v5" />
                      </svg>
                    </button>
                  </div>
                )
              })
            )}
          </div>
        ) : (
          <div className="ai-rail__list">
            {characters.map((character) => (
              <button
                key={character.id}
                type="button"
                className={`ai-char${character.id === activeId ? ' is-active' : ''}`}
                style={{
                  ['--char-hue' as string]: character.hue,
                  ...(character.neutral ? { ['--char-sat' as string]: '0%' } : null),
                }}
                onClick={() => startChat(character.id)}
                onDoubleClick={() => setEditing(character)}
              >
                <CharacterMark character={character} className="ai-char__orb" />
                <span className="ai-char__copy">
                  <span className="ai-char__name">{character.name}</span>
                  <span className="ai-char__vibe">{character.vibe}</span>
                </span>
              </button>
            ))}
          </div>
        )}

        <button
          type="button"
          className="ai-rail__footer"
          onClick={() => (rail === 'chats' ? startChat() : setEditing(blankCharacter()))}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 5v14M5 12h14" />
          </svg>
          {rail === 'chats' ? 'New chat' : 'New character'}
        </button>
      </aside>

      <section className="ai-chat">
        <header className="ai-chat__head">
          <span className="ai-chat__id">
            <CharacterMark character={active} className="ai-chat__orb" />
            <span className="ai-chat__names">
              <span className="ai-chat__name">{active.name}</span>
              <span className="ai-chat__vibe">{active.vibe}</span>
            </span>
          </span>

          <div className="ai-chat__tools">
            <div className="ai-model">
              <button type="button" className="ai-pill" onClick={() => setModelOpen((open) => !open)} aria-expanded={modelOpen}>
                <PillGlass />
                {CHAT_MODELS.find((entry) => entry.id === model)?.label}
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </button>
              {modelOpen && (
                <div className="ai-model__menu" role="listbox">
                  {CHAT_MODELS.map((entry) => (
                    <button
                      key={entry.id}
                      type="button"
                      role="option"
                      aria-selected={entry.id === model}
                      className={`ai-model__item${entry.id === model ? ' is-active' : ''}`}
                      onClick={() => {
                        setModel(entry.id)
                        setModelOpen(false)
                      }}
                    >
                      <span>{entry.label}</span>
                      <span className="ai-model__hint">{entry.hint}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <button type="button" className="ai-pill ai-pill--icon" onClick={() => setVoiceOpen(true)} title="Voice mode">
              <PillGlass />
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <rect x="9.5" y="3.5" width="5" height="10" rx="2.5" />
                <path d="M6.5 11.5a5.5 5.5 0 0 0 11 0M12 17v3.5" />
              </svg>
            </button>

            {!active.builtin && (
              <button type="button" className="ai-pill ai-pill--icon" onClick={() => setEditing(active)} title="Edit character">
                <PillGlass />
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M4 20h4l9.5-9.5-4-4L4 16z" />
                  <path d="M13.5 6.5l4 4" />
                </svg>
              </button>
            )}

            <button type="button" className="ai-pill" onClick={clearChat} disabled={!messages.length}>
              <PillGlass />
              New chat
            </button>
          </div>
        </header>

        <div className="ai-thread" ref={scrollRef}>
          {messages.length === 0 ? (
            <div className="ai-intro">
              <CharacterMark character={active} className="ai-intro__orb" />
              <h2 className="ai-intro__name">{active.name}</h2>
              <p className="ai-intro__vibe">{active.vibe}</p>
              <div className="ai-intro__chips">
                {suggestions.map((suggestion) => (
                  <button key={suggestion} type="button" className="ai-chip" onClick={() => void ask(suggestion)}>
                    <PillGlass />
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((message, index) => (
              <article key={`${message.role}-${index}`} className={`ai-msg ai-msg--${message.role}`}>
                {message.role === 'assistant' && <CharacterMark character={active} className="ai-msg__orb" />}
                <div className="ai-msg__bubble">
                  {message.role === 'assistant' ? (
                    <>
                      <LiteMarkdown text={message.content || '…'} />
                      {streaming && index === messages.length - 1 && <span className="ai-msg__caret" />}
                    </>
                  ) : (
                    <p>{message.content}</p>
                  )}
                </div>
              </article>
            ))
          )}
        </div>

        {note && <p className="ai-chat__note">{note}</p>}

        <div className="ai-composer">
          <GlassSurface
            className="ai-composer__glass"
            width="100%"
            height="100%"
            borderRadius={20}
            backgroundOpacity={0.11}
            saturation={1.2}
            displace={0.5}
          >
            <div className="ai-composer__inner">
              <textarea
                ref={textRef}
                className="ai-composer__input"
                rows={1}
                value={input}
                placeholder={`Message ${active.name}`}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault()
                    submit()
                  }
                }}
              />
              <button
                type="button"
                className="ai-composer__mic"
                onClick={() => setVoiceOpen(true)}
                title="Talk instead"
                aria-label="Talk instead"
              >
                <PillGlass />
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <rect x="9.5" y="4" width="5" height="9" rx="2.5" />
                  <path d="M6.5 11.5a5.5 5.5 0 0 0 11 0M12 17v3" />
                </svg>
              </button>
              {streaming ? (
                <button type="button" className="ai-composer__send is-stop" onClick={stop} aria-label="Stop">
                  <span />
                </button>
              ) : (
                <button
                  type="button"
                  className="ai-composer__send"
                  onClick={submit}
                  disabled={!input.trim()}
                  aria-label="Send"
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M12 19V5M6 11l6-6 6 6" />
                  </svg>
                </button>
              )}
            </div>
          </GlassSurface>
        </div>
      </section>

      {voiceOpen &&
        createPortal(
          <VoiceMode
            character={active}
            token={token}
            muted={muted}
            onToggleMuted={() => setMuted((value) => !value)}
            onClose={() => setVoiceOpen(false)}
            onTurn={(text, onToken) => ask(text, onToken)}
          />,
          document.body,
        )}

      {editing && (
        <CharacterDialog
          character={editing}
          onClose={() => setEditing(null)}
          onSave={saveCharacter}
          onDelete={editing.builtin ? undefined : () => deleteCharacter(editing.id)}
        />
      )}
    </div>
  )
}

/** Adopts the old per-character chat docs into the new conversation index. */
async function adoptLegacyChats(characters: Character[]): Promise<ConversationSummary[]> {
  const adopted: ConversationSummary[] = []
  for (const character of characters) {
    const messages = await loadChat(character.id)
    if (!messages.length) continue
    const summary = await saveConversation({
      id: `t_${character.id}`,
      characterId: character.id,
      title: titleFor(messages),
      updatedAt: Date.now(),
      messages,
    })
    if (summary) adopted.push(summary)
  }
  return adopted
}

function when(timestamp: number) {
  if (!timestamp) return 'just now'
  const minutes = Math.floor((Date.now() - timestamp) / 60_000)
  if (minutes < 1) return 'now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

function blankCharacter(): Character {
  return {
    id: newCharacterId(),
    name: '',
    emoji: '✦',
    hue: 268,
    vibe: '',
    prompt: '',
    voice: 'hannah',
  }
}

function CharacterDialog({
  character,
  onClose,
  onSave,
  onDelete,
}: {
  character: Character
  onClose: () => void
  onSave: (character: Character) => void
  onDelete?: () => void
}) {
  const [draft, setDraft] = useState<Character>(character)
  const isNew = !character.name

  function update<K extends keyof Character>(key: K, value: Character[K]) {
    setDraft((current) => ({ ...current, [key]: value }))
  }

  return (
    <div
      className="ai-dialog"
      role="dialog"
      aria-modal="true"
      aria-label={isNew ? 'New character' : 'Edit character'}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="ai-dialog__panel" style={{ ['--char-hue' as string]: draft.hue }}>
        <span className="ai-dialog__glass" aria-hidden="true">
          <GlassSurface
            className="ai-dialog__surface"
            width="100%"
            height="100%"
            borderRadius={18}
            backgroundOpacity={0.12}
            saturation={1.3}
            displace={0.5}
          />
        </span>

        <div className="ai-dialog__body">
        <header className="ai-dialog__head">
          <CharacterMark character={draft} className="ai-dialog__orb" />
          <h2>{isNew ? 'New character' : draft.name}</h2>
          <button type="button" className="ai-dialog__close" onClick={onClose} aria-label="Close">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </header>

        <div className="ai-dialog__row">
          <label className="ai-field">
            <span>Name</span>
            <input
              value={draft.name}
              maxLength={32}
              placeholder="e.g. Juniper"
              onChange={(event) => update('name', event.target.value)}
            />
          </label>
          <label className="ai-field ai-field--narrow">
            <span>Mark</span>
            <input
              value={draft.emoji}
              maxLength={2}
              placeholder="✦"
              onChange={(event) => update('emoji', event.target.value)}
            />
          </label>
        </div>

        <label className="ai-field">
          <span>Vibe</span>
          <input
            value={draft.vibe}
            maxLength={40}
            placeholder="One line, shown under the name"
            onChange={(event) => update('vibe', event.target.value)}
          />
        </label>

        <label className="ai-field">
          <span>Personality</span>
          <textarea
            rows={4}
            value={draft.prompt}
            placeholder="How they think, speak and what they refuse to do. This becomes the system prompt."
            onChange={(event) => update('prompt', event.target.value)}
          />
        </label>

        <div className="ai-dialog__row">
          <div className="ai-field ai-field--voices">
            <span>Voice</span>
            <div className="ai-voices">
              {VOICES.map((voice) => (
                <button
                  key={voice.id}
                  type="button"
                  className={`ai-voice${draft.voice === voice.id ? ' is-active' : ''}`}
                  onClick={() => update('voice', voice.id as VoiceId)}
                >
                  {voice.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="ai-field">
          <span>Colour</span>
          <div className="ai-hues">
            {[268, 205, 328, 158, 42, 232, 12, 186].map((hue) => (
              <button
                key={hue}
                type="button"
                className={`ai-hue${draft.hue === hue ? ' is-active' : ''}`}
                style={{ ['--hue' as string]: hue }}
                onClick={() => update('hue', hue)}
                aria-label={`Accent ${hue}`}
              />
            ))}
          </div>
        </div>

        <footer className="ai-dialog__foot">
          {onDelete && (
            <button type="button" className="ai-dialog__delete" onClick={onDelete}>
              Delete
            </button>
          )}
          <button type="button" className="ai-dialog__ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="ai-dialog__save"
            disabled={!draft.name.trim() || !draft.prompt.trim()}
            onClick={() =>
              onSave({
                ...draft,
                name: draft.name.trim().slice(0, 32),
                emoji: (draft.emoji || '✦').slice(0, 2),
                vibe: draft.vibe.trim() || 'Custom character',
                prompt: draft.prompt.trim(),
              })
            }
          >
            {isNew ? 'Create' : 'Save'}
          </button>
        </footer>
        </div>
      </div>
    </div>
  )
}
