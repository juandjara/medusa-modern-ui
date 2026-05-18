import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Search, History } from 'lucide-react'
import api from '../lib/api'
import type { Episode, EpisodeStatus } from '../types/medusa'
import { EPISODE_STATUS_CODE } from '../types/medusa'
import StatusBadge from './StatusBadge'
import EpisodeSearchModal from './EpisodeSearchModal'

interface Props {
  seriesSlug: string
  season: number
  episodes: Episode[]
}

export default function SeasonAccordion({ seriesSlug, season, episodes }: Props) {
  const queryClient = useQueryClient()
  const [searchTarget, setSearchTarget] = useState<number | null>(null)

  const aired = episodes.filter((e) => e.status !== 'Unaired')
  const downloaded = aired.filter(
    (e) => e.status === 'Downloaded' || e.status === 'Archived',
  ).length

  // PATCH body is keyed by episode identifier (e.g. "s01e02"), status sent as int.
  const setStatus = useMutation({
    mutationFn: (payload: { identifiers: string[]; status: EpisodeStatus }) => {
      const body: Record<string, { status: number }> = {}
      for (const id of payload.identifiers) {
        body[id] = { status: EPISODE_STATUS_CODE[payload.status] }
      }
      return api.patch(`/series/${seriesSlug}/episodes`, body)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['series', seriesSlug, 'episodes'] })
    },
  })

  return (
    <div className="collapse collapse-arrow bg-base-100 border border-base-300 rounded-box">
      <input type="checkbox" className="peer" />
      <div className="collapse-title font-semibold text-lg flex items-center gap-3">
        Season {season === 0 ? 'Specials' : season}
        <span className="text-sm font-normal text-base-content/50">
          {episodes.length} episodes · {downloaded} downloaded
        </span>
        <Link
          to={`/history?show=${seriesSlug}&season=${season}`}
          className="btn btn-ghost btn-xs gap-1 ml-auto"
          title="History for this season"
          onClick={(e) => e.stopPropagation()}
        >
          <History size={12} /> History
        </Link>
      </div>
      <div className="collapse-content p-0">
        <div className="overflow-x-auto">
          <table className="table table-zebra table-xs">
            <thead>
              <tr>
                <th>#</th>
                <th>Title</th>
                <th>Air Date</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {episodes.map((ep) => (
                <tr key={ep.identifier}>
                  <td>{ep.episode}</td>
                  <td className={ep.title ? '' : 'text-base-content/30 italic'}>
                    {ep.title || 'TBA'}
                  </td>
                  <td className="text-xs whitespace-nowrap">
                    {ep.airDate ? ep.airDate.split('T')[0] : '—'}
                  </td>
                  <td>
                    <StatusBadge status={ep.status} />
                  </td>
                  <td>
                    <div className="flex items-center gap-1">
                      <button
                        className="btn btn-ghost btn-xs btn-square"
                        title="Search"
                        onClick={() => setSearchTarget(ep.episode)}
                      >
                        <Search size={14} />
                      </button>
                      <Link
                        to={`/history?show=${seriesSlug}&season=${season}&episode=${ep.episode}`}
                        className="btn btn-ghost btn-xs btn-square"
                        title="History for this episode"
                      >
                        <History size={14} />
                      </Link>
                      <div className="dropdown dropdown-end">
                        <button tabIndex={0} className="btn btn-ghost btn-xs">
                          ⋯
                        </button>
                        <ul
                          tabIndex={0}
                          className="dropdown-content menu bg-base-100 rounded-box z-10 shadow-sm border border-base-300 p-2"
                        >
                          <li>
                            <button
                              onClick={() =>
                                setStatus.mutate({
                                  identifiers: [ep.identifier],
                                  status: 'Wanted',
                                })
                              }
                            >
                              Set Wanted
                            </button>
                          </li>
                          <li>
                            <button
                              onClick={() =>
                                setStatus.mutate({
                                  identifiers: [ep.identifier],
                                  status: 'Skipped',
                                })
                              }
                            >
                              Skip
                            </button>
                          </li>
                          <li>
                            <button
                              onClick={() =>
                                setStatus.mutate({
                                  identifiers: [ep.identifier],
                                  status: 'Archived',
                                })
                              }
                            >
                              Archive
                            </button>
                          </li>
                        </ul>
                      </div>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {searchTarget !== null && (
        <EpisodeSearchModal
          seriesSlug={seriesSlug}
          season={season}
          episode={searchTarget}
          open={searchTarget !== null}
          onClose={() => setSearchTarget(null)}
        />
      )}
    </div>
  )
}
