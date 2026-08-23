const Bookmarks = (() => {
  const LS_KEY = 'plu_bookmarks'

  function load() {
    try { return JSON.parse(localStorage.getItem(LS_KEY)) || [] } catch { return [] }
  }

  function save(list) {
    localStorage.setItem(LS_KEY, JSON.stringify(list))
    if (window.accountManager && typeof window.accountManager.scheduleBookmarkSync === 'function') {
      window.accountManager.scheduleBookmarkSync()
    }
  }

  function getAll() { return load() }

  function find(url) { return load().find(b => b.url === url) }

  function add(bookmark) {
    const list = load().filter(b => b.url !== bookmark.url)
    list.push(bookmark)
    save(list)
  }

  function remove(url) {
    save(load().filter(b => b.url !== url))
  }

  function rename(url, newTitle) {
    save(load().map(b => b.url === url ? { ...b, title: newTitle } : b))
  }

  function isBookmarked(url) { return !!find(url) }

  function getFaviconUrl(url) {
    return `https://www.google.com/s2/favicons?sz=32&domain_url=${encodeURIComponent(url)}`
  }

  function fetchAndCacheFavicon() { return Promise.resolve() }
  function refreshFavicon() { return Promise.resolve() }

  return { getAll, find, add, remove, rename, isBookmarked, getFaviconUrl, fetchAndCacheFavicon, refreshFavicon }
})()