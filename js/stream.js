/**
 * js/stream.js
 * Streaming feature for Plutonium Network.
 * Uses: TMDB (images + metadata), Videasy (player), PlutoniumStore (auth + cloud).
 */

/* ─────────────────────────────────────────────────────────────────────────
   Constants
───────────────────────────────────────────────────────────────────────── */
const TMDB_API_KEY    = 'f53c43c1f2028398bcebdf4a5d1e28bd';
const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p/w500';
const TMDB_BASE       = 'https://api.themoviedb.org/3';

// Firestore doc names (users/{uid}/<name>)
const FS_FAVORITES = 'stream_favorites';
const FS_CONTINUE  = 'stream_continue';

// TMDB genre maps
const MOVIE_GENRE_MAP = { action:28, comedy:35, drama:18, horror:27, scifi:878, thriller:53, animation:16 };
const TV_GENRE_MAP    = { action:10759, comedy:35, drama:18, scifi:10765, animation:16 };
const ANIME_GENRE_ID  = 16; // Animation genre on TV

const GENRE_ID_TO_CAT = {
  28:'action', 35:'comedy', 18:'drama', 27:'horror', 878:'scifi', 53:'thriller', 16:'animation',
  10759:'action', 10765:'scifi'
};

const MOVIE_CATS = [
  { key:'all', label:'All' }, { key:'action', label:'Action' }, { key:'comedy', label:'Comedy' },
  { key:'drama', label:'Drama' }, { key:'horror', label:'Horror' }, { key:'scifi', label:'Sci-Fi' },
  { key:'thriller', label:'Thriller' }, { key:'animation', label:'Animation' }
];
const TV_CATS = [
  { key:'all', label:'All' }, { key:'action', label:'Action & Adventure' }, { key:'comedy', label:'Comedy' },
  { key:'drama', label:'Drama' }, { key:'scifi', label:'Sci-Fi & Fantasy' }, { key:'animation', label:'Animation' }
];
const ANIME_CATS = [
  { key:'all', label:'All' }, { key:'action', label:'Action' }, { key:'comedy', label:'Comedy' },
  { key:'drama', label:'Drama' }, { key:'scifi', label:'Sci-Fi' }
];

const ADULT_CERTS = new Set(['NC-17','TV-MA','R18+','X','XXX','18','18A','MA','MA 15+','MA 18+','18+']);

/* ─────────────────────────────────────────────────────────────────────────
   State
───────────────────────────────────────────────────────────────────────── */
let favoritesCache        = {};
let continueWatchingCache = {};

let allItems        = [];
let currentCategory = 'all';
let isLoading       = false;
let currentPage     = 1;
let hasMore         = true;
let isSearchMode    = false;
let mediaType       = 'movie';  // 'movie' | 'tv' | 'anime'

let showAdultContent = false;
let ageRatingFilter  = 'all';
let currentSpecialView = null;  // 'favorites' | 'continue' | null

let currentDetailItem     = null;
let pendingAdultItem      = null;
let currentTVShow         = null;
let currentPlayerItem     = null;
let detailDropdownState   = { seasonOptions:[], episodeOptions:[], season:null, episode:null };
let playerState           = { season:1, episode:1 };

let tvSeasonData  = {};   // { [showId]: { seasons, episodesBySeason } }
let detailCache   = {};
const cacheKeys   = [];
const MAX_CACHE   = 200;
const renderedIds = new Set();

let searchTimeout = null;
let toastTimeout  = null;
let fbToastTimeout = null;

// Progress tracking
let _progressTimer    = null;
let _progressElapsed  = 0;
let _progressRuntime  = 0;
let _progressLastSave = 0;
let _progressSaveTimer = null;
let _progressPending   = null;

/* ─────────────────────────────────────────────────────────────────────────
   DOM refs
───────────────────────────────────────────────────────────────────────── */
const tagsBar         = document.getElementById('tags-bar');
const searchInput     = document.getElementById('game-search');
const adultToggle     = document.getElementById('adult-toggle');
const adultToggleText = document.getElementById('adult-toggle-text');
const sentinel        = document.getElementById('scroll-sentinel');

/* ─────────────────────────────────────────────────────────────────────────
   PlutoniumStore helpers — favorites & continue watching
───────────────────────────────────────────────────────────────────────── */

async function loadFavorites() {
  try {
    const doc = await PlutoniumStore.getDoc(FS_FAVORITES).catch(() => null);
    favoritesCache = doc ? (doc.items || {}) : {};
  } catch(e) { console.warn('loadFavorites', e); }
}

async function saveFavorites() {
  if (!PlutoniumStore.currentUser) return;
  try {
    await PlutoniumStore.setDoc(FS_FAVORITES, { items: favoritesCache });
  } catch(e) { console.warn('saveFavorites', e); }
}

async function loadContinueWatching() {
  try {
    const doc = await PlutoniumStore.getDoc(FS_CONTINUE).catch(() => null);
    continueWatchingCache = doc ? (doc.items || {}) : {};
  } catch(e) { console.warn('loadContinueWatching', e); }
}

async function saveContinueWatching(item, season, episode, progressPct = null, timestamp = null) {
  if (!PlutoniumStore.currentUser) return;
  const existing = continueWatchingCache[item.id];
  continueWatchingCache[item.id] = {
    id: item.id, name: item.name, type: item.type, year: item.year,
    rating: item.rating, poster_path: item.poster_path || '',
    overview: item.overview || '', adult: item.adult || false,
    ageRating: item.ageRating || 'NR', genre_ids: item.genre_ids || [],
    season: season || null, episode: episode || null,
    progressPct: progressPct !== null ? progressPct : (existing?.progressPct ?? 0),
    timestamp:   timestamp   !== null ? timestamp   : (existing?.timestamp   ?? 0),
    runtime:     _progressRuntime > 0 ? _progressRuntime : (existing?.runtime ?? 0),
    ts: Date.now()
  };
  renderContinueWatchingRow();
  try {
    await PlutoniumStore.setDoc(FS_CONTINUE, { items: continueWatchingCache });
  } catch(e) { console.warn('saveContinueWatching', e); }
}

function scheduleProgressSave(item, season, episode, progressPct, timestamp) {
  _progressPending = { item, season, episode, progressPct, timestamp };
  if (_progressSaveTimer) return;
  _progressSaveTimer = setTimeout(() => {
    _progressSaveTimer = null;
    if (_progressPending) {
      const p = _progressPending; _progressPending = null;
      saveContinueWatching(p.item, p.season, p.episode, p.progressPct, p.timestamp);
    }
  }, 10000);
}

function flushProgressSave() {
  clearTimeout(_progressSaveTimer);
  _progressSaveTimer = null;
  if (_progressPending) {
    const p = _progressPending; _progressPending = null;
    saveContinueWatching(p.item, p.season, p.episode, p.progressPct, p.timestamp);
  }
}

async function removeContinueWatching(id) {
  if (!PlutoniumStore.currentUser) return;
  delete continueWatchingCache[id];
  renderContinueWatchingRow();
  try {
    await PlutoniumStore.setDoc(FS_CONTINUE, { items: continueWatchingCache });
  } catch(e) { console.warn('removeContinueWatching', e); }
  if (currentSpecialView === 'continue') renderContinueGrid();
}

