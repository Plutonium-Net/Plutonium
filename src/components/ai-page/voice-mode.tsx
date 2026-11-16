import { useEffect, useRef, useState } from 'react'
import { VoiceRing, useMicrophone } from 'voice-ring'
import PillGlass from '@/components/glass-pill/pill-glass'
import CharacterMark from '@/components/ai-page/character-mark'
import { speak, transcribe } from '@/lib/ai'
import type { Character } from '@/lib/characters'
import './voice-mode.css'

type Phase = 'idle' | 'listening' | 'thinking' | 'speaking' | 'error'

export default function VoiceMode({
  character,
  token,
  muted,
  onToggleMuted,
  onClose,
  onTurn,
}: {
  character: Character
  token: string | null
  muted: boolean
  onToggleMuted: () => void
  onClose: () => void
  onTurn: (text: string, onToken: (token: string) => void) => Promise<string>
}) {
  const [phase, setPhase] = useState<Phase>('idle')
  const [heard, setHeard] = useState('')
  const [reply, setReply] = useState('')
  const [note, setNote] = useState('')
  const [handsFree, setHandsFree] = useState(false)

  const mic = useMicrophone()
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const aliveRef = useRef(true)
  const phaseRef = useRef<Phase>('idle')

  phaseRef.current = phase

  useEffect(() => {
    aliveRef.current = true
    return () => {
      aliveRef.current = false
      mic.stop()
    }
  }, [])

  useEffect(() => {
    if (!mic.error) return
    setNote(mic.error.message)
    setPhase('error')
  }, [mic.error])

  function idleLevel() {
    if (phaseRef.current === 'speaking') return 0.42 + Math.sin(performance.now() / 170) * 0.2
    return 0.06
  }

  async function listen() {
    if (!token) {
      setNote('Sign in to talk with a character.')
      setPhase('error')
      return
    }
    if (!mic.supported) {
      setNote('This browser cannot capture audio.')
      setPhase('error')
      return
    }
    setNote('')
    setHeard('')
    setReply('')

    const stream = mic.stream || (await mic.start())
    if (!stream || !aliveRef.current) return

    const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : ''
    const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined)
    chunksRef.current = []
    recorder.ondataavailable = (event) => {
      if (event.data.size) chunksRef.current.push(event.data)
    }
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: mime || 'audio/webm' })
      void send(blob)
    }
    recorderRef.current = recorder
    recorder.start()
    setPhase('listening')
  }

  function stopListening() {
    mic.stop()
    if (recorderRef.current && recorderRef.current.state !== 'inactive') recorderRef.current.stop()
    recorderRef.current = null
    setPhase('thinking')
  }

  async function send(blob: Blob) {
    if (!token) return
    try {
      const text = await transcribe(blob, token)
      if (!aliveRef.current) return
      if (!text) {
        setNote('I did not catch that. Try again.')
        setPhase('idle')
        return
      }
      setHeard(text)
      setPhase('thinking')
      let growing = ''
      const answer = await onTurn(text, (chunk) => {
        growing += chunk
        if (aliveRef.current) setReply(growing)
      })
      if (!aliveRef.current) return
      setReply(answer)
      if (!muted && answer) {
        setPhase('speaking')
        await speak(answer, character.voice, token).catch(() => {})
      }
      if (!aliveRef.current) return
      setPhase('idle')
      if (handsFree) window.setTimeout(() => void listen(), 350)
    } catch (error) {
      if (!aliveRef.current) return
      setNote(error instanceof Error ? error.message : 'Something went wrong')
      setPhase('error')
    }
  }

  const listening = phase === 'listening'
  const thinking = phase === 'thinking'
  const speaking = phase === 'speaking'
  const ringState = listening ? 'listening' : thinking ? 'processing' : speaking ? 'speaking' : 'idle'

  return (
    <div
      className="voice-mode"
      style={{
        ['--voice-hue' as string]: character.hue,
        ['--char-hue' as string]: character.hue,
        ['--ai-hue' as string]: character.hue,
        ...(character.neutral ? { ['--voice-sat' as string]: '0%', ['--char-sat' as string]: '0%' } : null),
      }}
    >
      <div className="voice-mode__glow" aria-hidden="true" />

      <header className="voice-mode__head">
        <span className="voice-mode__who">
          <CharacterMark character={character} className="voice-mode__avatar" />
          <span className="voice-mode__copy">
            <span className="voice-mode__name">{character.name}</span>
            <span className="voice-mode__vibe">
              {listening ? 'Listening' : thinking ? 'Thinking' : speaking ? 'Speaking' : phase === 'error' ? 'Waiting' : 'Tap to speak'}
            </span>
          </span>
        </span>
        <button type="button" className="voice-mode__close" onClick={onClose} aria-label="Leave voice mode">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </header>

      <div className={`voice-mode__stage is-${phase}`}>
        <button
          type="button"
          className="voice-mode__ring"
          onClick={listening ? stopListening : () => void listen()}
          aria-label={listening ? 'Stop listening' : 'Start listening'}
        >
          <VoiceRing
            size={240}
            state={ringState}
            stream={listening ? mic.stream : null}
            level={idleLevel}
            emotion="calm"
            hoverBend
            theme="dark"
            sensitivity={0.9}
          />
        </button>
        <span className="voice-mode__ring-hint">{listening ? 'Tap to send' : speaking ? 'Tap to stop' : ''}</span>
      </div>

      <div className="voice-mode__captions">
        {heard && <p className="voice-mode__heard">{heard}</p>}
        {reply && <p className="voice-mode__reply">{reply}</p>}
        {!heard && !reply && (
          <p className="voice-mode__hint">
            {phase === 'error'
              ? note
              : thinking
                ? 'Working on an answer…'
                : listening
                  ? 'Speak, then tap the ring to send.'
                  : 'Tap the ring and say what is on your mind.'}
          </p>
        )}
        {note && phase !== 'error' && <p className="voice-mode__note">{note}</p>}
      </div>

      <footer className="voice-mode__foot">
        <button type="button" className={`voice-mode__toggle${muted ? ' is-on' : ''}`} onClick={onToggleMuted}>
          <PillGlass />
          {muted ? 'Voice off' : 'Voice on'}
        </button>
        <button
          type="button"
          className={`voice-mode__toggle${handsFree ? ' is-on' : ''}`}
          onClick={() => setHandsFree((value) => !value)}
        >
          <PillGlass />
          Hands-free {handsFree ? 'on' : 'off'}
        </button>
      </footer>
    </div>
  )
}
