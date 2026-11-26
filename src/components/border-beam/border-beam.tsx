import { BorderBeam as Beam, type BorderBeamProps } from 'border-beam'
import { usePerformance } from '@/hooks/use-performance'

export type { BorderBeamProps }

/**
 * Everything that draws a border beam goes through here, so Performance Mode can
 * switch them all off at once. The wrapper element itself stays, because call
 * sites rely on its class for sizing; only the beam layers and stylesheet go.
 */
export default function BorderBeam({ children, className, style }: BorderBeamProps) {
  const performance = usePerformance()

  if (performance.enabled && performance.features.borderBeam) {
    return (
      <div className={className} style={style}>
        {children}
      </div>
    )
  }

  return (
    <Beam className={className} style={style}>
      {children}
    </Beam>
  )
}
