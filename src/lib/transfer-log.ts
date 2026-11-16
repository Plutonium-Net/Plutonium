export type TransferEntry = {
  id: number
  method: string
  path: string
  requestBody: string | null
  status: number | null
  responseBody: string | null
  error: string | null
  startedAt: number
  endedAt: number | null
}

const MAX_ENTRIES = 200

let nextId = 1
let entries: TransferEntry[] = []
const listeners = new Set<() => void>()

function emit() {
  listeners.forEach((listener) => listener())
}

export function subscribeTransfers(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getTransfers() {
  return entries
}

export function beginTransfer(method: string, path: string, requestBody: string | null) {
  const entry: TransferEntry = {
    id: nextId++,
    method,
    path,
    requestBody,
    status: null,
    responseBody: null,
    error: null,
    startedAt: Date.now(),
    endedAt: null,
  }
  entries = [...entries.slice(-(MAX_ENTRIES - 1)), entry]
  emit()
  return entry.id
}

function patch(id: number, next: Partial<TransferEntry>) {
  entries = entries.map((entry) => (entry.id === id ? { ...entry, ...next } : entry))
  emit()
}

export function endTransfer(id: number, status: number, responseBody: string | null) {
  patch(id, { status, responseBody, endedAt: Date.now() })
}

export function failTransfer(id: number, error: string) {
  patch(id, { error, endedAt: Date.now() })
}
