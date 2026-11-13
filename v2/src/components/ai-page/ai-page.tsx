import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import GlassHighlight from '@/components/glass-highlight/glass-highlight'
import GlassSurface from '@/components/glass-surface/GlassSurface'
import VoiceMode from '@/components/ai-page/voice-mode'
import LiteMarkdown from '@/components/ai-page/lite-markdown'
import PillGlass from '@/components/glass-pill/pill-glass'
import { CHAT_MODELS, VOICES, streamChat, type ChatMessage, type ChatModel, type VoiceId } from '@/lib/ai'
import {
  DEFAULT_CHARACTERS,
  loadCharacters,
  loadChat,
  newCharacterId,
  saveCharacters,
  saveChat,
  type Character,
} from '@/lib/characters'
import { currentSession, onAuthChange, type CloudUser } from '@/lib/cloud-store'
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
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [model, setModel] = useState<ChatModel>('openai/gpt-oss-120b')
  const [modelOpen, setModelOpen] = useState(false)
  const [voiceOpen, setVoiceOpen] = useState(false)
  const [muted, setMuted] = useState(false)
  const [note, setNote] = useState('')
  const [editing, setEditing] = useState<Character | null>(null)

  const abortRef = useRef<AbortController | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const textRef = useRef<HTMLTextAreaElement>(null)

  const active = characters.find((character) => character.id === activeId) || characters[0]
  const messages = chats[activeId] || []
  const token = user?.idToken ?? null

  useEffect(() => onAuthChange(setUser), [])

  // Characters and the open conversation both live in the account.
  useEffect(() => {
    let alive = true
    void loadCharacters().then((list) => {
      if (alive) setCharacters(list)
    })
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    if (chats[activeId]) return
    let alive = true
    void loadChat(activeId).then((list) => {
      if (!alive || !list.length) return
      setChats((current) => (current[activeId] ? current : { ...current, [activeId]: list }))
    })
    return () => {
      alive = false
    }
  }, [activeId, chats])

  useEffect(() => {
    const node = scrollRef.current
    if (node) node.scrollTop = node.scrollHeight
  }, [messages, activeId])

  function setMessages(characterId: string, next: ChatMessage[]) {
    setChats((current) => ({ ...current, [characterId]: next }))
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

    const history = chats[character.id] || []
    const next: ChatMessage[] = [...history, { role: 'user', content: trimmed }]
    setMessages(character.id, next)
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
          setMessages(character.id, [...next, { role: 'assistant', content: growing }])
        },
      })
      const finished = [...next, { role: 'assistant' as const, content: growing }]
      setMessages(character.id, finished)
      void saveChat(character.id, finished)
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
    abortRef.current?.abort()
    setMessages(activeId, [])
    void saveChat(activeId, [])
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
    setChats((current) => {
      const next = { ...current }
      delete next[id]
      return next
    })
    if (activeId === id) setActiveId(DEFAULT_CHARACTERS[0].id)
    setEditing(null)
  }

  function submit() {
    if (streaming) return
    void ask(input)
  }

  const suggestions = useMemo(() => SUGGESTIONS[active.id] || FALLBACK_SUGGESTIONS, [active.id])

  return (
    <div className="ai-page" style={{ ['--ai-hue' as string]: active.hue }}>
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
          <span className="ai-rail__label">Characters</span>
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
        </div>

        <div className="ai-rail__list">
          {characters.map((character) => (
            <button
              key={character.id}
              type="button"
              className={`ai-char${character.id === activeId ? ' is-active' : ''}`}
              style={{ ['--char-hue' as string]: character.hue }}
              onClick={() => {
                abortRef.current?.abort()
                setActiveId(character.id)
                setNote('')
              }}
              onDoubleClick={() => setEditing(character)}
            >
              {character.id === activeId && <GlassHighlight radius={14} />}
              <span className="ai-char__orb">{character.emoji}</span>
              <span className="ai-char__copy">
                <span className="ai-char__name">{character.name}</span>
                <span className="ai-char__vibe">{character.vibe}</span>
              </span>
            </button>
          ))}
        </div>

        <button type="button" className="ai-rail__footer" onClick={() => setEditing(blankCharacter())}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 5v14M5 12h14" />
          </svg>
          New character
        </button>
      </aside>

      <section className="ai-chat">
        <header className="ai-chat__head">
          <span className="ai-chat__id">
            <span className="ai-chat__orb">{active.emoji}</span>
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
              <span className="ai-intro__orb">{active.emoji}</span>
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
                {message.role === 'assistant' && <span className="ai-msg__orb">{active.emoji}</span>}
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
          <span className="ai-dialog__orb">{draft.emoji || '✦'}</span>
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