async function toggleFavorite(item) {
  if (!PlutoniumStore.currentUser) {
    showFirebaseToast('Sign in to save favourites', 'remove');
    return;
  }
  if (favoritesCache[item.id]) {
    delete favoritesCache[item.id];
    showFirebaseToast('Removed from Favourites', 'remove');
  } else {
    favoritesCache[item.id] = {
      id: item.id, name: item.name, type: item.type, year: item.year,
      rating: item.rating, poster_path: item.poster_path || '',
      overview: item.overview || '', adult: item.adult || false,
      ageRating: item.ageRating || 'NR', genre_ids: item.genre_ids || [],
      ts: Date.now()
    };
    showFirebaseToast('Added to Favourites', 'add');
  }
  rerenderCardOverlays();
  if (currentSpecialView === 'favorites') renderFavoritesGrid();
  else renderFavoritesRow();
  await saveFavorites();
}

/* ─────────────────────────────────────────────────────────────────────────
   Toasts
───────────────────────────────────────────────────────────────────────── */

function showFirebaseToast(msg, type) {
  const el   = document.getElementById('fb-toast');
  const icon = document.getElementById('fb-toast-icon');
  const text = document.getElementById('fb-toast-text');
  if (!el) return;
  clearTimeout(fbToastTimeout);
  icon.className = type === 'add' ? 'fas fa-heart' : 'fas fa-heart-crack';
  text.textContent = msg;
  el.classList.add('visible');
  fbToastTimeout = setTimeout(() => el.classList.remove('visible'), 2800);
}

function dismissToast() {
  document.getElementById('section-toast').classList.remove('visible');
  clearTimeout(toastTimeout);
}

function showSectionToast(query, suggestedType) {
  const t = document.getElementById('section-toast');
  const isTV = suggestedType === 'tv' || suggestedType === 'anime';
  document.getElementById('toast-title').textContent = 'Wrong section?';
  document.getElementById('toast-msg').textContent =
    `"${query}" looks like a ${isTV ? 'TV show' : 'film'}. You're in the ${isTV ? 'Films' : 'TV Shows'} section.`;
  const switchBtn = document.getElementById('toast-switch');
  switchBtn.textContent = `Switch to ${isTV ? 'TV Shows' : 'Films'}`;
  switchBtn.onclick = () => {
    dismissToast();
    document.querySelector(`.media-tab[data-type="${suggestedType}"]`).click();
  };
  clearTimeout(toastTimeout);
  t.classList.add('visible');
  toastTimeout = setTimeout(dismissToast, 7000);
}

/* ─────────────────────────────────────────────────────────────────────────
   TMDB helpers
───────────────────────────────────────────────────────────────────────── */

function tmdb(path) {
  const sep = path.includes('?') ? '&' : '?';
  return fetch(`${TMDB_BASE}${path}${sep}api_key=${TMDB_API_KEY}`).then(r => r.json());
}

function formatItem(m, type) {
  const isTV = type === 'tv' || type === 'anime';
  return {
    id:          m.id.toString(),
    name:        isTV ? (m.name || m.original_name) : (m.title || m.original_title),
    category:    getCategoryFromGenres(m.genre_ids),
    year:        isTV ? (m.first_air_date || '').substring(0,4) || 'N/A'
                      : (m.release_date  || '').substring(0,4) || 'N/A',
    rating:      m.vote_average ? m.vote_average.toFixed(1) : 'N/A',
    poster_path: m.poster_path,
    genre_ids:   m.genre_ids || [],
    overview:    m.overview || '',
    adult:       Boolean(m.adult),
    type,
    origin_country: m.origin_country || []
  };
}

function getCategoryFromGenres(ids) {
  if (!ids || !ids.length) return '';
  for (const id of ids) if (GENRE_ID_TO_CAT[id]) return GENRE_ID_TO_CAT[id];
  return '';
}

function getMovieAgeRating(detail) {
  const regions = detail.release_dates?.results || [];
  for (const code of ['US','CA','GB','AU']) {
    const region = regions.find(r => r.iso_3166_1 === code);
    const cert = (region?.release_dates || []).map(r => r.certification).find(Boolean);
    if (cert) return cert;
  }
  return regions.flatMap(r => r.release_dates || []).map(r => r.certification).find(Boolean) || 'NR';
}

function getTVAgeRating(detail) {
  const ratings = detail.content_ratings?.results || [];
  for (const code of ['US','CA','GB','AU']) {
    const region = ratings.find(r => r.iso_3166_1 === code);
    if (region?.rating) return region.rating;
  }
  return ratings.map(r => r.rating).find(Boolean) || 'NR';
}

function isAdultCert(r) {
  return ADULT_CERTS.has((r || '').toUpperCase().trim());
}

function normalizeRating(r) {
  const u = (r || '').toUpperCase().trim();
  if (['NC-17','TV-MA','R18+','X','XXX','18','18A','MA','18+','MA 15+','MA 18+'].includes(u)) return 'MA18';
  if (['R','TV-14'].includes(u)) return 'R';
  if (['PG-13'].includes(u)) return 'PG13';
  if (['PG','TV-PG'].includes(u)) return 'PG';
  if (['G','TV-G','TV-Y','TV-Y7'].includes(u)) return 'G';
  return 'NR';
}

function cacheSet(key, val) {
  if (cacheKeys.length >= MAX_CACHE) delete detailCache[cacheKeys.shift()];
  if (!detailCache[key]) cacheKeys.push(key);
  detailCache[key] = val;
}

async function fetchItemDetails(item) {
  const key = `${item.type}:${item.id}`;
  if (detailCache[key]) return detailCache[key];
  const isTV = item.type === 'tv' || item.type === 'anime';
  const endpoint = isTV
    ? `/tv/${item.id}?append_to_response=content_ratings`
    : `/movie/${item.id}?append_to_response=release_dates`;
  const detail = await tmdb(endpoint);
  const ageRating = isTV ? getTVAgeRating(detail) : getMovieAgeRating(detail);
  const normalized = {
    ...item,
    name: isTV ? (detail.name || detail.original_name || item.name)
               : (detail.title || detail.original_title || item.name),
    year: isTV ? ((detail.first_air_date || '').substring(0,4) || item.year || 'N/A')
               : ((detail.release_date   || '').substring(0,4) || item.year || 'N/A'),
    rating:   detail.vote_average ? detail.vote_average.toFixed(1) : (item.rating || 'N/A'),
    overview: detail.overview || item.overview || 'No description available yet.',
    poster_path: detail.poster_path || item.poster_path || '',
    ageRating,
    adult: Boolean(detail.adult || item.adult || isAdultCert(ageRating)),
    type: item.type
  };
  if (isTV) {
    const seasons = (detail.seasons || []).filter(s => s.season_number > 0 && s.episode_count > 0);
    tvSeasonData[item.id] = {
      seasons,
      episodesBySeason: tvSeasonData[item.id]?.episodesBySeason || {}
    };
  }
  cacheSet(key, normalized);
  return normalized;
}

