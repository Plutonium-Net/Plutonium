import { useClipAvailability } from './clip-button'
import './clip-button.css'

export default function ClipExtensionNotice() {
  const availability = useClipAvailability()

  if (availability !== 'missing') return null

  return (
    <div className="clip-install" role="status">
      <div className="clip-install__body">
        <h2>Clip recording is off — Plutonium Clip is not installed in this browser</h2>
        <p>
          Chrome only lets an extension capture a tab without the screen-share picker, so the clip buttons stay hidden
          until <strong>Plutonium Clip</strong> is installed. It works on every site that hosts Plutonium, including
          your own deployment.
        </p>
        <ol>
          <li>
            Install <strong>Plutonium Clip</strong> from the Chrome Web Store.
          </li>
          <li>
            Reload Plutonium so the recorder can attach to this page. If you would rather keep it open, click the
            Plutonium Clip icon in the toolbar once instead.
          </li>
          <li>Press clip in a game or on a proxied tab to start recording, then press it again to stop and save.</li>
        </ol>
        <p>
          Chrome only permits tab capture straight after the extension is invoked, so if clip does nothing, click the
          Plutonium Clip toolbar icon once — that click records too.
        </p>
      </div>
      <button type="button" onClick={() => window.location.reload()}>
        Reload Plutonium
      </button>
    </div>
  )
}
