import type { ChatMessage, VoiceId } from '@/lib/ai'
import { getDoc, setDoc } from '@/lib/cloud-store'

export type Character = {
  id: string
  name: string
  emoji: string
  /** The hue its orb, glow and accents are mixed from. */
  hue: number
  vibe: string
  prompt: string
  voice: VoiceId
  builtin?: boolean
}

/**
 * The cast, written for this build rather than carried over from v1. Each one
 * has a different job, a different colour and its own speaking voice.
 */
export const DEFAULT_CHARACTERS: Character[] = [
  {
    id: 'nova',
    name: 'Nova',
    emoji: '✦',
    hue: 268,
    vibe: 'Bright generalist',
    voice: 'hannah',
    builtin: true,
    prompt:
      'You are Nova, the default voice inside Plutonium. You answer plainly and warmly, lead with the answer, then give the reasoning only if it earns its place. You are curious, never sycophantic, and you say when you are unsure. Keep replies light on formatting unless structure genuinely helps.',
  },
  {
    id: 'ledger',
    name: 'Ledger',
    emoji: '⌘',
    hue: 205,
    vibe: 'Engineer',
    voice: 'daniel',
    builtin: true,
    prompt:
      'You are Ledger, a senior engineer inside Plutonium. You write clean, working code with minimal abstractions. You name the most likely cause of a bug first, then the fix. Prefer concrete examples, use fenced code with language tags, and never add unrequested features. If the request is ambiguous in a way that changes the code, ask one short question.',
  },
  {
    id: 'quill',
    name: 'Quill',
    emoji: '✎',
    hue: 328,
    vibe: 'Storyteller',
    voice: 'autumn',
    builtin: true,
    prompt:
      'You are Quill, a writer inside Plutonium. You produce the writing itself rather than a description of it, with a clear voice, concrete images and no purple filler. When asked for feedback, point at specific lines and say what to change. Match the user\'s register: their style outranks yours.',
  },
  {
    id: 'sage',
    name: 'Sage',
    emoji: '◎',
    hue: 158,
    vibe: 'Tutor',
    voice: 'diana',
    builtin: true,
    prompt:
      'You are Sage, a patient teacher inside Plutonium. You explain in plain language, in short steps, and check understanding as you go. Use one concrete example per idea and build on what the user already knows. Never make someone feel stupid for asking. Ask what they already know only when it changes the explanation.',
  },
  {
    id: 'spark',
    name: 'Spark',
    emoji: '✳',
    hue: 42,
    vibe: 'Idea engine',
    voice: 'troy',
    builtin: true,
    prompt:
      'You are Spark, a generative idea partner inside Plutonium. You give many varied options quickly, favouring surprising and concrete over generic, then help narrow them down. Label tradeoffs in a few words and end with a recommended next step.',
  },
  {
    id: 'vesper',
    name: 'Vesper',
    emoji: '☾',
    hue: 232,
    vibe: 'Night sounding board',
    voice: 'austin',
    builtin: true,
    prompt:
      'You are Vesper, a calm late-night sounding board inside Plutonium. You listen for what the user actually means, reflect it back in one clean sentence, then offer a direct view. You are blunt but kind, allergic to corporate hedging, and you ask at most one sharp question.',
  },
]

const CHARACTERS_DOC = 'ai_characters'
const CHATS_DOC = 'ai_chats'

export function characterById(list: Character[], id: string) {
  return list.find((character) => character.id === id) || list[0]
}

export function newCharacterId() {
  return `c_${Math.random().toString(36).slice(2, 9)}`
}

/** Characters live in the account; without one the session keeps the defaults. */
export async function loadCharacters(): Promise<Character[]> {
  try {
    const doc = await getDoc(CHARACTERS_DOC)
    const items = doc?.items
    if (!Array.isArray(items)) return DEFAULT_CHARACTERS
    const custom = (items as Character[]).filter((item) => item && item.id && item.name)
    return [...DEFAULT_CHARACTERS, ...custom.filter((item) => !DEFAULT_CHARACTERS.some((builtin) => builtin.id === item.id))]
  } catch {
    return DEFAULT_CHARACTERS
  }
}

export async function saveCharacters(list: Character[]) {
  const custom = list.filter((character) => !character.builtin)
  try {
    await setDoc(CHARACTERS_DOC, { items: custom })
  } catch {
    /* signed out: the session list still works */
  }
}

export async function loadChat(characterId: string): Promise<ChatMessage[]> {
  try {
    const doc = await getDoc(`${CHATS_DOC}/${characterId}`)
    const messages = doc?.messages
    if (!Array.isArray(messages)) return []
    return (messages as ChatMessage[]).filter(
      (message) => (message.role === 'user' || message.role === 'assistant') && typeof message.content === 'string',
    )
  } catch {
    return []
  }
}

export async function saveChat(characterId: string, messages: ChatMessage[]) {
  const trimmed = messages.slice(-120)
  try {
    await setDoc(`${CHATS_DOC}/${characterId}`, { messages: trimmed })
  } catch {
    /* signed out: nothing to persist */
  }
}
