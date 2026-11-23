import type { ClipMeta } from './db'

export type TrimResult = {
  blob: Blob
  mime: string
  duration: number
  width: number
  height: number
}

const MIME_CANDIDATES = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4']

function pickMime(preferred?: string): string {
  if (typeof MediaRecorder === 'undefined') return ''
  const candidates = [preferred, ...MIME_CANDIDATES].filter((value): value is string => !!value)
  for (const type of candidates) {
    try {
      if (MediaRecorder.isTypeSupported(type)) return type
    } catch {
      // Keep looking when a codec string is rejected.
    }
  }
  return ''
}

function once(target: EventTarget, event: string, timeout = 8000): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      target.removeEventListener(event, handler)
      reject(new Error(`Timed out waiting for ${event}.`))
    }, timeout)
    const handler = () => {
      window.clearTimeout(timer)
      target.removeEventListener(event, handler)
      resolve()
    }
    target.addEventListener(event, handler)
  })
}

type CapturableVideo = HTMLVideoElement & {
  captureStream?: (frameRate?: number) => MediaStream
  mozCaptureStream?: (frameRate?: number) => MediaStream
}

function captureStreamOf(video: HTMLVideoElement): MediaStream {
  const element = video as CapturableVideo
  const capture = element.captureStream ?? element.mozCaptureStream
  if (!capture) throw new Error('This browser cannot trim clips.')
  // Match the recorder so trimming does not quietly halve the clip's smoothness.
  return capture.call(element, 45)
}

function waitForTime(video: HTMLVideoElement, time: number, timeout: number): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (video.currentTime >= time - 0.05 || video.ended) {
      resolve()
      return
    }
    const timer = window.setTimeout(() => {
      cleanup()
      reject(new Error('Playback stalled while trimming. Try a shorter selection.'))
    }, timeout)
    const cleanup = () => {
      window.clearTimeout(timer)
      video.removeEventListener('timeupdate', check)
    }
    const check = () => {
      if (video.currentTime >= time - 0.05 || video.ended) {
        cleanup()
        resolve()
      }
    }
    video.addEventListener('timeupdate', check)
  })
}

export async function makeThumbnail(blob: Blob): Promise<string> {
  const url = URL.createObjectURL(blob)
  const video = document.createElement('video')
  video.src = url
  video.muted = true
  video.playsInline = true
  video.preload = 'auto'
  try {
    await once(video, 'loadeddata', 10_000)
    if (!video.videoWidth || !video.videoHeight) return ''
    const target = Number.isFinite(video.duration) ? Math.min(1, video.duration * 0.15) : 0
    if (target > 0.05) {
      video.currentTime = target
      await once(video, 'seeked', 2000).catch(() => {})
    }
    const canvas = document.createElement('canvas')
    const scale = Math.min(1, 520 / video.videoWidth)
    canvas.width = Math.max(1, Math.round(video.videoWidth * scale))
    canvas.height = Math.max(1, Math.round(video.videoHeight * scale))
    const context = canvas.getContext('2d')
    if (!context) return ''
    context.drawImage(video, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/jpeg', 0.72)
  } catch {
    return ''
  } finally {
    video.removeAttribute('src')
    video.load()
    URL.revokeObjectURL(url)
  }
}

export async function trimClip(
  source: Blob,
  startSeconds: number,
  endSeconds: number,
  onProgress?: (progress: number) => void,
): Promise<TrimResult> {
  if (typeof MediaRecorder === 'undefined') throw new Error('Trimming is not supported in this browser.')

  const start = Math.max(0, startSeconds)
  const end = Math.max(start + 0.3, endSeconds)
  const url = URL.createObjectURL(source)
  const video = document.createElement('video')
  video.src = url
  video.muted = true
  video.playsInline = true
  video.preload = 'auto'

  let recorder: MediaRecorder | null = null
  let ticker: number | null = null

  try {
    await once(video, 'loadedmetadata', 10_000)
    const knownDuration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : end + 1
    const from = Math.min(start, Math.max(0, knownDuration - 0.3))
    const to = Math.min(end, knownDuration)

    // MediaRecorder blobs often report an infinite duration, so seeking can
    // silently fail. If it does we simply start capturing at the right moment
    // during normal playback instead.
    try {
      video.currentTime = from
    } catch {
      // Ignore: playback-based fallback below covers it.
    }
    await once(video, 'seeked', 1500).catch(() => {})

    await video.play().catch(() => {})
    await waitForTime(video, from, Math.max(5000, (from + 5) * 1000))

    const stream = captureStreamOf(video)
    const mime = pickMime(source.type)
    const chunks: BlobPart[] = []
    recorder = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 8_000_000 } : { videoBitsPerSecond: 8_000_000 })
    recorder.ondataavailable = (event) => {
      if (event.data.size) chunks.push(event.data)
    }
    const stopped = new Promise<void>((resolve) => {
      if (recorder) recorder.onstop = () => resolve()
    })
    recorder.start(200)

    ticker = window.setInterval(() => {
      const span = Math.max(0.1, to - from)
      const progress = Math.min(1, Math.max(0, (video.currentTime - from) / span))
      onProgress?.(progress)
    }, 150)

    await waitForTime(video, to, Math.max(5000, (to - from) * 2000))
    video.pause()
    recorder.stop()
    await stopped
    onProgress?.(1)

    const blob = new Blob(chunks, { type: recorder.mimeType || mime || 'video/webm' })
    if (!blob.size) throw new Error('The trimmed clip came out empty.')
    return {
      blob,
      mime: blob.type || 'video/webm',
      duration: Math.max(0, (to - from) * 1000),
      width: video.videoWidth,
      height: video.videoHeight,
    }
  } finally {
    if (ticker !== null) window.clearInterval(ticker)
    try {
      if (recorder && recorder.state !== 'inactive') recorder.stop()
    } catch {
      // The recorder is already winding down.
    }
    video.pause()
    video.removeAttribute('src')
    video.load()
    URL.revokeObjectURL(url)
  }
}

export function downloadClip(clip: ClipMeta, blob: Blob) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  const base =
    clip.title
      .trim()
      .replace(/[\\/:*?"<>|]+/g, '')
      .replace(/\s+/g, ' ')
      .slice(0, 80) || 'clip'
  link.href = url
  link.download = `${base}.${clip.mime.includes('mp4') ? 'mp4' : 'webm'}`
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 5000)
}
