// Records the captured tab, cropped to the rectangle the page asked for, from
// the moment clip is pressed until it is pressed again.
//
// The page never touches Chrome APIs: the service worker hands this document a
// tabCapture stream id, this document draws the cropped frames into a canvas and
// runs MediaRecorder on it, then sends the finished WebM back in base64 pieces.

const SCOPE = 'plu-clip'
// 45 fps keeps game motion readable without asking the encoder for twice the
// frames of 60. The canvas stream and the recorder both honour it; if the tab
// paints slower than this, the capture simply repeats the newest frame.
const FPS = 45
const MAX_WIDTH = 1920
const PIECE_BYTES = 384 * 1024 // divisible by 3, so every base64 piece decodes alone
const STREAM_TIMEOUT = 8000

let session = null

function messageOf(error) {
  if (!error) return 'Unknown error'
  if (typeof error === 'string') return error
  return error.message || String(error)
}

// getUserMedia can sit forever when Chrome accepts the stream id but never
// delivers frames; a stuck promise would leave the page saying nothing at all.
function withTimeout(promise, ms, message) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error) => {
        clearTimeout(timer)
        reject(error)
      },
    )
  })
}

function pickMime() {
  // VP8 first: it encodes several times faster in real time than VP9, and the
  // recorder runs alongside the game it is capturing.
  const candidates = ['video/webm;codecs=vp8', 'video/webm;codecs=vp9', 'video/webm']
  for (const type of candidates) {
    try {
      if (MediaRecorder.isTypeSupported(type)) return type
    } catch {
      // Keep looking.
    }
  }
  return ''
}

function waitForMetadata(video) {
  return new Promise((resolve) => {
    if (video.videoWidth > 0) {
      resolve()
      return
    }
    const timer = setTimeout(finish, 4000)
    function finish() {
      clearTimeout(timer)
      video.removeEventListener('loadedmetadata', finish)
      video.removeEventListener('resize', finish)
      resolve()
    }
    video.addEventListener('loadedmetadata', finish)
    video.addEventListener('resize', finish)
  })
}

function cropFor(rect, sourceWidth, sourceHeight, viewportWidth, viewportHeight) {
  const safeViewportWidth = Math.max(1, Number(viewportWidth) || sourceWidth)
  const safeViewportHeight = Math.max(1, Number(viewportHeight) || sourceHeight)
  const scaleX = sourceWidth / safeViewportWidth
  const scaleY = sourceHeight / safeViewportHeight

  const left = Math.max(0, Number(rect?.x) || 0)
  const top = Math.max(0, Number(rect?.y) || 0)
  const wantedWidth = Number(rect?.width) || safeViewportWidth
  const wantedHeight = Number(rect?.height) || safeViewportHeight

  const sx = Math.min(sourceWidth - 2, Math.max(0, Math.round(left * scaleX)))
  const sy = Math.min(sourceHeight - 2, Math.max(0, Math.round(top * scaleY)))
  const sw = Math.max(2, Math.min(sourceWidth - sx, Math.round(wantedWidth * scaleX)))
  const sh = Math.max(2, Math.min(sourceHeight - sy, Math.round(wantedHeight * scaleY)))

  let width = sw - (sw % 2)
  let height = sh - (sh % 2)
  if (width > MAX_WIDTH) {
    const shrink = MAX_WIDTH / width
    width = MAX_WIDTH
    height = Math.max(2, Math.round((height * shrink) / 2) * 2)
  }
  return { sx, sy, sw, sh, width, height }
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : ''
      const comma = result.indexOf(',')
      resolve(comma === -1 ? '' : result.slice(comma + 1))
    }
    reader.onerror = () => reject(reader.error ?? new Error('The clip could not be encoded.'))
    reader.readAsDataURL(blob)
  })
}

function send(message) {
  return chrome.runtime.sendMessage({ scope: SCOPE, ...message }).catch(() => {})
}

/* ------------------------------------------------------------------ *
 * Recording
 * ------------------------------------------------------------------ */

function draw(active) {
  if (!active || active.stopped) return
  try {
    // Re-draw every tick even when the source has not changed: the canvas only
    // emits a frame when it is modified, so a steady draw is what gives the
    // recording a constant frame rate.
    active.context.drawImage(
      active.video,
      active.crop.sx,
      active.crop.sy,
      active.crop.sw,
      active.crop.sh,
      0,
      0,
      active.width,
      active.height,
    )
  } catch {
    // A frame may be unavailable while the stream is starting up.
  }
}

