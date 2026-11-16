import { BorderBeam } from 'border-beam'
import SoftAuroraBackground from '@/components/backgrounds/soft-aurora/soft-aurora-background'
import Clock from '@/components/clock/clock'
import GlassSurface from '@/components/glass-surface/GlassSurface'
import SocialLinks from '@/components/social-links/social-links'
import { BEAM_PROPS } from '@/lib/beam'
import CopyCheck from './copy-check'
import './download-page.css'

/** The sizes the Pages build baked in; blank when the page is run any other way. */
const SIZE = typeof __PLU_SIZE__ === 'string' ? __PLU_SIZE__ : ''
const SVG_SIZE = typeof __PLU_SVG_SIZE__ === 'string' ? __PLU_SVG_SIZE__ : ''
const XHTML_SIZE = typeof __PLU_XHTML_SIZE__ === 'string' ? __PLU_XHTML_SIZE__ : ''

/** The same build, three ways. The first is the one to hand most people. */
const FILES = [
  { file: 'plutonium.html', label: 'HTML', size: SIZE, primary: true },
  { file: 'plutonium.svg', label: 'SVG', size: SVG_SIZE },
  { file: 'plutonium.xhtml', label: 'XHTML', size: XHTML_SIZE },
]

type DownloadButtonProps = {
  file: string
  label: string
  size: string
  primary?: boolean
}

/** The search pill, holding a download instead of a query. */
function DownloadButton({ file, label, size, primary = false }: DownloadButtonProps) {
  const glass = (
    <GlassSurface
      className="download-page__glass"
      width="100%"
      height="100%"
      borderRadius={999}
      backgroundOpacity={primary ? 0.1 : 0.05}
      saturation={primary ? 1.2 : 1}
      displace={primary ? 0.5 : 0.2}
    >
      <span className="download-page__action-inner">
        <svg
          className="download-page__icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M12 4v11" />
          <path d="m7 10 5 5 5-5" />
          <path d="M5 20h14" />
        </svg>
        <span>Download {label}</span>
        {size ? <span className="download-page__size">{size}</span> : null}
      </span>
    </GlassSurface>
  )

  return (
    <a
      className={`download-page__action${primary ? ' is-primary' : ''}`}
      href={`./${file}`}
      download={file}
      aria-label={size ? `Download the ${label} version (${size})` : `Download the ${label} version`}
    >
      {primary ? (
        <BorderBeam className="download-page__beam" {...BEAM_PROPS} borderRadius={999} active>
          {glass}
        </BorderBeam>
      ) : (
        glass
      )}
    </a>
  )
}

/**
 * The download page, dressed as the home screen: the default wallpaper, the
 * wordmark, the clock and the accounts, with the search pill replaced by the
 * two files the page hands over.
 */
export default function DownloadPage() {
  return (
    <>
      <SoftAuroraBackground />

      <main className="download-page">
        <div className="download-page__inner">
          <h1 className="download-page__mark">Plutonium</h1>

          {FILES.map((entry) => (
            <DownloadButton key={entry.file} {...entry} />
          ))}

          <p className="download-page__lede">
            The shell, the game library, media, Stelena AI, the app catalog and the Compaxy browser, in
            a single file. Keep it on disk and open it with a double-click.
          </p>

          <a className="download-page__ghost" href="./plutonium.html">
            Open in browser
          </a>

          <CopyCheck />
        </div>
      </main>

      <Clock />
      <SocialLinks />
    </>
  )
}
