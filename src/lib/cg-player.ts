import { regionOrigin, type CgRegion } from './cgapi'

export type CgPlayerPhase = 'connecting' | 'connected'

type SignalEnvelope = {
  type?: string
  sdp?: string
  candidate?: RTCIceCandidateInit | null
  id?: string
}

type ProtocolReply = {
  action?: string
  ack?: string
  codeError?: number
  descError?: string
}

export type CgPlayerOptions = {
  region: CgRegion
  server: string
  token: string
  game: string
  video: HTMLVideoElement
  onPhase?: (phase: CgPlayerPhase) => void
  onError?: (message: string) => void
}

const CONNECT_TIMEOUT = 35_000
const GATHER_TIMEOUT = 8_000

// The game hosts run a TURN server next to the session; the published web
// client always uses these relay credentials.
const TURN_USERNAME = '1830297600'
const TURN_CREDENTIAL = 'soQ5kv5gWwPwF2bZcqKZbDqds0k='

const AUDIO_OGG_OPUS = 4
const VIDEO_H264 = 1
const QUALITY_MODE = 3
const SESSION_DEFAULT = 0
const MAX_GAMEPADS = 4

type Stage = 'idle' | 'auth' | 'config' | 'apprun' | 'playing'

/**
 * Sorastream/WebRTC receiver. The game server offers over the signaling
 * socket, we answer with a fully gathered SDP (it ignores trickled
 * candidates), then authenticate on the data channel and ask the machine to
 * configure and launch the game before media starts flowing.
 */
export class CgPlayer {
  private readonly options: CgPlayerOptions
  private socket: WebSocket | null = null
  private peer: RTCPeerConnection | null = null
  private channel: RTCDataChannel | null = null
  private pendingCandidates: RTCIceCandidateInit[] = []
  private timer: number | null = null
  private closed = false
  private connected = false
  private remoteSet = false
  private answered = false
  private stage: Stage = 'idle'

  constructor(options: CgPlayerOptions) {
    this.options = options
  }

  start() {
    if (this.closed) return
    const { region, server, video } = this.options

    const url = new URL('/api/signal', regionOrigin(region))
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
    url.searchParams.set('server', server)

    const peer = new RTCPeerConnection({
      bundlePolicy: 'max-bundle',
      iceServers: [
        { urls: [`stun:${server}:3478`] },
        { urls: `turn:${server}:3478`, username: TURN_USERNAME, credential: TURN_CREDENTIAL },
      ],
    })
    this.peer = peer

    peer.ontrack = (event) => {
      const stream = video.srcObject instanceof MediaStream ? video.srcObject : new MediaStream()
      if (!stream.getTracks().includes(event.track)) stream.addTrack(event.track)
      video.srcObject = stream
      void video.play().catch(() => {})
    }
    peer.ondatachannel = (event) => {
      const channel = event.channel
      this.channel = channel
      channel.binaryType = 'arraybuffer'
      channel.onopen = () => this.authenticate()
      channel.onmessage = (message) => this.handleProtocolMessage(message.data)
    }
    peer.onconnectionstatechange = () => {
      if (this.closed) return
      if (peer.connectionState === 'connected') {
        if (!this.connected) {
          this.connected = true
          this.clearTimer()
          this.options.onPhase?.('connected')
        }
      } else if (peer.connectionState === 'failed') {
        this.fail('The game server could not be reached over WebRTC (ICE failed)')
      }
    }

    const socket = new WebSocket(url.toString(), 'sorartc-1.0')
    this.socket = socket
    socket.onmessage = (event) => {
      void this.handleSignal(event.data)
    }
    socket.onerror = () => {
      if (!this.answered) this.fail('The signaling socket could not be reached')
    }
    // The host closes the signaling socket once the answer is in; media then
    // flows over the peer connection, so only a close before the answer is fatal.
    socket.onclose = (event) => {
      if (this.closed || this.connected || this.answered) return
      const code = event.code ? ` (code ${event.code})` : ''
      this.fail(`The signaling socket closed before the stream started${code}`)
    }

    this.timer = window.setTimeout(() => {
      if (!this.connected) this.fail('The game server did not answer in time')
    }, CONNECT_TIMEOUT)
  }

  close() {
    if (this.closed) return
    this.closed = true
    this.connected = false
    this.clearTimer()
    this.pendingCandidates = []
    this.stage = 'idle'
    if (this.channel) {
      this.channel.onopen = null
      this.channel.onmessage = null
      this.channel.close()
      this.channel = null
    }
    if (this.socket) {
      this.socket.onmessage = null
      this.socket.onerror = null
      this.socket.onclose = null
      this.socket.close()
      this.socket = null
    }
    if (this.peer) {
      this.peer.ontrack = null
      this.peer.ondatachannel = null
      this.peer.onconnectionstatechange = null
      this.peer.close()
      this.peer = null
    }
    this.options.video.srcObject = null
  }

