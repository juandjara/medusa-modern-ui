import { useEffect, useRef, useEffectEvent } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import api from '../lib/api'
import type { Release } from '../types/medusa'

interface Props {
  seriesSlug: string
  season: number
  episode: number
  open: boolean
  onClose: () => void
}

export default function EpisodeSearchModal({
  seriesSlug,
  season,
  episode,
  open,
  onClose,
}: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null)

  const { data: results, isLoading } = useQuery({
    queryKey: ['search', seriesSlug, season, episode],
    queryFn: ({ signal }) =>
      api
        .get<Release[]>(
          `/series/${seriesSlug}/episodes/${season}/${episode}/search`,
          { signal },
        )
        .then((r) => r.data),
    enabled: open,
    staleTime: 0,
    gcTime: 60_000,
  })

  const snatch = useMutation({
    mutationFn: (url: string) =>
      api.post(`/series/${seriesSlug}/episodes/${season}/${episode}/snatch`, {
        url,
      }),
    onSuccess: onClose,
  })

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    else if (!open && dialog.open) dialog.close()
  }, [open])

  const handleNativeClose = useEffectEvent(() => onClose())
  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    const listener = () => handleNativeClose()
    dialog.addEventListener('close', listener)
    return () => dialog.removeEventListener('close', listener)
  }, [])

  return (
    <dialog
      ref={dialogRef}
      className="modal"
      aria-labelledby="search-modal-title"
    >
      <div className="modal-box max-w-3xl">
        <h3 id="search-modal-title" className="font-bold text-lg mb-4">
          Search — S{season}E{episode}
        </h3>

        {isLoading && (
          <div className="flex justify-center py-8">
            <span className="loading loading-spinner" />
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="table table-zebra table-xs">
            <thead>
              <tr>
                <th>Provider</th>
                <th>Release</th>
                <th>Quality</th>
                <th>Size</th>
                <th>S/L</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {results?.map((r, i) => (
                <tr key={i}>
                  <td className="text-xs">{r.provider}</td>
                  <td className="max-w-xs truncate text-xs" title={r.title}>
                    {r.title}
                  </td>
                  <td>
                    <span className="badge badge-xs">{r.quality}</span>
                  </td>
                  <td className="text-xs">
                    {(r.size / 1_073_741_824).toFixed(1)} GB
                  </td>
                  <td className="text-xs">
                    {r.seeders}/{r.leechers}
                  </td>
                  <td>
                    <button
                      className="btn btn-primary btn-xs"
                      onClick={() => snatch.mutate(r.url)}
                      disabled={snatch.isPending}
                    >
                      Snatch
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="modal-action">
          <form method="dialog">
            <button className="btn btn-sm">Close</button>
          </form>
        </div>
      </div>

      <form method="dialog" className="modal-backdrop">
        <button aria-label="Close dialog">close</button>
      </form>
    </dialog>
  )
}
