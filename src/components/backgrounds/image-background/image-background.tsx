import './image-background.css'

type ImageBackgroundProps = {
  src: string
  position?: string
  dim?: number
}

export default function ImageBackground({ src, position = 'center', dim = 0 }: ImageBackgroundProps) {
  const dark = Math.min(Math.max(dim, 0), 100) / 100

  return (
    <div
      className="image-background"
      style={{ backgroundImage: `url("${src}")`, backgroundPosition: position }}
    >
      <div className="image-background__dim" style={{ opacity: dark }} />
    </div>
  )
}
