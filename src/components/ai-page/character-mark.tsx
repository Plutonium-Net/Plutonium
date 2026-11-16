import type { Character } from '@/lib/characters'

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
