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

/**
 * The download page, dressed as the home screen: the default wallpaper, the
 * wordmark, the clock and the accounts, with the search pill replaced by the
 * one action the page has.
 */
export default function DownloadPage() {
  return (
    <>
      <SoftAuroraBackground />

      <main className="download-page">
        <div className="download-page__inner">
          <h1 className="download-page__mark">Plutonium</h1>

          <a
            className="download-page__action"
            href="./plutonium.html"
            download="plutonium.html"
            aria-label={SIZE ? `Download the single file (${SIZE})` : 'Download the single file'}
          >
            <BorderBeam className="download-page__beam" {...BEAM_PROPS} borderRadius={999} active>
              <GlassSurface
                className="download-page__glass"
                width="100%"
                height="100%"
                borderRadius={999}
                backgroundOpacity={0.1}
                saturation={1.2}
                displace={0.5}
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
                  <span>Download</span>
                  {SIZE ? <span className="download-page__size">{SIZE}</span> : null}
                </span>
              </GlassSurface>
            </BorderBeam>
          </a>

          <p className="download-page__lede">
            The shell, the game library, media, Stelena AI, the app catalog and the Compaxy browser, in
            one HTML file. Keep it on disk and open it with a double-click.
          </p>

          <p className="download-page__alts">
            <a className="download-page__ghost" href="./plutonium.html">
              Open in browser
            </a>
            <span className="download-page__dot" aria-hidden="true">
              ·
            </span>
            <a
              className="download-page__ghost"
              href="./plutonium.svg"
              download="plutonium.svg"
              aria-label={SVG_SIZE ? `Download the SVG version (${SVG_SIZE})` : 'Download the SVG version'}
            >
              SVG version{SVG_SIZE ? ` (${SVG_SIZE})` : ''}
            </a>
          </p>

          <CopyCheck />
        </div>
      </main>

      <Clock />
      <SocialLinks />
    </>
  )
}
