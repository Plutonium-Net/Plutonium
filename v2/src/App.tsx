import AccountPanel from '@/components/account-panel'
import ChromeTabs from '@/components/chrome-tabs/chrome-tabs'
import Clock from '@/components/clock/clock'
import DotBackgroundDemo from '@/components/dot-background-demo'
import PageView from '@/components/page-view/page-view'
import SearchBar from '@/components/search-bar/search-bar'
import { useTabs } from '@/hooks/use-tabs'
import { resolveUrl } from '@/lib/pluto-routes'

export default function App() {
  const { tabs, activeId, addTab, selectTab, closeTab, moveTab, navigate } = useTabs()

  const activeTab = tabs.find((tab) => tab.id === activeId)
  const page = activeTab ? resolveUrl(activeTab.url) : null

  return (
    <>
      <DotBackgroundDemo />
      <div className="relative z-10 px-2 pt-2">
        <ChromeTabs
          tabs={tabs}
          activeId={activeId}
          onSelect={selectTab}
          onAdd={addTab}
          onClose={closeTab}
          onReorder={moveTab}
        />
      </div>
      {page ? <PageView title={page.title} /> : <SearchBar onNavigate={navigate} />}
      <Clock />
      <AccountPanel />
    </>
  )
}
