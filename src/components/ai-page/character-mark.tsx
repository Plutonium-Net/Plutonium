import type { Character } from '@/lib/characters'

/**
 * A character's badge: its logo when it has one, otherwise the chosen emoji.
 * The logo is drawn with `mix-blend-mode: screen`, so the artwork's black plate
 * disappears into the dark UI and only the chrome spark remains.
 */
export default function CharacterMark({
  character,
  className,
}: {
  character: Pick<Character, 'emoji' | 'image'>
  className: string
}) {
  if (character.image) {
    return (
      <span className={`${className} is-logo`}>
        <img src={character.image} alt="" draggable={false} />
      </span>
    )
  }

  return <span className={className}>{character.emoji}</span>
}
