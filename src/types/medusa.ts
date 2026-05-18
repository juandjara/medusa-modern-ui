// ── Series ──
// Shape from PyMedusa /api/v2/series. Identifier is `id.slug` (stable, URL-safe).
export interface SeriesId {
  tmdb: number | null
  tvdb: number | null
  slug: string
  trakt: number | null
}

export interface SeriesExternals {
  imdb?: number | string
  tvdb?: number
  tvrage?: number
  tvmaze?: number
}

export interface SeriesConfig {
  location: string
  rootDir: string
  locationValid: boolean
  qualities: {
    allowed: number[]
    preferred: number[]
  }
  paused: boolean
  airByDate: boolean
  subtitlesEnabled: boolean
  dvdOrder: boolean
  seasonFolders: boolean
  anime: boolean
  scene: boolean
  sports: boolean
  defaultEpisodeStatus: string
  airdateOffset: number
  showLists: string[]
}

export interface Series {
  id: SeriesId
  externals: SeriesExternals
  title: string
  name: string
  indexer: string
  network: string | null
  type: string
  status: string
  airs: string | null
  language: string
  showType: 'series' | 'anime'
  year: { start: number }
  prevAirDate: string | null
  nextAirDate: string | null
  lastUpdate: string | null
  runtime: number
  genres: string[]
  plot: string | null
  cache: {
    poster: string | null
    banner: string | null
  }
  countries: string[]
  countryCodes: string[]
  config: SeriesConfig
  // Present when fetched with ?detailed=true — what PyMedusa thinks the
  // season layout is, independent of which episodes it actually has stored.
  seasonCount?: { season: number; episodeCount: number }[]
}

// ── Episode (PyMedusa v2: GET /series/{slug}/episodes returns Episode[]) ──
export interface Episode {
  identifier: string // "s03e07" — used as key in PATCH body
  id: {
    tvdb?: number
    tvmaze?: number
    imdb?: string
  }
  season: number
  episode: number
  absoluteNumber?: number
  airDate: string | null
  title: string
  description: string
  subtitles: string[]
  status: EpisodeStatus
  release?: {
    name: string
    group: string
    proper: boolean
    version: number
  }
  file?: {
    location: string
    size: number
  }
  watched?: boolean
}

// Status values are returned as title-case strings.
export type EpisodeStatus =
  | 'Unaired'
  | 'Snatched'
  | 'Wanted'
  | 'Downloaded'
  | 'Skipped'
  | 'Archived'
  | 'Ignored'
  | 'Snatched (Proper)'
  | 'Failed'
  | 'Snatched (Best)'

// Integer codes for PATCH /series/{slug}/episodes — status is sent as a number.
export const EPISODE_STATUS_CODE: Record<EpisodeStatus, number> = {
  Unaired: 1,
  Snatched: 2,
  Wanted: 3,
  Downloaded: 4,
  Skipped: 5,
  Archived: 6,
  Ignored: 7,
  'Snatched (Proper)': 9,
  Failed: 10,
  'Snatched (Best)': 12,
}

// ── API responses ──
export interface SeriesListResponse {
  data: Series[]
  total: number
}

export interface SeriesDetailResponse {
  data: Series
}

// Search result shape is not in the dredd spec — fields below are guesses
// based on the legacy UI and will need verification once /series/search is
// confirmed live on this backend.
export interface SearchResult {
  indexer: string // 'tmdb' | 'tvdb' | 'imdb' | 'tvmaze' | 'tvrage'
  indexerId: number
  title: string
  year: number
  network: string | null
  overview: string | null
  poster: string | null
}

// PyMedusa quality bitmask values (medusa/common.py). Matches what existing
// shows on the user's backend store for `qualities.allowed`.
export const QUALITY = {
  SDTV: 1,
  SDDVD: 2,
  HDTV: 4,
  RAWHDTV: 8,
  FULLHDTV: 16,
  HDWEBDL: 32,
  FULLHDWEBDL: 64,
  HDBLURAY: 128,
  FULLHDBLURAY: 256,
  UHD_4K_WEBDL: 512,
  UHD_4K_BLURAY: 1024,
} as const