async function tagItemRatings(items, concurrency = 5) {
  for (let i = 0; i < items.length; i += concurrency) {
    await Promise.all(items.slice(i, i + concurrency).map(async item => {
      const key = `${item.type}:${item.id}`;
      if (detailCache[key]?.ageRating) {
        item.ageRating = detailCache[key].ageRating;
        item.adult     = detailCache[key].adult;
        return;
      }
      try {
        const isTV = item.type === 'tv' || item.type === 'anime';
        const url = isTV
          ? `/tv/${item.id}?append_to_response=content_ratings`
          : `/movie/${item.id}?append_to_response=release_dates`;
        const d = await tmdb(url);
        const rating = isTV ? getTVAgeRating(d) : getMovieAgeRating(d);
        item.ageRating = rating;
        item.adult     = Boolean(d.adult) || isAdultCert(rating);
        if (isTV && !tvSeasonData[item.id]) {
          tvSeasonData[item.id] = {
            seasons: (d.seasons || []).filter(s => s.season_number > 0 && s.episode_count > 0),
            episodesBySeason: {}
          };
        }
        cacheSet(key, { ...item });
      } catch(e) {}
    }));
  }
  return items;
}

async function fetchTVDetails(showId) {
  if (tvSeasonData[showId]?.seasons?.length) return tvSeasonData[showId];
  await fetchItemDetails({ id: showId.toString(), type: 'tv', name: '', year: 'N/A',
    rating: 'N/A', poster_path: '', overview: '', adult: false });
  return tvSeasonData[showId];
}

async function fetchEpisodes(showId, seasonNumber) {
  const cache = tvSeasonData[showId];
  if (cache?.episodesBySeason[seasonNumber]) return cache.episodesBySeason[seasonNumber];
  const d = await tmdb(`/tv/${showId}/season/${seasonNumber}`);
  const eps = (d.episodes || []).map(e => ({ number: e.episode_number, name: e.name }));
  if (cache) cache.episodesBySeason[seasonNumber] = eps;
  return eps;
}

/* ─────────────────────────────────────────────────────────────────────────
   Content loading
───────────────────────────────────────────────────────────────────────── */

function getVisibleItems(items) {
  let out = showAdultContent ? items : items.filter(i => !i.adult);
  if (ageRatingFilter && ageRatingFilter !== 'all') {
    const filter = ageRatingFilter.toUpperCase().replace('-','');
    out = out.filter(i => normalizeRating(i.ageRating) === filter ||
      (filter === 'MA' && normalizeRating(i.ageRating) === 'MA18'));
  }
  return out;
}

async function loadContent(append = false) {
  if (isLoading || (!hasMore && append)) return;
  isLoading = true;
  updateScrollSpinner();
  if (!append) {
    showSkeletons();
    currentPage = 1;
    allItems    = [];
    hasMore     = true;
    renderedIds.clear();
  }
  try {
    const start = append ? currentPage : 1;
    const end   = start + 1;

    let pages;

    if (mediaType === 'anime') {
      // Anime: TV discover with genre=animation + origin_country=JP
      const pageNums = Array.from({ length: end - start + 1 }, (_, i) => start + i);
      pages = await Promise.all(pageNums.map(p =>
        tmdb(`/discover/tv?with_genres=${ANIME_GENRE_ID}&with_original_language=ja&sort_by=popularity.desc&page=${p}`)
      ));
    } else if (mediaType === 'tv') {
      const gmap = TV_GENRE_MAP;
      if (currentCategory === 'all') {
        pages = await Promise.all(
          Array.from({ length: end - start + 1 }, (_, i) =>
            tmdb(`/tv/popular?page=${start + i}`)
          )
        );
      } else {
        const gid = gmap[currentCategory];
        pages = await Promise.all(
          Array.from({ length: end - start + 1 }, (_, i) =>
            tmdb(`/discover/tv?with_genres=${gid}&sort_by=popularity.desc&page=${start + i}`)
          )
        );
      }
    } else {
      // movie
      const gmap = MOVIE_GENRE_MAP;
      if (currentCategory === 'all') {
        pages = await Promise.all(
          Array.from({ length: end - start + 1 }, (_, i) =>
            tmdb(`/movie/popular?page=${start + i}`)
          )
        );
      } else {
        const gid = gmap[currentCategory];
        pages = await Promise.all(
          Array.from({ length: end - start + 1 }, (_, i) =>
            tmdb(`/discover/movie?with_genres=${gid}&sort_by=popularity.desc&page=${start + i}`)
          )
        );
      }
    }

    let type = mediaType === 'anime' ? 'anime' : mediaType;
    // For anime items, set type='anime' but use TV tmdb id
    let items = pages.flatMap(d => (d.results || [])).map(m => formatItem(m, type));
    items = await tagItemRatings(items);

    if (!items.length) {
      hasMore = false;
    } else {
      if (append) {
        allItems = [...allItems, ...items];
        renderItems(getVisibleItems(allItems), true);
      } else {
        allItems = items;
        renderItems(getVisibleItems(allItems));
      }
      currentPage = end + 1;
    }
  } catch(e) {
    console.error(e);
    document.getElementById('games-container').innerHTML =
      '<div class="no-results" style="display:block"><i class="fas fa-exclamation-circle"></i><p>Could not load content.</p></div>';
  } finally {
    isLoading = false;
    updateScrollSpinner();
  }
}

async function searchTMDB(query, options = {}) {
  if (!options.skipUrlSync) syncUrlState();
  dismissToast();
  if (!query.trim()) {
    if (!options.preserveSearchState) isSearchMode = false;
    await loadContent();
    return;
  }
  isSearchMode = true;
  hasMore = false;
  updateScrollSpinner();
  showSkeletons(10);
  try {
    let searchType;
    if (mediaType === 'anime') searchType = 'tv';
    else searchType = mediaType;

    const [r] = await Promise.all([
      tmdb(`/search/${searchType}?query=${encodeURIComponent(query)}`),
      checkWrongSection(query)
    ]);
    let items = (r.results || []).map(m => formatItem(m, mediaType));
    if (mediaType === 'anime') {
      // Filter to Japanese animation
      items = items.filter(i => (i.genre_ids || []).includes(ANIME_GENRE_ID));
    }
    items = await tagItemRatings(items);
    allItems = items;
    renderItems(getVisibleItems(allItems));
  } catch(e) {
    allItems = [];
    renderItems([]);
  }
}

async function checkWrongSection(query) {
  try {
    const [movieRes, tvRes] = await Promise.all([
      tmdb(`/search/movie?query=${encodeURIComponent(query)}`),
      tmdb(`/search/tv?query=${encodeURIComponent(query)}`)
    ]);
    const mr = movieRes.results || [], tr = tvRes.results || [];
    if (!mr.length && !tr.length) return;
    const ms = mr.length ? (mr[0].popularity||0) + (mr[0].vote_count||0)*0.01 : 0;
    const ts = tr.length ? (tr[0].popularity||0) + (tr[0].vote_count||0)*0.01 : 0;
    if (mediaType === 'movie' && ts > ms * 2 && tr.length) showSectionToast(query, 'tv');
    else if (mediaType !== 'movie' && ms > ts * 2 && mr.length) showSectionToast(query, 'movie');
    else dismissToast();
  } catch(e) {}
}

