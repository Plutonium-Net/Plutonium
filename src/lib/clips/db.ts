export type ClipSource = 'game' | 'tab'

export type ClipMeta = {
  id: string
  title: string
  createdAt: number
  duration: number
  width: number
  height: number
  size: number
  mime: string
  thumb: string
  favorite: boolean
  source: ClipSource
}

const DB_NAME = 'plutonium-clips'
const DB_VERSION = 1
const META_STORE = 'clips'
const BLOB_STORE = 'blobs'

let dbPromise: Promise<IDBDatabase> | null = null
const listeners = new Set<() => void>()

function openDatabase(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('This browser cannot store clips.'))
      return
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains(META_STORE)) {
        const store = database.createObjectStore(META_STORE, { keyPath: 'id' })
        store.createIndex('createdAt', 'createdAt')
      }
      if (!database.objectStoreNames.contains(BLOB_STORE)) {
        database.createObjectStore(BLOB_STORE, { keyPath: 'id' })
      }
    }
    request.onsuccess = () => {
      const database = request.result
      database.onversionchange = () => database.close()
      resolve(database)
    }
    request.onerror = () => {
      dbPromise = null
      reject(request.error ?? new Error('Clip storage could not be opened.'))
    }
    request.onblocked = () => {
      dbPromise = null
      reject(new Error('Close other Plutonium tabs, then try again.'))
    }
  })
  return dbPromise
}

function readRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Clip storage request failed.'))
  })
}

function storageError(error: DOMException | null): Error {
  if (error?.name === 'QuotaExceededError') {
    return new Error('Clip storage is full. Delete a clip or download one, then try again.')
  }
  return error ?? new Error('Clip storage rejected the write.')
}

function write(database: IDBDatabase, stores: string[], fill: (transaction: IDBTransaction) => void): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(stores, 'readwrite')
    fill(transaction)
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(storageError(transaction.error))
    transaction.onabort = () => reject(storageError(transaction.error))
  })
}

function emit() {
  for (const listener of listeners) listener()
}

export async function listClips(): Promise<ClipMeta[]> {
  const database = await openDatabase()
  const store = database.transaction(META_STORE, 'readonly').objectStore(META_STORE)
  const all = await readRequest(store.getAll() as IDBRequest<ClipMeta[]>)
  return all.sort((a, b) => b.createdAt - a.createdAt)
}

export async function getClipBlob(id: string): Promise<Blob | null> {
  const database = await openDatabase()
  const store = database.transaction(BLOB_STORE, 'readonly').objectStore(BLOB_STORE)
  const row = await readRequest(store.get(id) as IDBRequest<{ id: string; blob: Blob } | undefined>)
  return row?.blob ?? null
}

export async function addClip(meta: ClipMeta, blob: Blob): Promise<void> {
  const database = await openDatabase()
  await write(database, [META_STORE, BLOB_STORE], (transaction) => {
    transaction.objectStore(META_STORE).put(meta)
    transaction.objectStore(BLOB_STORE).put({ id: meta.id, blob })
  })
  emit()
}

export async function updateClip(id: string, patch: Partial<Omit<ClipMeta, 'id'>>): Promise<ClipMeta | null> {
  const database = await openDatabase()
  const store = database.transaction(META_STORE, 'readonly').objectStore(META_STORE)
  const existing = await readRequest(store.get(id) as IDBRequest<ClipMeta | undefined>)
  if (!existing) return null
  const next = { ...existing, ...patch }
  await write(database, [META_STORE], (transaction) => {
    transaction.objectStore(META_STORE).put(next)
  })
  emit()
  return next
}

export async function deleteClip(id: string): Promise<void> {
  const database = await openDatabase()
  await write(database, [META_STORE, BLOB_STORE], (transaction) => {
    transaction.objectStore(META_STORE).delete(id)
    transaction.objectStore(BLOB_STORE).delete(id)
  })
  emit()
}

export function subscribeClips(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
