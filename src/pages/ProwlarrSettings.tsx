import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronLeft,
  Check,
  Download,
  RefreshCw,
  TriangleAlert,
  Trash2,
} from "lucide-react";
import api from "../lib/api";
import type { ProviderSummary, ProwlarrIndexer } from "../types/medusa";
import SecretInput from "../components/forms/SecretInput";

interface ConfigMain {
  providers?: {
    prowlarr?: {
      url?: string;
      apikey?: string;
    };
  };
}

export default function ProwlarrSettings() {
  const queryClient = useQueryClient();

  // Settings panels aren't kept open; fetch-on-mount, no polling.
  const configQ = useQuery({
    queryKey: ["config", "main"],
    queryFn: ({ signal }) =>
      api.get<ConfigMain>("/config/main", { signal }).then((r) => r.data),
  });

  const saved = configQ.data?.providers?.prowlarr;
  const savedUrl = saved?.url ?? "";
  const savedApikey = saved?.apikey ?? "";

  // Nullable-initial pattern: `null` = use saved value, edits switch to
  // string. Avoids a useEffect to sync server data into local state.
  const [draftUrl, setDraftUrl] = useState<string | null>(null);
  const [draftApikey, setDraftApikey] = useState<string | null>(null);

  const url = draftUrl ?? savedUrl;
  const apikey = draftApikey ?? savedApikey;
  const dirty = url !== savedUrl || apikey !== savedApikey;
  const canConnect = url.trim().length > 0 && apikey.trim().length > 0;

  // Shared cache with EpisodeSearchModal; filter on `manager` below.
  const providersQ = useQuery({
    queryKey: ["providers"],
    queryFn: ({ signal }) =>
      api.get<ProviderSummary[]>("/providers", { signal }).then((r) => r.data),
  });

  const importedByName = useMemo(() => {
    const map = new Map<string, ProviderSummary>();
    for (const p of providersQ.data ?? []) {
      if (p.manager === "prowlarr" && p.idManager) {
        map.set(p.idManager, p);
      }
    }
    return map;
  }, [providersQ.data]);

  const saveConfig = useMutation({
    mutationFn: () =>
      api.patch("/config/main", {
        providers: { prowlarr: { url, apikey } },
      }),
    onSuccess: () => {
      // Reset drafts so `dirty` flips back to false.
      setDraftUrl(null);
      setDraftApikey(null);
      queryClient.invalidateQueries({ queryKey: ["config", "main"] });
    },
  });

  // Uses current form values (preview before save). Add still needs saved
  // config because the backend reads app.PROWLARR_URL. Mutation .data
  // survives a subsequent failing refresh — table stays populated.
  const refreshIndexers = useMutation({
    mutationFn: () =>
      api
        .post<ProwlarrIndexer[]>("/providers/prowlarr/operation", {
          type: "GETINDEXERS",
          url,
          apikey,
        })
        .then((r) => r.data),
  });

  const indexers = refreshIndexers.data ?? null;
  const fetchError = refreshIndexers.error
    ? extractErrorMessage(refreshIndexers.error)
    : null;

  // While pending, isSuccess/isError flip false — no manual reset needed.
  const testConnection = useMutation({
    mutationFn: () =>
      api.post("/providers/prowlarr/operation", {
        type: "TEST",
        url,
        apikey,
      }),
  });

  const addIndexer = useMutation({
    mutationFn: (indexer: ProwlarrIndexer) =>
      api.post("/providers/prowlarr", {
        id: indexer.id,
        name: indexer.name,
        subType: indexer.protocol === "torrent" ? "torznab" : "newznab",
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["providers"] }),
  });

  const removeIndexer = useMutation({
    mutationFn: ({ provider }: { provider: ProviderSummary }) =>
      api.delete(`/providers/${provider.subType}/${provider.id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["providers"] }),
  });

  // Auto-fetch on mount with stored config; also after Save invalidates it.
  const refreshIndexersMutate = refreshIndexers.mutate;
  useEffect(() => {
    if (savedUrl && savedApikey) refreshIndexersMutate();
  }, [savedUrl, savedApikey, refreshIndexersMutate]);

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center gap-2">
        <Link to="/settings" className="btn btn-ghost btn-sm gap-1">
          <ChevronLeft size={16} /> Settings
        </Link>
      </div>

      <header>
        <h1 className="text-2xl font-bold">Prowlarr</h1>
        <p className="text-sm text-base-content/60 mt-1">
          Browse and import indexers from your Prowlarr server. Searches still
          go through Prowlarr at runtime; this panel just copies the
          Prowlarr-proxied URL + your API key into Medusa's provider list.
        </p>
      </header>

      <section className="card bg-base-100 border border-base-300 rounded-box">
        <div className="card-body p-4 pt-3">
          <fieldset className="fieldset">
            <legend className="fieldset-legend">Prowlarr URL</legend>
            <input
              type="url"
              className="input input-sm w-full"
              placeholder="http://prowlarr:9696"
              value={url}
              onChange={(e) => setDraftUrl(e.target.value)}
              spellCheck={false}
            />
          </fieldset>

          <fieldset className="fieldset">
            <legend className="fieldset-legend">API key</legend>
            <SecretInput value={apikey} onChange={setDraftApikey} withLabel />
          </fieldset>

          <div className="mt-2 flex items-center gap-2 flex-wrap pt-2">
            <button
              type="button"
              className="btn btn-sm btn-primary"
              onClick={() => saveConfig.mutate()}
              disabled={!dirty || !canConnect || saveConfig.isPending}
            >
              {saveConfig.isPending ? (
                <span className="loading loading-spinner loading-xs" />
              ) : (
                "Save"
              )}
            </button>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => testConnection.mutate()}
              disabled={!canConnect || testConnection.isPending}
            >
              {testConnection.isPending ? (
                <span className="loading loading-spinner loading-xs" />
              ) : (
                "Test"
              )}
            </button>
            <button
              type="button"
              className="btn btn-sm gap-1"
              onClick={() => refreshIndexers.mutate()}
              disabled={!canConnect || refreshIndexers.isPending}
            >
              <RefreshCw
                size={14}
                className={refreshIndexers.isPending ? "animate-spin" : ""}
              />
              Refresh indexers
            </button>

            {testConnection.isSuccess && (
              <span className="text-sm text-success inline-flex items-center gap-1">
                <Check size={14} /> Connected
              </span>
            )}
            {testConnection.isError && (
              <span
                className="text-sm text-error inline-flex items-center gap-1"
                title={extractErrorMessage(testConnection.error)}
              >
                <TriangleAlert size={14} /> Couldn't connect
              </span>
            )}
            {saveConfig.isError && (
              <span className="text-sm text-error inline-flex items-center gap-1">
                <TriangleAlert size={14} /> Save failed
              </span>
            )}
          </div>

          {dirty && (
            <div className="mt-2 alert alert-soft alert-warning text-xs">
              <TriangleAlert size={14} />
              Unsaved changes. Save before importing indexers — the backend
              reuses the stored URL / API key when adding new ones.
            </div>
          )}
        </div>
      </section>

      <section className="card bg-base-100 border border-base-300 rounded-box">
        <div className="card-body p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-semibold">Indexers</h2>
            {indexers && (
              <span className="text-xs text-base-content/60">
                {indexers.length} in Prowlarr · {importedByName.size} imported
              </span>
            )}
          </div>

          {!canConnect && (
            <div className="text-sm text-base-content/60 italic py-4 text-center">
              Enter your Prowlarr URL and API key to browse indexers.
            </div>
          )}

          {canConnect && refreshIndexers.isPending && indexers === null && (
            <div className="flex justify-center py-8">
              <span className="loading loading-spinner" />
            </div>
          )}

          {fetchError && (
            <div className="alert alert-soft alert-error text-sm">
              <TriangleAlert size={14} />
              <div className="flex-1">
                Couldn't fetch indexers from Prowlarr.{" "}
                <span className="text-xs opacity-70">{fetchError}</span>
              </div>
            </div>
          )}

          {indexers && indexers.length > 0 && (
            <div className="overflow-x-auto rounded-box border-2 border-base-300">
              <table className="table table-sm">
                <thead>
                  <tr>
                    <th className="w-20">Status</th>
                    <th>Name</th>
                    <th className="w-32">Protocol</th>
                    <th className="w-24">Privacy</th>
                    <th className="w-32"></th>
                  </tr>
                </thead>
                <tbody>
                  {[...indexers]
                    .sort((a, b) => a.name.localeCompare(b.name))
                    .map((idx) => {
                      const imported = importedByName.get(idx.name);
                      return (
                        <IndexerRow
                          key={idx.id}
                          indexer={idx}
                          imported={imported}
                          dirty={dirty}
                          adding={
                            addIndexer.isPending &&
                            addIndexer.variables?.id === idx.id
                          }
                          removing={
                            removeIndexer.isPending &&
                            removeIndexer.variables?.provider.id ===
                              imported?.id
                          }
                          onAdd={() => addIndexer.mutate(idx)}
                          onRemove={() =>
                            imported &&
                            removeIndexer.mutate({ provider: imported })
                          }
                        />
                      );
                    })}
                </tbody>
              </table>
            </div>
          )}

          {indexers && indexers.length === 0 && !fetchError && (
            <div className="text-sm text-base-content/60 italic py-4 text-center">
              No indexers configured in Prowlarr.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function IndexerRow({
  indexer,
  imported,
  dirty,
  adding,
  removing,
  onAdd,
  onRemove,
}: {
  indexer: ProwlarrIndexer;
  imported: ProviderSummary | undefined;
  dirty: boolean;
  adding: boolean;
  removing: boolean;
  onAdd: () => void;
  onRemove: () => void;
}) {
  return (
    <tr>
      <td>
        {imported ? (
          <span className="badge badge-sm badge-success gap-1">
            <Check size={12} /> imported
          </span>
        ) : (
          <span className="text-xs text-base-content/40">—</span>
        )}
      </td>
      <td className="font-medium">{indexer.name}</td>
      <td>
        <span
          className={`badge badge-xs ${
            indexer.protocol === "torrent" ? "badge-info" : "badge-neutral"
          }`}
        >
          {indexer.protocol}
        </span>
      </td>
      <td>
        {indexer.privacy && (
          <span className="text-xs text-base-content/60">
            {indexer.privacy}
          </span>
        )}
      </td>
      <td className="text-right">
        {imported ? (
          <button
            type="button"
            className="btn btn-xs btn-ghost text-error gap-1"
            onClick={onRemove}
            disabled={removing}
            title="Remove from Medusa (does not touch Prowlarr)"
          >
            {removing ? (
              <span className="loading loading-spinner loading-xs" />
            ) : (
              <Trash2 size={12} />
            )}
            Remove
          </button>
        ) : (
          <button
            type="button"
            className="btn btn-xs btn-primary gap-1"
            onClick={onAdd}
            disabled={adding || dirty}
            title={
              dirty
                ? "Save the Prowlarr URL / API key first"
                : "Import this indexer as a Medusa provider"
            }
          >
            {adding ? (
              <span className="loading loading-spinner loading-xs" />
            ) : (
              <Download size={12} />
            )}
            Add
          </button>
        )}
      </td>
    </tr>
  );
}

function extractErrorMessage(err: unknown): string {
  if (typeof err === "object" && err && "message" in err) {
    return String((err as { message: unknown }).message);
  }
  return String(err);
}