// Default profile used when a user adds a show without picking qualities —
// HD WEB/Bluray + 4K WEB. Mirrors the default seen on existing shows.
export const DEFAULT_QUALITY_ALLOWED = [
  QUALITY.RAWHDTV,
  QUALITY.HDWEBDL,
  QUALITY.FULLHDWEBDL,
  QUALITY.HDBLURAY,
  QUALITY.FULLHDBLURAY,
  QUALITY.UHD_4K_WEBDL,
]

export interface Release {
  provider: string
  title: string
  url: string
  size: number
  seeders: number
  leechers: number
  peers: number
  pubdate: string
  quality: string
  releaseGroup: string | null
}

export interface ScheduleEntry {
  season: number
  episode: number
  airDate: string | null
  name: string
  seriesTitle: string
  seriesId: number
}

// Shape per medusa/server/api/v2/history.py rows. `status` is the integer
// from medusa/common.py; `statusName` is the server-formatted label, so we
// don't need a client-side enum map.
export interface HistoryEntry {
  id: number
  showSlug: string
  showTitle: string
  series: string // duplicate of showSlug; kept because the backend sends both
  season: number
  episode: number
  episodeTitle: string
  status: number
  statusName: string // e.g. 'Snatched', 'Downloaded', 'Failed', 'Subtitled'
  actionDate: number // YYYYMMDDHHMMSS integer (sbdatetime.encode)
  quality: number // bitmask — single bit set in practice; see QUALITY_NAMES
  resource: string
  size: number
  properTags: string
  manuallySearched: boolean
  infoHash: string | null
  provider: { id: string; name: string; imageName: string }
  releaseName: string | null
  releaseGroup: string | null
  fileName: string | null
  subtitleLanguage: string | null
  providerType: string
  clientStatus: { status: number[]; string: string } | null
  partOfBatch: boolean
}

// Friendly labels for the quality bitmask values declared in QUALITY above.
// Each history row's `quality` is a single bit; map to a short display string.
export const QUALITY_NAMES: Record<number, string> = {
  [QUALITY.SDTV]: 'SDTV',
  [QUALITY.SDDVD]: 'SD DVD',
  [QUALITY.HDTV]: 'HDTV',
  [QUALITY.RAWHDTV]: 'Raw HD-TV',
  [QUALITY.FULLHDTV]: '1080i HDTV',
  [QUALITY.HDWEBDL]: '720p WEB-DL',
  [QUALITY.FULLHDWEBDL]: '1080p WEB-DL',
  [QUALITY.HDBLURAY]: '720p BluRay',
  [QUALITY.FULLHDBLURAY]: '1080p BluRay',
  [QUALITY.UHD_4K_WEBDL]: '4K WEB-DL',
  [QUALITY.UHD_4K_BLURAY]: '4K BluRay',
}

export function qualityName(value: number): string {
  return QUALITY_NAMES[value] ?? `Q-${value}`
}

// Show queue items (refresh / update / rename / etc.) — shape from
// _queued_show_to_json in medusa/queues/utils.py.
export interface ShowQueueItem {
  showSlug: string | null
  showTitle: string | null
  showDir: string | null
  inProgress: boolean
  priority: 'low' | 'normal' | 'high' | number
  added: string // ISO datetime
  actionId: number
  queueType: string // 'REFRESH' | 'UPDATE' | 'RENAME' | 'ADD' | ...
}

// Post-processing queue items — base shape from generic_queue.QueueItem.to_json
// plus the `config` block added in medusa/process_tv.py:PostProcessQueueItem
// (and `output` once the job finishes successfully).
export interface PostProcessQueueItem {
  identifier: string
  name: string
  priority: 'low' | 'normal' | 'high' | number
  actionId: number
  queueTime: string
  success: boolean | null
  inProgress: boolean
  startTime: string | null
  updateTime: string | null
  config?: {
    path: string
    info_hash: string | null
    resource_name: string
    force: boolean
    is_priority: boolean
    process_method: 'copy' | 'move' | 'hardlink' | 'symlink' | string
    delete_on: boolean
    failed: boolean
    proc_type: 'auto' | 'manual' | string
    ignore_subs: boolean
  }
  output?: string
  [extra: string]: unknown
}

