import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import api from '../lib/api'
import type { HistoryEntry } from '../types/medusa'
import StatusBadge from '../components/StatusBadge'

const ACTION_LABELS = ['', 'DOWNLOADED', 'SNATCHED', 'FAILED']

export default function History() {
  const [filter, setFilter] = useState('')
  const { data, isLoading } = useQuery({
    queryKey: ['history'],
    queryFn: ({ signal }) =>
      api
        .get('/history', { signal })
        .then((r) => r.data.data as HistoryEntry[]),
  })

  const filtered = data?.filter((h) => filter === '' || h.action === Number(filter))

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">History</h1>
        <select
          className="select select-bordered select-sm"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option value="">All</option>
          <option value="1">Downloaded</option>
          <option value="2">Snatched</option>
          <option value="3">Failed</option>
        </select>
      </div>

      {isLoading && (
        <div className="flex justify-center py-20">
          <span className="loading loading-spinner loading-lg" />
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="table table-zebra table-xs">
          <thead>
            <tr>
              <th>Date</th>
              <th>Show</th>
              <th>Episode</th>
              <th>Quality</th>
              <th>Provider</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {filtered?.map((h, i) => (
              <tr key={i}>
                <td className="text-xs whitespace-nowrap">{h.date}</td>
                <td className="text-sm">{h.series}</td>
                <td>
                  S{h.season}E{h.episodeNumber}
                </td>
                <td>
                  <span className="badge badge-xs">{h.quality}</span>
                </td>
                <td className="text-xs">{h.provider}</td>
                <td>
                  <StatusBadge status={ACTION_LABELS[h.action] ?? ''} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {filtered?.length === 0 && !isLoading && (
        <div className="text-center py-16 text-base-content/50">
          No history entries.
        </div>
      )}
    </div>
  )
}
