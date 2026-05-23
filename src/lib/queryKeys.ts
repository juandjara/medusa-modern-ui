// Shared TanStack Query keys used across more than one file. Local keys
// (used by a single page/component) stay co-located with their query.

// In-memory store for search/snatch/download-handler queue items. Written
// by Layout's QueueItemUpdate WS subscriber, read by Queue and
// EpisodeSearchModal. No HTTP endpoint backs this — the cache *is* the
// source of truth while the app is open.
export const LIVE_QUEUE_KEY = ["live-queue"] as const;