async function refreshCurrentView() {
  const q = getCurrentQuery();
  syncUrlState();
  if (q) { await searchTMDB(q, { preserveSearchState:true }); return; }
  isSearchMode = false;
  await loadContent();
}

/* ─────────────────────────────────────────────────────────────────────────
   Rendering
───────────────────────────────────────────────────────────────────────── */

function showSkeletons(n = 20) {
  const c  = document.getElementById('games-container');
  const nr = document.getElementById('no-results');
  if (nr.parentNode) nr.remove();
  c.innerHTML = '';
  c.appendChild(nr);
  for (let i = 0; i < n; i++) {
    const s = document.createElement('div');
    s.className = 'skeleton';
    c.appendChild(s);
  }
}

function updateCount(n) {
  if (currentSpecialView) return;
  const suffix = mediaType === 'tv' ? ' shows' : mediaType === 'anime' ? ' anime' : ' films';
  document.getElementById('count-badge').textContent = n > 0 ? n + suffix : '';
}

function renderItems(items, append = false) {
  const container = document.getElementById('games-container');
  const noResults = document.getElementById('no-results');
  if (!append) {
    if (noResults.parentNode) noResults.remove();
    container.innerHTML = '';
    container.appendChild(noResults);
    renderedIds.clear();
  }
  if (!items.length && !append) {
    noResults.style.display = 'block';
    updateCount(0);
    updateScrollSpinner();
    return;
  }
  noResults.style.display = 'none';
  updateCount(items.length);
  let delay = 0;
  items.forEach(item => {
    if (append && renderedIds.has(item.id)) return;
    renderedIds.add(item.id);
    const poster = item.poster_path
      ? `${TMDB_IMAGE_BASE}${item.poster_path}`
      : `https://via.placeholder.com/500x750/0d1018/333?text=${encodeURIComponent(item.name || '?')}`;
    const isFav = !!favoritesCache[item.id];
    const ageKey = normalizeRating(item.ageRating || '');
    const ageBadge = ageKey && ageKey !== 'NR'
      ? `<div class="age-badge age-badge-${ageKey.toLowerCase()}">${ageKey === 'MA18' ? 'MA/18+' : ageKey}</div>`
      : '';
    const typeBadge = item.type === 'anime'
      ? '<div class="anime-badge">ANIME</div>'
      : item.type === 'tv'
        ? '<div class="tv-badge">TV</div>'
        : '';

    const card = document.createElement('div');
    card.className = 'game-box';
    card.dataset.id   = item.id;
    card.dataset.type = item.type;
    card.style.animationDelay = Math.min(delay * 22, 380) + 'ms';
    delay++;
    card.innerHTML = `
      <img src="${poster}" alt="${item.name}" loading="lazy"
           onerror="this.src='https://via.placeholder.com/500x750/0d1018/333?text=No+Image'" />
      <div class="movie-rating"><i class="fas fa-star"></i>${item.rating}</div>
      ${typeBadge}
      ${ageBadge}
      <button class="card-heart${isFav ? ' active' : ''}" title="Favourite">
        <i class="fas fa-heart"></i>
      </button>
      <div class="play-overlay"><div class="play-circle"><i class="fas fa-play"></i></div></div>
      <div class="game-info">
        <div class="game-title">${item.name}</div>
        <div class="movie-year">${item.year}</div>
      </div>`;
    card.querySelector('.card-heart').addEventListener('click', async e => {
      e.stopPropagation();
      const full = await fetchItemDetails(item).catch(() => item);
      await toggleFavorite(full || item);
    });
    card.addEventListener('click', () => openDetails(item));
    container.appendChild(card);
  });
  updateScrollSpinner();
}

function updateScrollSpinner() {
  const spinner = document.getElementById('scroll-spinner');
  if (isSearchMode || !hasMore) { spinner.classList.remove('visible'); return; }
  if (isLoading) spinner.classList.add('visible');
  else spinner.classList.remove('visible');
}

function rerenderCardOverlays() {
  document.querySelectorAll('.game-box').forEach(card => {
    const btn = card.querySelector('.card-heart');
    if (btn) btn.classList.toggle('active', !!favoritesCache[card.dataset.id]);
  });
}

/* ─────────────────────────────────────────────────────────────────────────
   Shelves
───────────────────────────────────────────────────────────────────────── */

function sortByTs(items) {
  return items.sort((a, b) => (b.ts || 0) - (a.ts || 0));
}

function buildShelfCard(item, opts = {}) {
  const poster = item.poster_path
    ? `${TMDB_IMAGE_BASE}${item.poster_path}`
    : `https://via.placeholder.com/500x750/0d1018/333?text=${encodeURIComponent(item.name || '?')}`;
  const epLabel = item.type !== 'movie' && item.season
    ? `<span class="shelf-ep">S${item.season} E${item.episode || 1}</span>` : '';
  const removeIcon = opts.heart ? 'fas fa-heart' : 'fas fa-xmark';
  const pct = item.progressPct || 0;
  const progressBar = pct > 0
    ? `<div class="shelf-progress-track"><div class="shelf-progress-fill" style="width:${pct}%"></div></div>`
    : '';

  const card = document.createElement('div');
  card.className   = 'shelf-card';
  card.dataset.id  = item.id;
  card.innerHTML   = `
    <div class="shelf-img-wrap">
      <img src="${poster}" alt="${item.name}" loading="lazy" />
      <div class="shelf-play"><i class="fas fa-play"></i></div>
      <button class="shelf-remove${opts.heart ? ' fav-remove' : ''}" title="${opts.heart ? 'Unfavourite' : 'Remove'}">
        <i class="${removeIcon}"></i>
      </button>
      ${epLabel}
      ${progressBar}
    </div>
    <div class="shelf-title">${item.name}</div>`;
  return card;
}

function renderContinueWatchingRow() {
  const section = document.getElementById('continue-watching-section');
  if (!section || currentSpecialView) return;
  const items = sortByTs(Object.values(continueWatchingCache)).slice(0, 12);
  if (!items.length) { section.style.display = 'none'; return; }
  section.style.display = 'block';
  const row    = document.getElementById('continue-row');
  const newIds = new Set(items.map(i => i.id));

  row.querySelectorAll('.shelf-card').forEach(c => { if (!newIds.has(c.dataset.id)) c.remove(); });

  items.forEach((item, idx) => {
    const existing = row.querySelector(`.shelf-card[data-id="${item.id}"]`);
    if (existing) {
      // Update progress bar
      const fill = existing.querySelector('.shelf-progress-fill');
      if (fill && item.progressPct) fill.style.width = item.progressPct + '%';
      const cards = [...row.children];
      if (cards.indexOf(existing) !== idx) row.insertBefore(existing, cards[idx] || null);
      return;
    }
    const card = buildShelfCard(item, { heart: false });
    card.querySelector('.shelf-img-wrap').addEventListener('click', async e => {
      if (e.target.closest('.shelf-remove')) return;
      const opts = item.type !== 'movie' ? { season: item.season || 1, episode: item.episode || 1 } : {};
      const full = await fetchItemDetails(item).catch(() => item);
      await openPlayer(full || item, opts);
    });
    card.querySelector('.shelf-remove').addEventListener('click', e => {
      e.stopPropagation();
      removeContinueWatching(item.id);
    });
    const cards = [...row.children];
    row.insertBefore(card, cards[idx] || null);
  });
}

