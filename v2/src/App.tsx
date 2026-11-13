import AccountPanel from '@/components/account-panel'
import ChromeTabs from '@/components/chrome-tabs/chrome-tabs'
import Clock from '@/components/clock/clock'
import DotBackgroundDemo from '@/components/dot-background-demo'
import SearchBar from '@/components/search-bar/search-bar'
import { useTabs } from '@/hooks/use-tabs'

export default function App() {
  const { tabs, activeId, addTab, selectTab, closeTab, moveTab } = useTabs()

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
      <SearchBar />
      <Clock />
      <AccountPanel />
    </>
  )
}
