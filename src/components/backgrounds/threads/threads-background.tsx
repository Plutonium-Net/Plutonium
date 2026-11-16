import { useAccent } from '@/hooks/use-accent'
import Threads from './Threads'
import './threads-background.css'

export default function ThreadsBackground() {
  const accent = useAccent()

  return (
    <div className="threads-background">
      <Threads
        color={accent.hex}
        lineCount={90}
        thickness={0.6}
        softness={1.3}
        amplitude={1.7}
        distance={0.4}
        waves={1.05}
        speed={0.6}
        split={0.04}
        fray={0.5}
        angle={25}
        taper={0.85}
        brightness={1.4}
        parting={0}
        enableMouseInteraction={false}
        fade={0}
        opacity={1}
      />
    </div>
  )
}
