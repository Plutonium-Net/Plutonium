import GamesPage from '@/components/games-page/games-page'
import type { PlutoRoute } from '@/lib/pluto-routes'
import './page-view.css'

/** In-browser pages: a real one for games, a placeholder for the rest. */
export default function PageView({ page }: { page: PlutoRoute }) {
  if (page.id === 'games') {
    return <GamesPage query={page.params.get('q') ?? ''} launchId={page.hash} />
  }

  return (
    <div className="page-view">
      <h1 className="page-view__title">{page.title}</h1>
    </div>
  )
}