// Scheduler entry from medusa/schedulers/utils.py:_scheduler_to_json. When a
// scheduler isn't initialized, only key + name are present; all others optional.
//
// `isEnabled` is normally a bool, but `_is_enabled()` returns the literal
// string 'Paused' for key === 'backlog' when the backlog is paused — so we
// widen the type rather than try to coerce.
export interface SchedulerItem {
  key: string
  name: string
  isAlive?: boolean
  isEnabled?: boolean | 'Paused'
  isActive?: boolean
  startTime?: string | null
  cycleTime?: number | null // seconds between runs
  nextRun?: number | null // seconds until next run; null if disabled
  lastRun?: string
  isSilent?: boolean
  queueLength?: number
}

// Disk space block from medusa/queues/utils.py:generate_location_disk_space.
// `freeSpace` is a pre-formatted string ('123.4 GB'); no total or percentage.
export interface DiskSpaceEntry {
  type: string
  location: string
  freeSpace: string
}

export interface DiskSpace {
  tvDownloadDir: DiskSpaceEntry
  rootDir: DiskSpaceEntry[]
}

// /api/v2/config/system response. Used by both the Queue page (showQueue +
// postProcessQueue) and the System page (everything else).
export interface SystemConfig {
  showQueue: ShowQueueItem[]
  postProcessQueue: PostProcessQueueItem[]
  schedulers?: SchedulerItem[]
  diskSpace?: DiskSpace
  memoryUsage?: string
  branch?: string
  commitHash?: string
}

// Items that arrive only via WebSocket QueueItemUpdate events — search
// (daily/manual/backlog/snatch/retry/proper) and the download handler
// heartbeat. There's no HTTP endpoint to list them; we accumulate state
// from events as they come in.
//
// Shape is the union of fields we've seen across emitters in
// medusa/search/queue.py and medusa/schedulers/download_handler.py; all
// non-base fields are optional since the emitters extend differently.
export interface LiveQueueEpisodeSegment {
  identifier?: string
  season?: number
  episode?: number
  title?: string
}

export interface LiveQueueItem {
  identifier: string
  name: string
  priority?: 'low' | 'normal' | 'high' | number
  actionId?: number
  queueTime: string
  startTime?: string | null
  updateTime?: string | null
  inProgress?: boolean
  success?: boolean | null
  show?: { id?: { slug?: string }; title?: string; name?: string }
  segment?: LiveQueueEpisodeSegment[]
  manualSearchType?: string
  isActive?: boolean // DOWNLOADHANDLER only
  force?: boolean
  [extra: string]: unknown
}

export type LiveQueueCategory =
  | 'search'
  | 'snatch'
  | 'downloadHandler'
  | 'other'

// Classify a QueueItemUpdate by its `name` field. The legend below mirrors the
// emitter source — keep in sync if PyMedusa adds new queue types.
export function categorizeLiveItem(name: string): LiveQueueCategory {
  if (name === 'DOWNLOADHANDLER') return 'downloadHandler'
  if (name.startsWith('SNATCH-')) return 'snatch'
  if (
    name === 'Daily Search' ||
    name === 'Proper Search' ||
    name.startsWith('MANUAL-') ||
    name.startsWith('BACKLOG-') ||
    name.startsWith('RETRY-')
  ) {
    return 'search'
  }
  return 'other'
}

// Short label for the badge on a search-row.
export function searchTypeLabel(name: string): string {
  if (name === 'Daily Search') return 'DAILY'
  if (name === 'Proper Search') return 'PROPER'
  if (name.startsWith('MANUAL-')) return 'MANUAL'
  if (name.startsWith('BACKLOG-')) return 'BACKLOG'
  if (name.startsWith('RETRY-')) return 'RETRY'
  if (name.startsWith('SNATCH-')) return 'SNATCH'
  return name.toUpperCase()
}
