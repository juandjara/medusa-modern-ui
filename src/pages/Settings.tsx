import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronRight } from 'lucide-react'
import api from '../lib/api'

interface GeneralConfig {
  tvDownloadDir: string
  indexer: 'TVDB' | 'TMDB' | 'TVMaze'
}

export default function Settings() {
  const { data: config, isLoading } = useQuery<GeneralConfig>({
    queryKey: ['config', 'general'],
    queryFn: ({ signal }) =>
      api.get('/config/general', { signal }).then((r) => r.data.data),
  })

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-2xl font-bold">Settings</h1>

      <div className="collapse collapse-arrow bg-base-100 border border-base-300 rounded-box">
        <input type="checkbox" defaultChecked className="peer" />
        <div className="collapse-title font-semibold">General</div>
        <div className="collapse-content">
          {isLoading || !config ? (
            <span className="loading loading-spinner" />
          ) : (
            <GeneralForm initial={config} />
          )}
        </div>
      </div>

      <div className="bg-base-100 border border-base-300 rounded-box">
        <div className="px-4 py-3 font-semibold border-b border-base-300">
          Search providers
        </div>
        <ul>
          <li>
            <Link
              to="/settings/providers/prowlarr"
              className="flex items-center justify-between gap-2 px-4 py-3 hover:bg-base-200/50 transition-colors"
            >
              <div>
                <div className="font-medium">Prowlarr</div>
                <div className="text-xs text-base-content/60">
                  Import Newznab / Torznab indexers from a Prowlarr server.
                </div>
              </div>
              <ChevronRight size={16} className="text-base-content/40" />
            </Link>
          </li>
        </ul>
      </div>

      <div className="bg-base-100 border border-base-300 rounded-box">
        <div className="px-4 py-3 font-semibold border-b border-base-300">
          Download clients
        </div>
        <ul>
          <li>
            <Link
              to="/settings/download-clients"
              className="flex items-center justify-between gap-2 px-4 py-3 hover:bg-base-200/50 transition-colors"
            >
              <div>
                <div className="font-medium">NZB and Torrent</div>
                <div className="text-xs text-base-content/60">
                  Configure SABnzbd, NZBget, qBittorrent, Transmission, and
                  others — including blackhole folders.
                </div>
              </div>
              <ChevronRight size={16} className="text-base-content/40" />
            </Link>
          </li>
        </ul>
      </div>
    </div>
  )
}

function GeneralForm({ initial }: { initial: GeneralConfig }) {
  const queryClient = useQueryClient()
  const [values, setValues] = useState<GeneralConfig>(initial)

  const save = useMutation({
    mutationFn: (next: GeneralConfig) => api.put('/config/general', next),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['config', 'general'] }),
  })

  return (
    <div className="space-y-4">
      <fieldset className="fieldset">
        <legend className="fieldset-legend">Download Directory</legend>
        <input
          className="input input-sm w-full"
          value={values.tvDownloadDir}
          onChange={(e) =>
            setValues((v) => ({ ...v, tvDownloadDir: e.target.value }))
          }
        />
      </fieldset>
      <fieldset className="fieldset">
        <legend className="fieldset-legend">Indexer</legend>
        <select
          className="select select-sm w-full"
          value={values.indexer}
          onChange={(e) =>
            setValues((v) => ({
              ...v,
              indexer: e.target.value as GeneralConfig['indexer'],
            }))
          }
        >
          <option>TVDB</option>
          <option>TMDB</option>
          <option>TVMaze</option>
        </select>
      </fieldset>
      <button
        className="btn btn-primary btn-sm"
        onClick={() => save.mutate(values)}
        disabled={save.isPending}
      >
        {save.isPending ? (
          <span className="loading loading-spinner loading-sm" />
        ) : (
          'Save'
        )}
      </button>
    </div>
  )
}