function renderFavoritesRow() {
  const section = document.getElementById('favorites-section');
  if (!section || currentSpecialView) return;
  const items = sortByTs(Object.values(favoritesCache)).slice(0, 12);
  if (!items.length) { section.style.display = 'none'; return; }
  section.style.display = 'block';
  const row = document.getElementById('favorites-row');
  row.innerHTML = '';
  items.forEach(item => {
    const card = buildShelfCard(item, { heart: true });
    card.querySelector('.shelf-img-wrap').addEventListener('click', async e => {
      if (e.target.closest('.shelf-remove')) return;
      const full = await fetchItemDetails(item).catch(() => item);
      await openDetails(full || item);
    });
    card.querySelector('.shelf-remove').addEventListener('click', async e => {
      e.stopPropagation();
      await toggleFavorite(item);
    });
    row.appendChild(card);
  });
}

/* ─────────────────────────────────────────────────────────────────────────
   Special views (see all)
───────────────────────────────────────────────────────────────────────── */

function enterSpecialView(type) {
  currentSpecialView = type;
  document.querySelector('.media-tabs').style.display       = 'none';
  document.querySelector('.stream-hero').style.display      = 'none';
  document.querySelector('.tags-section').style.display     = 'none';
  document.getElementById('scroll-sentinel').style.display  = 'none';
  document.getElementById('continue-watching-section').style.display = 'none';
  document.getElementById('favorites-section').style.display          = 'none';
  document.getElementById('special-view-back').style.display = 'flex';
  scrollObserver.unobserve(sentinel);
  if (type === 'favorites') renderFavoritesGrid();
  else if (type === 'continue') renderContinueGrid();
}

function exitSpecialView() {
  currentSpecialView = null;
  document.querySelector('.media-tabs').style.display       = '';
  document.querySelector('.stream-hero').style.display      = '';
  document.querySelector('.tags-section').style.display     = '';
  document.getElementById('scroll-sentinel').style.display  = '';
  document.getElementById('special-view-back').style.display = 'none';
  scrollObserver.observe(sentinel);
  renderContinueWatchingRow();
  renderFavoritesRow();
  refreshCurrentView();
}

function renderFavoritesGrid() {
  const items = sortByTs(Object.values(favoritesCache));
  document.getElementById('section-label').textContent = 'My Favourites';
  document.getElementById('count-badge').textContent   = items.length ? items.length + ' saved' : '';
  renderItems(items);
  if (!items.length) {
    const nr = document.getElementById('no-results');
    nr.style.display = 'block';
    nr.querySelector('i').className = 'fas fa-heart';
    nr.querySelector('p').textContent = 'No favourites yet — heart a title to save it here';
  }
}

function renderContinueGrid() {
  const items = sortByTs(Object.values(continueWatchingCache));
  document.getElementById('section-label').textContent = 'Continue Watching';
  document.getElementById('count-badge').textContent   = items.length ? items.length + ' titles' : '';
  renderItems(items);
  if (!items.length) {
    const nr = document.getElementById('no-results');
    nr.style.display = 'block';
    nr.querySelector('i').className = 'fas fa-play-circle';
    nr.querySelector('p').textContent = 'Nothing to continue yet — start watching something!';
  }
}

/* ─────────────────────────────────────────────────────────────────────────
   Tags / genre bar
───────────────────────────────────────────────────────────────────────── */

function buildTags(cats) {
  tagsBar.innerHTML = '';
  cats.forEach(c => {
    const t = document.createElement('button');
    t.className     = 'tag' + (c.key === 'all' ? ' active' : '');
    t.textContent   = c.label;
    t.dataset.category = c.key;
    t.addEventListener('click', async () => {
      if (currentSpecialView) exitSpecialView();
      document.querySelectorAll('.tag').forEach(b => b.classList.remove('active'));
      t.classList.add('active');
      currentCategory = c.key;
      searchInput.value = '';
      isSearchMode = false;
      syncUrlState();
      await loadContent();
    });
    tagsBar.appendChild(t);
  });
}

/* ─────────────────────────────────────────────────────────────────────────
   Media type tabs
───────────────────────────────────────────────────────────────────────── */

function applyMediaTypeUI() {
  document.querySelectorAll('.media-tab').forEach(t => t.classList.toggle('active', t.dataset.type === mediaType));
  currentCategory = 'all';
  if (mediaType === 'movie') {
    document.getElementById('hero-title').innerHTML  = 'Watch <em>Cinema</em>';
    document.getElementById('hero-sub').textContent  = 'Thousands of films, instantly';
    document.getElementById('section-label').textContent = 'Popular Films';
    buildTags(MOVIE_CATS);
  } else if (mediaType === 'tv') {
    document.getElementById('hero-title').innerHTML  = 'Watch <em>Television</em>';
    document.getElementById('hero-sub').textContent  = 'Thousands of series, instantly';
    document.getElementById('section-label').textContent = 'Popular TV Shows';
    buildTags(TV_CATS);
  } else {
    document.getElementById('hero-title').innerHTML  = 'Watch <em>Anime</em>';
    document.getElementById('hero-sub').textContent  = 'The best anime, all in one place';
    document.getElementById('section-label').textContent = 'Popular Anime';
    buildTags(ANIME_CATS);
  }
}

document.querySelectorAll('.media-tab').forEach(tab => {
  tab.addEventListener('click', async () => {
    if (currentSpecialView) exitSpecialView();
    const q = getCurrentQuery();
    mediaType = tab.dataset.type;
    applyMediaTypeUI();
    hasMore = true;
    currentPage = 1;
    syncUrlState();
    if (q) { isSearchMode = true; await searchTMDB(q, { preserveSearchState:true }); }
    else   { isSearchMode = false; await loadContent(); }
  });
});

/* ─────────────────────────────────────────────────────────────────────────
   URL state
───────────────────────────────────────────────────────────────────────── */

function syncUrlState() {
  const params = new URLSearchParams(window.location.search);
  const typeMap = { movie:'m', tv:'t', anime:'a' };
  params.set('category', typeMap[mediaType] || 'm');
  const q = getCurrentQuery();
  if (q) params.set('search', q); else params.delete('search');
  window.history.replaceState({}, '', window.location.pathname + '?' + params.toString());
}

function getCurrentQuery() { return searchInput.value.trim(); }

async function initializeFromUrl() {
  const params   = new URLSearchParams(window.location.search);
  const category = params.get('category');
  const q        = params.get('search') || '';
  if (category === 't') mediaType = 'tv';
  else if (category === 'a') mediaType = 'anime';
  else mediaType = 'movie';
  applyMediaTypeUI();
  searchInput.value = q;
  if (q) { isSearchMode = true; await searchTMDB(q, { preserveSearchState:true }); }
  else   { isSearchMode = false; await loadContent(); }
}

/* ─────────────────────────────────────────────────────────────────────────
   Details modal
───────────────────────────────────────────────────────────────────────── */

function updateBodyScrollLock() {
  const locked =
    document.getElementById('player').classList.contains('open') ||
    document.getElementById('details-modal').classList.contains('open') ||
    document.getElementById('adult-gate').classList.contains('open');
  document.body.style.overflow = locked ? 'hidden' : '';
}

