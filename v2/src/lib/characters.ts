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
 * Stelena is Plutonium's official assistant, and the only character that ships
 * with the build; anything else in the rail was made by the user. The prompt is
 * v1's, kept word for word so the assistant sounds the same in both apps.
 */
export const DEFAULT_CHARACTERS: Character[] = [
  {
    id: 'stelena',
    name: 'Stelena',
    emoji: '✦',
    hue: 337,
    vibe: 'Official Plutonium AI',
    voice: 'hannah',
    builtin: true,
    prompt: `You are Stelena, the official AI assistant of Plutonium Network.

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
The intelligence behind Plutonium Network.`,
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
