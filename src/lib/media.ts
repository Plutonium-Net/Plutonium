const TMDB_KEY = 'f53c43c1f2028398bcebdf4a5d1e28bd'
const TMDB_BASE = 'https://api.themoviedb.org/3'
const TMDB_IMAGE = 'https://image.tmdb.org/t/p/w500'

const ANIME_GENRE_ID = 16
const ADULT_CERTS = new Set(['NC-17', 'TV-MA', 'R18+', 'X', 'XXX', '18', '18A', 'MA', 'MA 15+', 'MA 18+', '18+'])

export type MediaKind = 'movie' | 'tv' | 'anime'

export type MediaItem = {
  id: string
  name: string
  year: string
  rating: string
  posterPath: string | null
  overview: string
  kind: MediaKind
}

export type MediaSeason = {
  number: number
  name: string
  episodes: number
}

export type MediaEpisode = {
  number: number
  name: string
}

export type MediaDetails = MediaItem & {
  cert: string
  runtime: string
  seasons: MediaSeason[]
}

type TmdbItem = {
  id: number
  title?: string
  name?: string
  original_title?: string
  original_name?: string
  release_date?: string
  first_air_date?: string
  vote_average?: number
  poster_path?: string | null
  overview?: string
  genre_ids?: number[]
  adult?: boolean
}

type TmdbPage = { results?: TmdbItem[]; total_pages?: number }

async function tmdb<T>(path: string): Promise<T> {
  const separator = path.includes('?') ? '&' : '?'
  const response = await fetch(`${TMDB_BASE}${path}${separator}api_key=${TMDB_KEY}`)
  if (!response.ok) throw new Error(`TMDB ${response.status}`)
  return (await response.json()) as T
}

function formatItem(raw: TmdbItem, kind: MediaKind): MediaItem {
  const tv = kind !== 'movie'
  const date = tv ? raw.first_air_date : raw.release_date
  return {
    id: String(raw.id),
    name: (tv ? raw.name || raw.original_name : raw.title || raw.original_title) || 'Untitled',
    year: date ? date.slice(0, 4) : 'N/A',
    rating: raw.vote_average ? raw.vote_average.toFixed(1) : 'N/A',
    posterPath: raw.poster_path || null,
    overview: raw.overview || '',
    kind,
  }
}

export function posterUrl(item: Pick<MediaItem, 'posterPath'>) {
  return item.posterPath ? `${TMDB_IMAGE}${item.posterPath}` : null
}

export async function loadCatalog(kind: MediaKind, page: number): Promise<MediaItem[]> {
  const path =
    kind === 'anime'
      ? `/discover/tv?with_genres=${ANIME_GENRE_ID}&with_original_language=ja&sort_by=popularity.desc&page=${page}`
      : kind === 'tv'
        ? `/tv/popular?page=${page}`
        : `/movie/popular?page=${page}`
  const data = await tmdb<TmdbPage>(path)
  return (data.results || []).map((raw) => formatItem(raw, kind))
}

export async function searchCatalog(kind: MediaKind, query: string): Promise<MediaItem[]> {
  const endpoint = kind === 'movie' ? 'movie' : 'tv'
  const data = await tmdb<TmdbPage>(`/search/${endpoint}?query=${encodeURIComponent(query)}`)
  let results = data.results || []
  if (kind === 'anime') results = results.filter((raw) => (raw.genre_ids || []).includes(ANIME_GENRE_ID))
  return results.map((raw) => formatItem(raw, kind))
}

function movieCert(detail: { release_dates?: { results?: { iso_3166_1: string; release_dates?: { certification?: string }[] }[] } }) {
  const regions = detail.release_dates?.results || []
  for (const code of ['US', 'CA', 'GB', 'AU']) {
    const region = regions.find((entry) => entry.iso_3166_1 === code)
    const cert = (region?.release_dates || []).map((entry) => entry.certification).find(Boolean)
    if (cert) return cert
  }
  return regions.flatMap((region) => region.release_dates || []).map((entry) => entry.certification).find(Boolean) || 'NR'
}