function syncDetailsBackdrop() {
  const open =
    document.getElementById('details-modal').classList.contains('open') ||
    document.getElementById('adult-gate').classList.contains('open');
  document.getElementById('details-backdrop').classList.toggle('open', open);
  updateBodyScrollLock();
}

function closeOverlayStack() {
  if (document.getElementById('adult-gate').classList.contains('open')) { denyAdultGate(); return; }
  closeDetailsModal();
}
window.closeOverlayStack = closeOverlayStack;

function closeDetailsModal() {
  document.getElementById('details-modal').classList.remove('open');
  currentDetailItem = null;
  closeDetailDropdowns();
  syncDetailsBackdrop();
}
window.closeDetailsModal = closeDetailsModal;

function openAdultGate()  { document.getElementById('adult-gate').classList.add('open');    syncDetailsBackdrop(); }
function closeAdultGate() { document.getElementById('adult-gate').classList.remove('open'); syncDetailsBackdrop(); }

function denyAdultGate() { pendingAdultItem = null; closeAdultGate(); closeDetailsModal(); }
window.denyAdultGate = denyAdultGate;

function confirmAdultGate() {
  showAdultContent = true;
  adultToggle.classList.add('active');
  adultToggle.setAttribute('aria-pressed', 'true');
  adultToggleText.textContent = 'On';
  const item = pendingAdultItem; pendingAdultItem = null;
  closeAdultGate();
  if (item) showDetailsModal(item);
}
window.confirmAdultGate = confirmAdultGate;

async function showDetailsModal(item) {
  currentDetailItem = item;
  const poster = item.poster_path
    ? `${TMDB_IMAGE_BASE}${item.poster_path}`
    : `https://via.placeholder.com/500x750/0d1018/333?text=${encodeURIComponent(item.name || '?')}`;
  document.getElementById('details-poster').src         = poster;
  document.getElementById('details-poster').alt         = item.name;
  document.getElementById('details-title').textContent  = item.name;
  const typeLabel = item.type === 'anime' ? 'Anime' : item.type === 'tv' ? 'TV Show' : 'Film';
  document.getElementById('details-subtitle').textContent = `${typeLabel}${item.year ? ' • ' + item.year : ''}`;
  document.getElementById('details-type-chip').textContent = typeLabel;
  document.getElementById('details-rating').textContent    = item.rating || 'N/A';
  document.getElementById('details-age-rating').textContent = item.ageRating || 'NR';
  document.getElementById('details-overview').textContent   = item.overview || 'No description available yet.';

  const favBtn = document.getElementById('details-fav-btn');
  const syncFavBtn = () => {
    const isFav = !!favoritesCache[item.id];
    favBtn.innerHTML = isFav
      ? '<i class="fas fa-heart"></i> Favourited'
      : '<i class="far fa-heart"></i> Favourite';
    favBtn.classList.toggle('active', isFav);
  };
  syncFavBtn();
  favBtn.onclick = async () => { await toggleFavorite(item); syncFavBtn(); };

  const tvControls = document.getElementById('details-tv-controls');
  if (item.type === 'tv' || item.type === 'anime') {
    tvControls.classList.add('visible');
    const details  = await fetchTVDetails(item.id);
    const seasons  = details?.seasons || [];
    const cw       = continueWatchingCache[item.id];
    const initSeason = cw?.season || seasons.find(s => s.season_number === 1)?.season_number || seasons[0]?.season_number || 1;
    await populateDetailSeasonDropdown(seasons, initSeason);
    if (cw) await populateDetailEpisodeDropdown(item.id, initSeason, cw.episode || 1);
  } else {
    tvControls.classList.remove('visible');
    setDetailDropdownOptions('season', [], null);
    setDetailDropdownOptions('episode', [], null);
  }
  document.getElementById('details-modal').classList.add('open');
  syncDetailsBackdrop();
}

async function openDetails(item) {
  try {
    const detail = await fetchItemDetails(item);
    if (detail.adult && !showAdultContent) { pendingAdultItem = detail; openAdultGate(); return; }
    await showDetailsModal(detail);
  } catch(e) {
    console.error(e);
    await showDetailsModal({ ...item, overview: item.overview || 'No description available yet.', ageRating: 'NR' });
  }
}

/* ─────────────────────────────────────────────────────────────────────────
   Detail dropdowns (season/episode)
───────────────────────────────────────────────────────────────────────── */

function closeDetailDropdowns() {
  document.querySelectorAll('.detail-dropdown').forEach(d => d.classList.remove('open'));
}

function toggleDetailDropdown(kind) {
  const dropdown = document.getElementById(`detail-${kind}-dropdown`);
  if (!dropdown || dropdown.classList.contains('disabled')) return;
  const isOpen = dropdown.classList.contains('open');
  closeDetailDropdowns();
  if (!isOpen) dropdown.classList.add('open');
}
window.toggleDetailDropdown = toggleDetailDropdown;

function setDetailDropdownOptions(kind, options, selectedValue) {
  detailDropdownState[`${kind}Options`] = options;
  detailDropdownState[kind] = selectedValue;
  const dropdown = document.getElementById(`detail-${kind}-dropdown`);
  const label    = document.getElementById(`detail-${kind}-value`);
  const menu     = document.getElementById(`detail-${kind}-menu`);
  const selected = options.find(o => o.value === selectedValue) || options[0];
  dropdown.classList.toggle('disabled', options.length === 0);
  label.textContent = selected ? selected.label : `Select ${kind}`;
  menu.innerHTML = '';
  options.forEach(option => {
    const btn = document.createElement('button');
    btn.type      = 'button';
    btn.className = 'detail-option' + (option.value === selectedValue ? ' active' : '');
    btn.textContent = option.label;
    btn.addEventListener('click', async () => {
      if (kind === 'season') await selectDetailSeason(option.value);
      else selectDetailEpisode(option.value);
    });
    menu.appendChild(btn);
  });
}

async function populateDetailSeasonDropdown(seasons, selectedSeason = 1) {
  const options = seasons.map(s => ({ value: s.season_number, label: `Season ${s.season_number}` }));
  const initial = options.find(o => o.value === selectedSeason)?.value || options[0]?.value || null;
  setDetailDropdownOptions('season', options, initial);
  if (initial !== null) await populateDetailEpisodeDropdown(currentDetailItem.id, initial, 1);
}

async function populateDetailEpisodeDropdown(showId, seasonNumber, selectedEpisode = 1) {
  const eps     = await fetchEpisodes(showId, seasonNumber);
  const options = eps.map(e => ({ value: e.number, label: `Ep ${e.number}${e.name ? ' – ' + e.name : ''}` }));
  const initial = options.find(o => o.value === selectedEpisode)?.value || options[0]?.value || null;
  setDetailDropdownOptions('episode', options, initial);
}

async function selectDetailSeason(seasonNumber) {
  if (!currentDetailItem) return;
  setDetailDropdownOptions('season', detailDropdownState.seasonOptions, seasonNumber);
  closeDetailDropdowns();
  await populateDetailEpisodeDropdown(currentDetailItem.id, seasonNumber, 1);
}

