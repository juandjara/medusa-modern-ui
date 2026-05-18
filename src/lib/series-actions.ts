import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import api from './api'
import { useWebSocket } from './websocket'

// Action keys for POST /api/v2/massupdate. Each maps to a parallel array in
// the request body; the server runs the corresponding queue action against
// every slug listed under that key.
export type MassUpdateAction =
  | 'update'    // re-fetch metadata from indexer
  | 'rescan'    // rescan local files
  | 'rename'    // rename episode files per naming pattern
  | 'subtitle'  // queue subtitle download
  | 'image'     // refresh poster/banner cache
  | 'remove'    // remove from Medusa (keeps files)
  | 'delete'    // remove from Medusa AND delete files

// Fallback timer that clears the local "queued" banner and triggers a refetch
// when the WebSocket QueueItemShow event hasn't beaten us to it. With WS
// working this is effectively a no-op (cache is already fresh); 3s keeps the
// banner from lingering visually.
const FALLBACK_INVALIDATE_DELAY_MS = 3_000

const ACTION_CONFIG: Record<
  MassUpdateAction,
  { invalidateDelayMs: number; navigateHome: boolean }
> = {
  update: { invalidateDelayMs: FALLBACK_INVALIDATE_DELAY_MS, navigateHome: false },
  rescan: { invalidateDelayMs: FALLBACK_INVALIDATE_DELAY_MS, navigateHome: false },
  rename: { invalidateDelayMs: FALLBACK_INVALIDATE_DELAY_MS, navigateHome: false },
  subtitle: { invalidateDelayMs: FALLBACK_INVALIDATE_DELAY_MS, navigateHome: false },
  image: { invalidateDelayMs: FALLBACK_INVALIDATE_DELAY_MS, navigateHome: false },
  remove: { invalidateDelayMs: 0, navigateHome: true },
  delete: { invalidateDelayMs: 0, navigateHome: true },
}

export const ACTION_LABELS: Record<MassUpdateAction, string> = {
  update: 'Metadata refresh',
  rescan: 'File rescan',
  rename: 'Episode rename',
  subtitle: 'Subtitle download',
  image: 'Artwork refresh',
  remove: 'Show removal',
  delete: 'Show deletion',
}

export function useSeriesMassUpdate(slug: string) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [queued, setQueued] = useState<MassUpdateAction | null>(null)

  // Clear the banner the moment PyMedusa says the action finished, instead of
  // waiting for the 3s fallback timer. The timer still runs as a backstop in
  // case WS is offline.
  useWebSocket({
    QueueItemShow: (raw) => {
      const item = raw as {
        inProgress?: boolean
        show?: { id?: { slug?: string } }
      }
      if (item.inProgress !== false) return
      if (item.show?.id?.slug !== slug) return
      setQueued(null)
    },
  })

  const mutation = useMutation({
    mutationFn: (action: MassUpdateAction) =>
      api.post('/massupdate', { [action]: [slug] }).then(() => action),
    onSuccess: (action) => {
      const cfg = ACTION_CONFIG[action]
      if (cfg.navigateHome) {
        queryClient.invalidateQueries({ queryKey: ['series'] })
        navigate('/')
        return
      }
      setQueued(action)
      window.setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['series', slug] })
        setQueued((current) => (current === action ? null : current))
      }, cfg.invalidateDelayMs)
    },
  })

  const reload = () => {
    queryClient.invalidateQueries({ queryKey: ['series', slug] })
    setQueued(null)
  }

  return {
    run: mutation.mutate,
    isPending: mutation.isPending,
    queued,
    error: mutation.error,
    reload,
  }
}

// Per-show settings patches use JSON-pointer-style keys per the v2 source
// (medusa/server/api/v2/series.py:228). Body is flat: { 'config.paused': true }.
export function usePauseSeries(slug: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (paused: boolean) =>
      api.patch(`/series/${slug}`, { 'config.paused': paused }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['series', slug] })
    },
  })
}

// General per-show edit. Accepts a partial JSON-pointer body — caller passes
// the exact keys from the patches dict in series.py:146 (config.anime,
// config.qualities.allowed, etc.). Invalidates ['series', slug] so any other
// page reading the show picks up the changes immediately.
export function useEditSeries(slug: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.patch(`/series/${slug}`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['series', slug] })
    },
  })
}
