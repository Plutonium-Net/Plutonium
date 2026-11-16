import './image-background.css'

type ImageBackgroundProps = {
  src: string
  /** Which part of the art stays in frame when the viewport ratio differs. */
  position?: string
  /** How dark the art sits, as a percentage of black laid over it (0-100). */
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
