import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
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
      <label className="form-control">
        <span className="label-text">Download Directory</span>
        <input
          className="input input-bordered input-sm"
          value={values.tvDownloadDir}
          onChange={(e) =>
            setValues((v) => ({ ...v, tvDownloadDir: e.target.value }))
          }
        />
      </label>
      <label className="form-control">
        <span className="label-text">Indexer</span>
        <select
          className="select select-bordered select-sm"
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
      </label>
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