async function begin({ streamId, rect, viewport }) {
  if (session) return { ok: false, error: 'A clip is already recording. Stop it first.' }
  if (!streamId) return { ok: false, error: 'Chrome did not return a capture stream.' }

  let stream
  try {
    if (!navigator.mediaDevices?.getUserMedia) {
      return { ok: false, error: 'This browser cannot record tab video.' }
    }
    stream = await withTimeout(
      navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          mandatory: {
            chromeMediaSource: 'tab',
            chromeMediaSourceId: streamId,
            maxFrameRate: FPS,
          },
        },
      }),
      STREAM_TIMEOUT,
      'Chrome did not hand over the tab stream. Reload Plutonium and try again.',
    )
  } catch (error) {
    const text = messageOf(error)
    return { ok: false, error: /^Chrome did not/.test(text) ? text : `Chrome refused the capture: ${text}` }
  }

  const video = document.getElementById('source')
  const canvas = document.getElementById('crop')
  video.srcObject = stream
  video.muted = true
  video.playsInline = true

  try {
    await video.play().catch(() => {})
    await waitForMetadata(video)
  } catch (error) {
    stream.getTracks().forEach((track) => track.stop())
    return { ok: false, error: messageOf(error) }
  }

  const sourceWidth = video.videoWidth || Math.max(2, Number(viewport?.width) || 2)
  const sourceHeight = video.videoHeight || Math.max(2, Number(viewport?.height) || 2)
  const crop = cropFor(rect, sourceWidth, sourceHeight, viewport?.width, viewport?.height)

  canvas.width = crop.width
  canvas.height = crop.height
  const context = canvas.getContext('2d', { alpha: false })
  if (!context) {
    stream.getTracks().forEach((track) => track.stop())
    return { ok: false, error: 'The recorder could not create a canvas.' }
  }
  context.fillStyle = '#000'
  context.fillRect(0, 0, crop.width, crop.height)

  const out = canvas.captureStream(FPS)
  const mime = pickMime()
  const bitrate = Math.min(12_000_000, Math.max(3_000_000, Math.round(crop.width * crop.height * FPS * 0.1)))

  let recorder
  try {
    recorder = mime
      ? new MediaRecorder(out, { mimeType: mime, videoBitsPerSecond: bitrate })
      : new MediaRecorder(out, { videoBitsPerSecond: bitrate })
  } catch (error) {
    stream.getTracks().forEach((track) => track.stop())
    return { ok: false, error: `This browser cannot record: ${messageOf(error)}` }
  }

  const recording = {
    stream,
    video,
    context,
    recorder,
    chunks: [],
    crop,
    startedAt: Date.now(),
    width: crop.width,
    height: crop.height,
    stopped: false,
    pumpTimer: null,
  }
  recorder.ondataavailable = (event) => {
    if (event.data && event.data.size) recording.chunks.push(event.data)
  }
  try {
    recorder.start(500)
  } catch (error) {
    stream.getTracks().forEach((track) => track.stop())
    video.srcObject = null
    return { ok: false, error: `This browser cannot record: ${messageOf(error)}` }
  }
  session = recording

  // An offscreen document is never composited, so frame callbacks tied to
  // painting (requestVideoFrameCallback) stall or arrive in bursts and the clip
  // comes out as a slideshow. Drive the canvas from a clock instead: one draw
  // per tick keeps the capture stream fed at a steady FPS no matter what the
  // document is doing.
  const step = 1000 / FPS
  let next = performance.now()
  const pump = () => {
    if (recording.stopped) return
    draw(recording)
    // A stalled video element would freeze the clip, so nudge it back to life.
    if (recording.video.paused) recording.video.play().catch(() => {})
    next += step
    const now = performance.now()
    // Fell behind (a heavy encode): resync instead of firing a burst of frames.
    if (next < now - step) next = now
    recording.pumpTimer = setTimeout(pump, Math.max(0, next - now))
  }
  pump()

  return { ok: true, width: crop.width, height: crop.height }
}

async function stop() {
  const active = session
  if (!active) return { ok: false, error: 'Nothing is recording.' }

  active.stopped = true

  if (active.pumpTimer) clearTimeout(active.pumpTimer)

  const duration = Date.now() - active.startedAt
  let blob = null
  try {
    blob = await new Promise((resolve) => {
      const finish = () =>
        resolve(new Blob(active.chunks, { type: active.recorder.mimeType || 'video/webm' }))
      active.recorder.onstop = finish
      try {
        active.recorder.stop()
      } catch {
        finish()
      }
    })
  } finally {
    session = null
    active.stream.getTracks().forEach((track) => track.stop())
    active.video.srcObject = null
  }

  if (!blob || !blob.size) {
    await send({ type: 'error', message: 'The clip came out empty. Try recording a little longer.' })
    return { ok: true, empty: true }
  }

  let base64 = ''
  try {
    base64 = await blobToBase64(blob)
  } catch (error) {
    await send({ type: 'error', message: messageOf(error) })
    return { ok: false, error: messageOf(error) }
  }

  for (let index = 0; index < base64.length; index += PIECE_BYTES) {
    await send({ type: 'chunk', data: base64.slice(index, index + PIECE_BYTES) })
  }

  await send({
    type: 'done',
    mime: blob.type || 'video/webm',
    width: active.width,
    height: active.height,
    duration,
    size: blob.size,
  })

  return { ok: true }
}

function cancel() {
  const active = session
  session = null
  if (!active) return
  active.stopped = true
  if (active.pumpTimer) clearTimeout(active.pumpTimer)
  try {
    if (active.recorder.state !== 'inactive') active.recorder.stop()
  } catch {
    // Already stopped.
  }
  try {
    active.stream.getTracks().forEach((track) => track.stop())
  } catch {
    // Already released.
  }
  active.video.srcObject = null
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Only messages the service worker addressed to this document count; the page
  // and the worker use the same channel name.
  if (!message || message.scope !== SCOPE || message.to !== 'recorder') return

  if (message.type === 'ping') {
    sendResponse({ ok: true, recording: Boolean(session) })
    return
  }

  if (message.type === 'begin') {
    begin(message)
      .then(sendResponse)
      .catch((error) => sendResponse({ ok: false, error: messageOf(error) }))
    return true
  }

  if (message.type === 'stop') {
    stop()
      .then(sendResponse)
      .catch((error) => sendResponse({ ok: false, error: messageOf(error) }))
    return true
  }

  if (message.type === 'cancel') {
    cancel()
    sendResponse({ ok: true })
  }
})
