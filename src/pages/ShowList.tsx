import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Search } from 'lucide-react'
import api, { getAssetUrl } from '../lib/api'
import type { Series } from '../types/medusa'

function useSeries() {
  return useQuery({
    queryKey: ['series'],
    queryFn: ({ signal }) =>
      api.get<Series[]>('/series', { signal }).then((r) => r.data),
  })
}

export default function ShowList() {
  const { data: shows, isLoading } = useSeries()
  const [search, setSearch] = useState('')

  const filtered = shows?.filter((s) =>
    s.title.toLowerCase().includes(search.toLowerCase()),
  )

  if (isLoading)
    return (
      <div className="flex justify-center py-20">
        <span className="loading loading-spinner loading-lg" />
      </div>
    )

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">Shows</h1>
        <div className="join w-full sm:w-auto">
          <div className="join-item flex-1 relative">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-base-content/40"
            />
            <input
              className="input input-bordered input-sm w-full sm:w-64 pl-9"
              placeholder="Filter shows…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Link to="/add" className="btn btn-primary btn-sm join-item">
            Add Show
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
        {filtered?.map((show) => (
          <Link
            key={show.id.slug}
            to={`/show/${show.id.slug}`}
            className="card card-compact bg-base-100 shadow-sm hover:shadow-md transition-shadow"
          >
            <figure className="aspect-[2/3] bg-base-300">
              <img
                src={getAssetUrl(show.id.slug, 'posterThumb')}
                alt={show.title}
                loading="lazy"
                className="object-cover h-full w-full"
                onError={(e) => {
                  e.currentTarget.style.display = 'none'
                }}
              />
            </figure>
            <div className="card-body p-3">
              <h3 className="card-title text-sm line-clamp-1">{show.title}</h3>
              <div className="flex flex-wrap gap-1">
                <span className="badge badge-xs">{show.status}</span>
                {show.network && (
                  <span className="badge badge-xs badge-ghost">
                    {show.network}
                  </span>
                )}
              </div>
            </div>
          </Link>
        ))}
      </div>

      {filtered?.length === 0 && (
        <div className="text-center py-16 text-base-content/50">
          {search ? 'No shows match your filter.' : 'No shows added yet.'}
        </div>
      )}
    </div>
  )
}
