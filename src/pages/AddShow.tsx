import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Search } from 'lucide-react'
import api from '../lib/api'
import type { SearchResult } from '../types/medusa'
import { DEFAULT_QUALITY_ALLOWED } from '../types/medusa'

export default function AddShow() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<SearchResult | null>(null)
  const [options, setOptions] = useState({
    status: 'Skipped' as 'Wanted' | 'Skipped',
    rootDir: '',
  })

  // NOTE: /series/search isn't in the v2 dredd spec — endpoint and response
  // shape may differ on this backend. Verify before relying on this page.
  const search = useQuery({
    queryKey: ['search-shows', query],
    queryFn: ({ signal }) =>
      api
        .get('/series/search', { params: { q: query }, signal })
        .then((r) => r.data.data as SearchResult[]),
    enabled: query.length >= 3,
  })

  // POST /series body per medusa/server/api/v2/series.py:181 —
  //   { id: { <indexer>: <id> }, options: { status, quality: {allowed, preferred}, ... } }
  // Response is the queue item (show is added asynchronously after indexer fetch),
  // so we navigate back to the list rather than to /show/{slug}.
  const addShow = useMutation({
    mutationFn: () => {
      if (!selected) throw new Error('No show selected')
      return api.post('/series', {
        id: { [selected.indexer]: selected.indexerId },
        options: {
          status: options.status,
          quality: { allowed: DEFAULT_QUALITY_ALLOWED, preferred: [] },
          seasonFolders: true,
          rootDir: options.rootDir || undefined,
        },
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['series'] })
      navigate('/')
    },
  })

  if (!selected) {
    return (
      <div className="max-w-xl mx-auto space-y-6 pt-8">
        <h1 className="text-2xl font-bold">Add Show</h1>
        <label className="input input-bordered flex items-center gap-2">
          <Search size={18} />
          <input
            className="grow"
            placeholder="Search for a show…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>

        {search.isLoading && (
          <span className="loading loading-spinner block mx-auto" />
        )}

        <div className="grid gap-3">
          {search.data?.map((s) => (
            <button
              key={s.indexerId}
              className="card card-side bg-base-100 border border-base-300 p-3 text-left hover:border-primary transition-colors gap-4 items-start"
              onClick={() => setSelected(s)}
            >
              <div className="w-16 aspect-[2/3] bg-base-300 rounded shrink-0 overflow-hidden">
                {s.poster && (
                  <img
                    src={s.poster}
                    alt={s.title}
                    className="object-cover w-full h-full"
                  />
                )}
              </div>
              <div className="min-w-0">
                <div className="font-semibold">
                  {s.title}{' '}
                  <span className="text-sm text-base-content/50">({s.year})</span>
                </div>
                {s.network && (
                  <div className="text-xs text-base-content/50">{s.network}</div>
                )}
                <p className="text-xs line-clamp-2 mt-1">{s.overview}</p>
              </div>
            </button>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-lg mx-auto space-y-6 pt-8">
      <h1 className="text-2xl font-bold">Configure Show</h1>
      <div className="card bg-base-100 border border-base-300 p-4">
        <div className="font-semibold">{selected.title}</div>
        <div className="text-sm text-base-content/50">{selected.year}</div>
      </div>

      <label className="form-control w-full">
        <span className="label-text">Initial Episode Status</span>
        <select
          className="select select-bordered"
          value={options.status}
          onChange={(e) =>
            setOptions((s) => ({
              ...s,
              status: e.target.value as typeof s.status,
            }))
          }
        >
          <option value="Skipped">Skipped — don't auto-download anything</option>
          <option value="Wanted">Wanted — search for all aired episodes</option>
        </select>
      </label>

      <label className="form-control w-full">
        <span className="label-text">Root Directory</span>
        <input
          className="input input-bordered"
          value={options.rootDir}
          onChange={(e) =>
            setOptions((s) => ({ ...s, rootDir: e.target.value }))
          }
          placeholder="/tv"
        />
        <span className="text-xs text-base-content/50 mt-1">
          Optional — leave blank to use Medusa's default. Quality defaults to
          HD WEB-DL / Blu-ray + 4K WEB-DL (configurable later from the show
          page).
        </span>
      </label>

      {addShow.isError && (
        <div className="alert alert-soft alert-error text-sm">Failed to add show.</div>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          className="btn btn-ghost flex-1"
          onClick={() => setSelected(null)}
        >
          Back
        </button>
        <button
          type="button"
          className="btn btn-primary flex-1"
          onClick={() => addShow.mutate()}
          disabled={addShow.isPending}
        >
          {addShow.isPending ? (
            <span className="loading loading-spinner loading-sm" />
          ) : (
            'Add Show'
          )}
        </button>
      </div>
    </div>
  )
}