function selectDetailEpisode(episodeNumber) {
  setDetailDropdownOptions('episode', detailDropdownState.episodeOptions, episodeNumber);
  closeDetailDropdowns();
}

document.addEventListener('click', e => { if (!e.target.closest('.detail-dropdown')) closeDetailDropdowns(); });

/* ─────────────────────────────────────────────────────────────────────────
   Player
───────────────────────────────────────────────────────────────────────── */

async function watchSelectedTitle() {
  if (!currentDetailItem) return;
  const item    = currentDetailItem;
  const options = {};
  if (item.type === 'tv' || item.type === 'anime') {
    options.season  = detailDropdownState.season  || 1;
    options.episode = detailDropdownState.episode || 1;
  }
  closeDetailsModal();
  await openPlayer(item, options);
}
window.watchSelectedTitle = watchSelectedTitle;

let currentPlayerSource = 'videasy';

function setPlayerSource(source) {
  currentPlayerSource = source;
  document.querySelectorAll('.source-toggle__btn').forEach(b =>
    b.classList.toggle('active', b.dataset.source === source)
  );
  // Reload the iframe with the new source, preserving current position
  if (!currentPlayerItem) return;
  const isTV = currentPlayerItem.type === 'tv' || currentPlayerItem.type === 'anime';
  const season  = isTV ? playerState.season  : null;
  const episode = isTV ? playerState.episode : null;
  const resumeTs = _progressElapsed > 30 ? Math.floor(_progressElapsed) : 0;
  document.getElementById('player-frame').src = buildPlayerSrc(currentPlayerItem, season, episode, resumeTs);
}
window.setPlayerSource = setPlayerSource;

function buildPlayerSrc(item, season, episode, resumeTs) {
  const isTV = item.type === 'tv' || item.type === 'anime';
  if (currentPlayerSource === 'vidcore') {
    if (isTV) {
      const base = `https://vidcore.xyz/tv/${item.id}/${season}/${episode}`;
      return resumeTs ? `${base}?progress=${resumeTs}` : base;
    }
    const base = `https://vidcore.xyz/movie/${item.id}`;
    return resumeTs ? `${base}?progress=${resumeTs}` : base;
  }
  // videasy (default)
  if (isTV) {
    const base = `https://player.videasy.net/tv/${item.id}/${season}/${episode}?nextEpisode=true&episodeSelector=false`;
    return resumeTs ? `${base}&progress=${resumeTs}` : base;
  }
  const base = `https://player.videasy.net/movie/${item.id}`;
  return resumeTs ? `${base}?progress=${resumeTs}` : base;
}

async function openPlayer(item, options = {}) {
  currentPlayerItem = item;
  document.getElementById('player-title').textContent = item.name + (item.year ? ' · ' + item.year : '');
  const isTV = item.type === 'tv' || item.type === 'anime';
  if (isTV) {
    currentTVShow = item;
    document.getElementById('ep-controls').classList.add('visible');
    const initSeason  = options.season  || 1;
    const initEpisode = options.episode || 1;
    playerState.season  = initSeason;
    playerState.episode = initEpisode;
    const details = await fetchTVDetails(item.id);
    populateSeasonSelect('season-select', details.seasons, initSeason);
    await populateEpisodeSelect('episode-select', item.id, initSeason, initEpisode);
    loadTVEpisode(item.id, initSeason, initEpisode);
    await saveContinueWatching(item, initSeason, initEpisode);
  } else {
    currentTVShow = null;
    playerState.season  = null;
    playerState.episode = null;
    document.getElementById('ep-controls').classList.remove('visible');
    const saved    = continueWatchingCache[item.id];
    const resumeTs = saved?.timestamp && saved.timestamp > 30 ? Math.floor(saved.timestamp) : 0;
    document.getElementById('player-frame').src = buildPlayerSrc(item, null, null, resumeTs);
    const existingPct = saved?.progressPct ?? 0;
    await saveContinueWatching(item, null, null, existingPct, resumeTs || 0);
    startProgressTimer(item, resumeTs || 0);
  }
  document.getElementById('player').classList.add('open');
  document.getElementById('player-backdrop').classList.add('open');
  updateBodyScrollLock();
}

function closePlayer() {
  stopProgressTimer();
  if (currentPlayerItem && _progressRuntime > 0 && _progressElapsed > 0) {
    const pct = Math.min((_progressElapsed / _progressRuntime) * 100, 99);
    saveContinueWatching(currentPlayerItem, playerState.season, playerState.episode, pct, _progressElapsed);
  } else {
    flushProgressSave();
  }
  if (currentTVShow) {
    saveContinueWatching(currentTVShow, playerState.season, playerState.episode);
  }
  currentPlayerItem = null;
  document.getElementById('player').classList.remove('open');
  document.getElementById('player-backdrop').classList.remove('open');
  document.getElementById('player-frame').src = 'about:blank';
  document.getElementById('ep-controls').classList.remove('visible');
  currentTVShow = null;
  playerState   = { season:1, episode:1 };
  updateBodyScrollLock();
}
window.closePlayer = closePlayer;

function loadTVEpisode(showId, season, episode) {
  const saved    = continueWatchingCache[showId];
  const resumeTs = (saved?.timestamp > 30 && saved.season === season && saved.episode === episode)
    ? Math.floor(saved.timestamp) : 0;
  document.getElementById('player-frame').src = buildPlayerSrc({ id: showId, type: currentTVShow?.type || 'tv' }, season, episode, resumeTs);
}

function toggleFullscreen() {
  const frame = document.getElementById('player-frame');
  const icon  = document.getElementById('fs-icon');
  if (!document.fullscreenElement) {
    frame.requestFullscreen().catch(() => {});
    icon.className = 'fa-solid fa-compress';
  } else {
    document.exitFullscreen();
    icon.className = 'fa-solid fa-expand';
  }
}
window.toggleFullscreen = toggleFullscreen;

document.addEventListener('fullscreenchange', () => {
  if (!document.fullscreenElement) document.getElementById('fs-icon').className = 'fa-solid fa-expand';
});

/* Season / episode selects in player bar */

function populateSeasonSelect(selectId, seasons, selectedSeason = 1) {
  const sel = document.getElementById(selectId);
  sel.innerHTML = '';
  seasons.forEach(s => {
    const opt = document.createElement('option');
    opt.value   = s.season_number;
    opt.textContent = `Season ${s.season_number}`;
    if (s.season_number === selectedSeason) opt.selected = true;
    sel.appendChild(opt);
  });
}

async function populateEpisodeSelect(selectId, showId, seasonNumber, selectedEp = 1) {
  const eps = await fetchEpisodes(showId, seasonNumber);
  const sel = document.getElementById(selectId);
  sel.innerHTML = '';
  eps.forEach(e => {
    const opt = document.createElement('option');
    opt.value       = e.number;
    opt.textContent = `Ep ${e.number}${e.name ? ' – ' + e.name : ''}`;
    if (e.number === selectedEp) opt.selected = true;
    sel.appendChild(opt);
  });
}