  private authenticate() {
    this.stage = 'auth'
    this.sendProtocol({ action: 'auth', method: 'classic', token: this.options.token })
  }

  private requestConfig() {
    this.stage = 'config'
    const ratio = window.devicePixelRatio || 1
    this.sendProtocol({
      action: 'appconfigure',
      screen_size: [Math.round(window.screen.width * ratio), Math.round(window.screen.height * ratio)],
      quality_mode: QUALITY_MODE,
      audio_fmt: AUDIO_OGG_OPUS,
      video_fmt: VIDEO_H264,
      audio_stream_enabled: 1,
      video_stream_enabled: 1,
      fps: 60,
      session_type: SESSION_DEFAULT,
      gamepads: MAX_GAMEPADS,
    })
  }

  private requestAppRun() {
    this.stage = 'apprun'
    this.sendProtocol({ action: 'apprun', game: this.options.game })
  }

  private handleProtocolMessage(raw: unknown) {
    if (this.closed || !(raw instanceof ArrayBuffer) || raw.byteLength < 5) return
    const length = new DataView(raw).getUint32(0, true)
    let reply: ProtocolReply
    try {
      const body = new Uint8Array(raw, 4, Math.min(length, raw.byteLength - 4))
      reply = JSON.parse(new TextDecoder().decode(body)) as ProtocolReply
    } catch {
      return
    }

    if (reply.action === 'error') {
      const code = typeof reply.codeError === 'number' ? ` (code ${reply.codeError})` : ''
      this.fail(reply.descError?.trim() || `The game machine rejected the session${code}`)
      return
    }
    if (reply.ack !== 'ok') return

    if (this.stage === 'auth') {
      this.requestConfig()
    } else if (this.stage === 'config') {
      this.requestAppRun()
    } else if (this.stage === 'apprun') {
      this.stage = 'playing'
    }
  }

  private sendProtocol(payload: Record<string, unknown>) {
    const channel = this.channel
    if (!channel || channel.readyState !== 'open') return
    const body = new TextEncoder().encode(JSON.stringify(payload))
    const frame = new Uint8Array(body.byteLength + 4)
    new DataView(frame.buffer).setUint32(0, body.byteLength, true)
    frame.set(body, 4)
    try {
      channel.send(frame)
    } catch {
      // A closing channel is reported through the peer connection state.
    }
  }

  private fail(message: string) {
    if (this.closed) return
    this.close()
    this.options.onError?.(message)
  }

  private clearTimer() {
    if (this.timer !== null) {
      window.clearTimeout(this.timer)
      this.timer = null
    }
  }

  private send(message: Record<string, unknown>) {
    const socket = this.socket
    if (!socket || socket.readyState !== WebSocket.OPEN) return
    socket.send(JSON.stringify(message))
  }

  private async waitForGathering(peer: RTCPeerConnection) {
    if (peer.iceGatheringState === 'complete') return
    await new Promise<void>((resolve) => {
      const finish = () => {
        window.clearTimeout(timer)
        peer.removeEventListener('icegatheringstatechange', check)
        resolve()
      }
      const check = () => {
        if (peer.iceGatheringState === 'complete') finish()
      }
      const timer = window.setTimeout(finish, GATHER_TIMEOUT)
      peer.addEventListener('icegatheringstatechange', check)
    })
  }

  private async handleSignal(raw: unknown) {
    if (this.closed) return
    let message: SignalEnvelope
    try {
      message = JSON.parse(String(raw)) as SignalEnvelope
    } catch {
      return
    }

    const peer = this.peer
    if (!peer) return

    if (message.type === 'offer' && typeof message.sdp === 'string') {
      try {
        await peer.setRemoteDescription({ type: 'offer', sdp: message.sdp })
        this.remoteSet = true
        for (const candidate of this.pendingCandidates.splice(0)) {
          await peer.addIceCandidate(candidate).catch(() => {})
        }
        await peer.setLocalDescription(await peer.createAnswer())
        // The host only uses the candidates carried in the answer SDP.
        await this.waitForGathering(peer)
        if (this.closed) return
        const answer = peer.localDescription
        if (!answer) throw new Error('no local description')
        this.answered = true
        this.send({ id: 'server', type: 'answer', sdp: answer.sdp })
      } catch {
        this.fail('The game server offer could not be answered')
      }
      return
    }

    if (message.type !== 'candidate' || !message.candidate) return
    if (this.remoteSet) {
      await peer.addIceCandidate(message.candidate).catch(() => {})
    } else {
      this.pendingCandidates.push(message.candidate)
    }
  }
}
