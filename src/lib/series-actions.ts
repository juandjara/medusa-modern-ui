import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import api from './api'
import { pushToast } from './toasts'
import { useWebSocket } from './websocket'

export type MassUpdateAction =
  | 'update'    // re-fetch metadata from indexer
  | 'rescan'    // rescan local files
  | 'rename'    // rename episode files per naming pattern
  | 'subtitle'  // queue subtitle download
  | 'image'     // refresh poster/banner cache
  | 'remove'    // remove from Medusa (keeps files)
  | 'delete'    // remove from Medusa AND delete files

// Backstop for when WS isn't fast enough; otherwise effectively a no-op.
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

  // WS clears the banner immediately; the 3s timer is a backstop.
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
        // Destructive actions navigate away with no inline confirmation —
        // confirm via toast so the user knows the click took.
        pushToast({
          title:
            action === 'delete'
              ? 'Show deleted (files removed)'
              : 'Show removed from Medusa',
          type: 'notice',
        })
        navigate('/')
        return
      }
      setQueued(action)
      window.setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['series', slug] })
        setQueued((current) => (current === action ? null : current))
      }, cfg.invalidateDelayMs)
    },
    onError: (_err, action) => {
      pushToast({
        title: `Couldn't ${ACTION_LABELS[action].toLowerCase()}`,
        body: 'Check the server logs.',
        type: 'error',
      })
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

// v2 series patches take flat JSON-pointer keys, e.g. { 'config.paused': true }.
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

// Caller supplies the JSON-pointer keys directly (see series.py:146).
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