async function onSeasonChange() {
  if (!currentTVShow) return;
  const season = parseInt(document.getElementById('season-select').value);
  playerState.season  = season;
  playerState.episode = 1;
  await populateEpisodeSelect('episode-select', currentTVShow.id, season, 1);
  loadTVEpisode(currentTVShow.id, season, 1);
  saveContinueWatching(currentTVShow, season, 1);
}
window.onSeasonChange = onSeasonChange;

function onEpisodeChange() {
  if (!currentTVShow) return;
  const season  = parseInt(document.getElementById('season-select').value);
  const episode = parseInt(document.getElementById('episode-select').value);
  playerState.season  = season;
  playerState.episode = episode;
  loadTVEpisode(currentTVShow.id, season, episode);
  saveContinueWatching(currentTVShow, season, episode);
}
window.onEpisodeChange = onEpisodeChange;

/* ─────────────────────────────────────────────────────────────────────────
   Progress tracking (movie)
───────────────────────────────────────────────────────────────────────── */

function startProgressTimer(item, resumeSeconds = 0) {
  stopProgressTimer();
  _progressElapsed  = resumeSeconds;
  _progressRuntime  = 0;
  _progressLastSave = Date.now();
  const type = item.type === 'anime' ? 'tv' : item.type;
  tmdb(`/${type}/${item.id}`).then(data => {
    if (_progressRuntime === 0) _progressRuntime = (data.runtime || 0) * 60;
  }).catch(() => {});

  _progressTimer = setInterval(() => {
    if (!currentPlayerItem) { stopProgressTimer(); return; }
    _progressElapsed += 5;
    const cached = continueWatchingCache[currentPlayerItem.id];
    if (cached && _progressRuntime > 0) {
      const pct = Math.min((_progressElapsed / _progressRuntime) * 100, 99);
      cached.progressPct = pct;
      cached.timestamp   = _progressElapsed;
      renderContinueWatchingRow();
      const now = Date.now();
      if (now - _progressLastSave >= 10000) {
        _progressLastSave = now;
        scheduleProgressSave(currentPlayerItem, playerState.season, playerState.episode, pct, _progressElapsed);
      }
    }
  }, 5000);
}

function stopProgressTimer() {
  if (_progressTimer) { clearInterval(_progressTimer); _progressTimer = null; }
}

window.addEventListener('message', event => {
  if (!event.data) return;
  let msg;
  try { msg = typeof event.data === 'string' ? JSON.parse(event.data) : event.data; }
  catch { return; }
  const pct = typeof msg.progress  === 'number' ? msg.progress  : null;
  const ts  = typeof msg.timestamp === 'number' ? msg.timestamp : null;
  if (pct === null || !currentPlayerItem) return;
  if (ts !== null) {
    _progressElapsed = ts;
    if (_progressRuntime === 0 && typeof msg.duration === 'number' && msg.duration > 0) {
      _progressRuntime = msg.duration;
    }
  }
  const cached = continueWatchingCache[currentPlayerItem.id];
  if (cached) {
    cached.progressPct = pct;
    cached.timestamp   = ts ?? cached.timestamp;
    renderContinueWatchingRow();
  }
  scheduleProgressSave(currentPlayerItem, playerState.season, playerState.episode, pct, ts);
});

/* ─────────────────────────────────────────────────────────────────────────
   Controls / event listeners
───────────────────────────────────────────────────────────────────────── */

searchInput.addEventListener('input', e => {
  if (currentSpecialView) exitSpecialView();
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => searchTMDB(e.target.value), 450);
});

function openAgeVerify()  {
  document.getElementById('age-verify').classList.add('open');
  document.getElementById('age-verify-backdrop').classList.add('open');
}
function closeAgeVerify() {
  document.getElementById('age-verify').classList.remove('open');
  document.getElementById('age-verify-backdrop').classList.remove('open');
}

async function applyAdultToggle(newVal) {
  showAdultContent = newVal;
  adultToggle.classList.toggle('active', newVal);
  adultToggle.setAttribute('aria-pressed', String(newVal));
  adultToggleText.textContent = newVal ? 'On' : 'Off';
  if (PlutoniumStore.currentUser) {
    try {
      await PlutoniumStore.setDoc('stream_prefs', { adultContent: newVal });
    } catch(e) {}
  }
  await refreshCurrentView();
}

async function confirmAgeVerify() {
  closeAgeVerify();
  await applyAdultToggle(true);
}
window.confirmAgeVerify = confirmAgeVerify;

function denyAgeVerify() {
  closeAgeVerify();
  // ensure toggle stays off
  adultToggle.classList.remove('active');
  adultToggle.setAttribute('aria-pressed', 'false');
  adultToggleText.textContent = 'Off';
}
window.denyAgeVerify = denyAgeVerify;

adultToggle.addEventListener('click', async () => {
  if (!showAdultContent) {
    // turning on — require age verification first
    openAgeVerify();
  } else {
    // turning off — no prompt needed
    await applyAdultToggle(false);
  }
});

document.getElementById('age-sort-select')?.addEventListener('change', async e => {
  ageRatingFilter = e.target.value;
  await refreshCurrentView();
});

document.getElementById('continue-see-all')?.addEventListener('click', () => enterSpecialView('continue'));
document.getElementById('favorites-see-all')?.addEventListener('click', () => enterSpecialView('favorites'));
document.getElementById('special-view-back')?.addEventListener('click', exitSpecialView);

document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  if (document.getElementById('age-verify').classList.contains('open')) { denyAgeVerify(); return; }
  if (document.getElementById('adult-gate').classList.contains('open')) { denyAdultGate(); return; }
  if (document.getElementById('details-modal').classList.contains('open')) { closeDetailsModal(); return; }
  if (document.getElementById('player').classList.contains('open')) { closePlayer(); return; }
});

/* ─────────────────────────────────────────────────────────────────────────
   Infinite scroll
───────────────────────────────────────────────────────────────────────── */

const scrollObserver = new IntersectionObserver(entries => {
  if (entries[0].isIntersecting && !isLoading && hasMore && !isSearchMode && !currentSpecialView) {
    loadContent(true);
  }
}, { rootMargin: '200px' });
scrollObserver.observe(sentinel);

/* ─────────────────────────────────────────────────────────────────────────
   Auth state (PlutoniumStore)
───────────────────────────────────────────────────────────────────────── */

PlutoniumStore.onAuthChange(async user => {
  if (user) {
    // Load user prefs
    try {
      const prefs = await PlutoniumStore.getDoc('stream_prefs').catch(() => null);
      if (prefs?.adultContent !== undefined) {
        showAdultContent = Boolean(prefs.adultContent);
        adultToggle.classList.toggle('active', showAdultContent);
        adultToggle.setAttribute('aria-pressed', String(showAdultContent));
        adultToggleText.textContent = showAdultContent ? 'On' : 'Off';
      }
    } catch(e) {}

    await Promise.all([loadFavorites(), loadContinueWatching()]);
    renderContinueWatchingRow();
    renderFavoritesRow();
    rerenderCardOverlays();
  } else {
    favoritesCache        = {};
    continueWatchingCache = {};
    renderContinueWatchingRow();
    renderFavoritesRow();
    rerenderCardOverlays();
  }

  // Initialize content on first auth state fire
  if (!_streamInitialized) {
    _streamInitialized = true;
    await initializeFromUrl();
  }
});

let _streamInitialized = false;
