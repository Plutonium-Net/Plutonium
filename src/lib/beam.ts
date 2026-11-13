import type { BorderBeamProps } from 'border-beam'

/** Every border beam in the app spreads these, so intensity is tuned in one place. */
export const BEAM_PROPS: Pick<BorderBeamProps, 'size' | 'colorVariant' | 'theme' | 'strength' | 'brightness' | 'glowSize'> = {
  size: 'md',
  colorVariant: 'colorful',
  theme: 'dark',
  strength: 1,
  brightness: 1.6,
  glowSize: 1.15,
}