function tvCert(detail: { content_ratings?: { results?: { iso_3166_1: string; rating?: string }[] } }) {
  const ratings = detail.content_ratings?.results || []
  for (const code of ['US', 'CA', 'GB', 'AU']) {
    const region = ratings.find((entry) => entry.iso_3166_1 === code)
    if (region?.rating) return region.rating
  }
  return ratings.map((entry) => entry.rating).find(Boolean) || 'NR'
}

export async function loadDetails(item: MediaItem): Promise<MediaDetails> {
  if (item.kind === 'movie') {
    const detail = await tmdb<{
      id: number
      title?: string
      release_date?: string
      vote_average?: number
      poster_path?: string | null
      overview?: string
      runtime?: number
      release_dates?: { results?: { iso_3166_1: string; release_dates?: { certification?: string }[] }[] }
    }>(`/movie/${item.id}?append_to_response=release_dates`)
    return {
      ...item,
      name: detail.title || item.name,
      year: (detail.release_date || '').slice(0, 4) || item.year,
      rating: detail.vote_average ? detail.vote_average.toFixed(1) : item.rating,
      posterPath: detail.poster_path || item.posterPath,
      overview: detail.overview || item.overview || 'No description available yet.',
      cert: movieCert(detail),
      runtime: detail.runtime ? `${detail.runtime} min` : '',
      seasons: [],
    }
  }

  const detail = await tmdb<{
    id: number
    name?: string
    first_air_date?: string
    vote_average?: number
    poster_path?: string | null
    overview?: string
    number_of_seasons?: number
    content_ratings?: { results?: { iso_3166_1: string; rating?: string }[] }
    seasons?: { season_number: number; name?: string; episode_count?: number }[]
  }>(`/tv/${item.id}?append_to_response=content_ratings`)

  const seasons = (detail.seasons || [])
    .filter((season) => season.season_number > 0 && (season.episode_count || 0) > 0)
    .map((season) => ({
      number: season.season_number,
      name: season.name || `Season ${season.season_number}`,
      episodes: season.episode_count || 0,
    }))

  return {
    ...item,
    name: detail.name || item.name,
    year: (detail.first_air_date || '').slice(0, 4) || item.year,
    rating: detail.vote_average ? detail.vote_average.toFixed(1) : item.rating,
    posterPath: detail.poster_path || item.posterPath,
    overview: detail.overview || item.overview || 'No description available yet.',
    cert: tvCert(detail),
    runtime: seasons.length ? `${seasons.length} season${seasons.length === 1 ? '' : 's'}` : '',
    seasons,
  }
}

export async function loadEpisodes(id: string, season: number): Promise<MediaEpisode[]> {
  const data = await tmdb<{ episodes?: { episode_number: number; name?: string }[] }>(`/tv/${id}/season/${season}`)
  return (data.episodes || []).map((episode) => ({
    number: episode.episode_number,
    name: episode.name || `Episode ${episode.episode_number}`,
  }))
}

export function isAdultCert(cert: string) {
  return ADULT_CERTS.has(cert.toUpperCase().trim())
}

export function vidcoreUrl(item: MediaItem, season?: number, episode?: number) {
  const base =
    item.kind === 'movie'
      ? `https://vidcore.org/embed/movie/${item.id}`
      : `https://vidcore.org/embed/tv/${item.id}/${season ?? 1}/${episode ?? 1}`
  return `${base}?autoplay=true`
}

export const KIND_WORD: Record<MediaKind, string> = {
  movie: 'Cinema',
  tv: 'Television',
  anime: 'Anime',
}

export const KIND_LABEL: Record<MediaKind, string> = {
  movie: 'Film',
  tv: 'TV Show',
  anime: 'Anime',
}

export const SEARCH_HINT: Record<MediaKind, string> = {
  movie: 'Search films',
  tv: 'Search TV shows',
  anime: 'Search anime',
}
