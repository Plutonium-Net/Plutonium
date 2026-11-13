import GamesPage from '@/components/games-page/games-page'
import MediaPage from '@/components/media-page/media-page'
import VmsPage from '@/components/vms-page/vms-page'
import type { PlutoRoute } from '@/lib/pluto-routes'
import './page-view.css'

/** In-browser pages: a real one for games, a placeholder for the rest. */
export default function PageView({ page }: { page: PlutoRoute }) {
  if (page.id === 'games') {
    return <GamesPage query={page.params.get('q') ?? ''} launchId={page.hash} />
  }

  if (page.id === 'media') {
    return <MediaPage />
  }

  if (page.id === 'vms') {
    return <VmsPage autostart={page.params.get('autostart') === '1'} />
  }

  return (
    <div className="page-view">
      <h1 className="page-view__title">{page.title}</h1>
    </div>
  )
}
