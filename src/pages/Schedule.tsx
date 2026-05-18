import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import api from '../lib/api'
import type { ScheduleEntry } from '../types/medusa'

export default function Schedule() {
  const { data, isLoading } = useQuery({
    queryKey: ['schedule'],
    queryFn: ({ signal }) =>
      api
        .get('/schedule', { signal })
        .then((r) => r.data.data as ScheduleEntry[]),
  })

  const grouped = data?.reduce<Record<string, ScheduleEntry[]>>((acc, item) => {
    const date = item.airDate?.split('T')[0] ?? 'Unknown'
    ;(acc[date] ??= []).push(item)
    return acc
  }, {})

  if (isLoading)
    return (
      <div className="flex justify-center py-20">
        <span className="loading loading-spinner loading-lg" />
      </div>
    )

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Schedule</h1>
      {grouped &&
        Object.entries(grouped).map(([date, entries]) => (
          <div key={date}>
            <h2 className="font-semibold text-base mb-2">{date}</h2>
            <div className="space-y-2">
              {entries.map((e, i) => (
                <Link
                  key={i}
                  to={`/show/${e.seriesId}`}
                  className="bg-base-100 border border-base-300 rounded-box p-3 flex flex-row items-center gap-4"
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-sm">{e.seriesTitle}</div>
                    <div className="text-xs text-base-content/50">
                      S{e.season}E{e.episode} — {e.name}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        ))}
      {data?.length === 0 && (
        <div className="text-center py-16 text-base-content/50">
          No upcoming episodes.
        </div>
      )}
    </div>
  )
}
