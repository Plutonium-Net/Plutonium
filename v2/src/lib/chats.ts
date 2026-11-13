/**
 * Saved AI conversations.
 *
 * Each conversation is its own document (`ai_conversations/<id>`), and a small
 * index document lists them so the rail can show history without knowing every
 * id ahead of time. Everything lives on the signed-in account; signed out the
 * calls fail quietly and the page keeps its in-memory copy.
 */

import type { ChatMessage } from '@/lib/ai'
import { deleteDoc, getDoc, setDoc } from '@/lib/cloud-store'

export type ConversationSummary = {
  id: string
  characterId: string
  title: string
  updatedAt: number
}

export type Conversation = ConversationSummary & {
  messages: ChatMessage[]
}

const INDEX_DOC = 'ai_conversation_index'
const DOC_PREFIX = 'ai_conversations'
const MAX_CONVERSATIONS = 60
const TITLE_LENGTH = 52

export function newConversationId() {
  return `t_${Math.random().toString(36).slice(2, 9)}`
}

/** The first thing the user said, trimmed to a menu-sized line. */
export function titleFor(messages: ChatMessage[]) {
  const first = messages.find((message) => message.role === 'user' && message.content.trim())
  if (!first) return 'New chat'
  const line = first.content.replace(/\s+/g, ' ').trim()
  return line.length > TITLE_LENGTH ? `${line.slice(0, TITLE_LENGTH - 1).trimEnd()}…` : line
}

function isSummary(value: unknown): value is ConversationSummary {
  const entry = value as ConversationSummary
  return Boolean(entry && typeof entry.id === 'string' && typeof entry.characterId === 'string' && typeof entry.title === 'string')
}

function sorted(items: ConversationSummary[]) {
  return [...items].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
}

export async function loadConversations(): Promise<ConversationSummary[]> {
  try {
    const doc = await getDoc(INDEX_DOC)
    const items = Array.isArray(doc?.items) ? doc.items : []
    return sorted(items.filter(isSummary))
  } catch {
    return []
  }
}

export async function loadConversation(id: string): Promise<Conversation | null> {
  try {
    const doc = await getDoc(`${DOC_PREFIX}/${id}`)
    if (!doc) return null
    const messages = Array.isArray(doc.messages) ? (doc.messages as ChatMessage[]) : []
    return {
      id,
      characterId: String(doc.characterId || ''),
      title: String(doc.title || titleFor(messages)),
      updatedAt: Number(doc.updatedAt) || 0,
      messages: messages.filter(
        (message) => (message.role === 'user' || message.role === 'assistant') && typeof message.content === 'string',
      ),
    }
  } catch {
    return null
  }
}

/** Writes the conversation and refreshes its place in the index. */
export async function saveConversation(conversation: Conversation): Promise<ConversationSummary | null> {
  const summary: ConversationSummary = {
    id: conversation.id,
    characterId: conversation.characterId,
    title: conversation.title || titleFor(conversation.messages),
    updatedAt: conversation.updatedAt || Date.now(),
  }
  const messages = conversation.messages.slice(-120)
  try {
    await setDoc(`${DOC_PREFIX}/${conversation.id}`, { ...summary, messages })
  } catch {
    return null
  }

  try {
    const items = (await loadConversations()).filter((entry) => entry.id !== summary.id)
    await setDoc(INDEX_DOC, { items: [summary, ...items].slice(0, MAX_CONVERSATIONS) })
  } catch {
    /* the conversation is saved even if the index write fails */
  }
  return summary
}

/** Removes a thread and its index entry. */
export async function deleteConversation(id: string) {
  try {
    await deleteDoc(`${DOC_PREFIX}/${id}`)
  } catch {
    return
  }
  try {
    const items = (await loadConversations()).filter((entry) => entry.id !== id)
    await setDoc(INDEX_DOC, { items })
  } catch {
    /* the thread is gone even if the index rewrite fails */
  }
}
