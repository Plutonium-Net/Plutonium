import AiPage from '@/components/ai-page/ai-page'
import AppsPage from '@/components/apps-page/apps-page'
import ClipsPage from '@/components/clips-page/clips-page'
import CloudGamingPage from '@/components/cloud-gaming-page/cloud-gaming-page'
import PTransferPage from '@/components/ptransfer-page/ptransfer-page'
import GamesPage from '@/components/games-page/games-page'
import MediaPage from '@/components/media-page/media-page'
import PlayablesPage from '@/components/playables-page/playables-page'
import VmsPage from '@/components/vms-page/vms-page'
import type { PlutoRoute } from '@/lib/pluto-routes'
import './page-view.css'

export default function PageView({ page }: { page: PlutoRoute }) {
  if (page.id === 'games') {
    return <GamesPage query={page.params.get('q') ?? ''} launchId={page.hash} />
  }

  if (page.id === 'media') {
    return <MediaPage />
  }

  if (page.id === 'cloud-gaming') {
    return <CloudGamingPage />
  }

  if (page.id === 'vms') {
    return <VmsPage autostart={page.params.get('autostart') === '1'} />
  }

  if (page.id === 'apps') {
    return <AppsPage query={page.params.get('q') ?? ''} launchId={page.hash} />
  }

  if (page.id === 'playables') {
    return <PlayablesPage query={page.params.get('q') ?? ''} />
  }

  if (page.id === 'ai') {
    return <AiPage />
  }

  if (page.id === 'ptransfer') {
    return <PTransferPage />
  }

  if (page.id === 'clips') {
    return <ClipsPage />
  }

  return (
    <div className="page-view">
      <h1 className="page-view__title">{page.title}</h1>
    </div>
  )
}
