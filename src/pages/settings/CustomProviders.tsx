import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronLeft,
  Plus,
  Trash2,
  TriangleAlert,
  Check,
  EyeIcon,
  EyeOffIcon,
  RefreshCw,
} from "lucide-react";
import api from "../../lib/api";
import type { ProviderSummary } from "../../types/medusa";

type CustomSubType = "newznab" | "torznab" | "torrentrss";

export default function CustomProviders() {
  const [tab, setTab] = useState<CustomSubType>("newznab");

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center gap-2">
        <Link to="/settings" className="btn btn-ghost btn-sm gap-1">
          <ChevronLeft size={16} /> Settings
        </Link>
      </div>

      <header>
        <h1 className="text-2xl font-bold">Custom providers</h1>
        <p className="text-sm text-base-content/60 mt-1">
          Add Newznab / Torznab / TorrentRSS providers directly without going
          through Prowlarr. Useful for direct site sign-ups (NZBgeek, DOGnzb,
          drunkenslug…), Jackett, or private trackers that only expose RSS.
        </p>
      </header>

      <div role="tablist" className="tabs tabs-box w-fit">
        <button
          role="tab"
          className={`tab ${tab === "newznab" ? "tab-active" : ""}`}
          onClick={() => setTab("newznab")}
        >
          Newznab
        </button>
        <button
          role="tab"
          className={`tab ${tab === "torznab" ? "tab-active" : ""}`}
          onClick={() => setTab("torznab")}
        >
          Torznab
        </button>
        <button
          role="tab"
          className={`tab ${tab === "torrentrss" ? "tab-active" : ""}`}
          onClick={() => setTab("torrentrss")}
        >
          TorrentRSS
        </button>
      </div>

      {tab === "torrentrss" ? (
        <TorrentRssPanel />
      ) : (
        <CapsPanel subType={tab} />
      )}
    </div>
  );
}

// Shared Newznab/Torznab panel — the two subtypes differ only by the endpoint
// they target and the field labelling ("URL" vs "Torznab URL").
function CapsPanel({ subType }: { subType: "newznab" | "torznab" }) {
  const queryClient = useQueryClient();
  const providersQ = useQuery({
    queryKey: ["providers"],
    queryFn: ({ signal }) =>
      api.get<ProviderSummary[]>("/providers", { signal }).then((r) => r.data),
  });

  const customs = useMemo(
    () =>
      (providersQ.data ?? []).filter((p) => p.subType === subType),
    [providersQ.data, subType],
  );

  const [selectedId, setSelectedId] = useState<string | "#add">("#add");
  const selected =
    selectedId === "#add" ? null : customs.find((p) => p.id === selectedId);

  // Form state for "add new". Edits go through `EditCaps` directly on the
  // selected provider's saved values.
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [apikey, setApikey] = useState("");
  const [showApikey, setShowApikey] = useState(false);

  const addProvider = useMutation({
    mutationFn: () =>
      api.post(`/providers/${subType}`, { name, url, apikey }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["providers"] });
      // Switch to the newly added provider — find it after refetch.
      const refreshed = await queryClient.fetchQuery<ProviderSummary[]>({
        queryKey: ["providers"],
      });
      const justAdded = refreshed
        .filter((p) => p.subType === subType)
        .find((p) => p.name === name || p.name.startsWith(`${name}_`));
      if (justAdded) setSelectedId(justAdded.id);
      setName("");
      setUrl("");
      setApikey("");
    },
  });

  const canAdd =
    name.trim().length > 0 && url.trim().length > 0 && apikey.trim().length > 0;

  return (
    <div className="space-y-6">
      <fieldset className="fieldset max-w-md">
        <legend className="fieldset-legend">Select provider</legend>
        <select
          className="select select-sm w-full"
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
        >
          <option value="#add">— Add a new provider —</option>
          {customs.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
              {p.default ? " (built-in)" : ""}
              {p.manager === "prowlarr" ? " (Prowlarr)" : ""}
            </option>
          ))}
        </select>
      </fieldset>

      {selectedId === "#add" ? (
        <section className="card bg-base-100 border-2 border-base-300 rounded-box">
          <div className="card-body p-4 space-y-3">
            <h2 className="font-semibold">Add a new {subType} provider</h2>
            <fieldset className="fieldset">
              <legend className="fieldset-legend">Provider name</legend>
              <input
                className="input input-sm w-full"
                value={name}
                onChange={(e) => setName(e.target.value)}
                spellCheck={false}
                placeholder={subType === "newznab" ? "NZBgeek" : "Jackett site"}
              />
            </fieldset>
            <fieldset className="fieldset">
              <legend className="fieldset-legend">
                {subType === "newznab" ? "Site URL" : "Torznab URL"}
              </legend>
              <input
                type="url"
                className="input input-sm w-full"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                spellCheck={false}
                placeholder="https://…"
              />
            </fieldset>
            <fieldset className="fieldset">
              <legend className="fieldset-legend">API key</legend>
              <div className="join w-full">
                <input
                  type={showApikey ? "text" : "password"}
                  className="input input-sm join-item flex-1"
                  value={apikey}
                  onChange={(e) => setApikey(e.target.value)}
                  spellCheck={false}
                  autoComplete="off"
                />
                <button
                  type="button"
                  className="btn btn-sm join-item"
                  onClick={() => setShowApikey((v) => !v)}
                >
                  {showApikey ? (
                    <EyeOffIcon size={12} />
                  ) : (
                    <EyeIcon size={12} />
                  )}
                </button>
              </div>
            </fieldset>

            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                className="btn btn-sm btn-primary gap-1"
                onClick={() => addProvider.mutate()}
                disabled={!canAdd || addProvider.isPending}
              >
                {addProvider.isPending ? (
                  <span className="loading loading-spinner loading-xs" />
                ) : (
                  <Plus size={14} />
                )}
                Add provider
              </button>
              {addProvider.isError && (
                <span className="text-xs text-error inline-flex items-center gap-1">
                  <TriangleAlert size={12} /> Add failed
                </span>
              )}
              {addProvider.isSuccess && (
                <span className="text-xs text-success inline-flex items-center gap-1">
                  <Check size={12} /> Added — switched to it
                </span>
              )}
            </div>
          </div>
        </section>
      ) : selected ? (
        <EditCaps
          provider={selected}
          subType={subType}
          onRemoved={() => setSelectedId("#add")}
        />
      ) : null}
    </div>
  );
}

function EditCaps({
  provider,
  subType,
  onRemoved,
}: {
  provider: ProviderSummary;
  subType: "newznab" | "torznab";
  onRemoved: () => void;
}) {
  const queryClient = useQueryClient();

  // Mirror the saved values, then patch on save.
  const [url, setUrl] = useState(provider.config.url ?? "");
  const [apikey, setApikey] = useState(provider.config.apikey ?? "");
  const [showApikey, setShowApikey] = useState(false);

  const save = useMutation({
    mutationFn: () =>
      api.patch(`/providers/${provider.id}`, {
        ...provider.config,
        url,
        apikey,
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["providers"] }),
  });

  const removeProvider = useMutation({
    mutationFn: () =>
      api.delete(`/providers/${subType}/${provider.id}`),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["providers"] });
      onRemoved();
    },
  });

  const canRemove = !provider.default && provider.manager !== "prowlarr";
  const dirty =
    url !== (provider.config.url ?? "") ||
    apikey !== (provider.config.apikey ?? "");

  return (
    <section className="card bg-base-100 border-2 border-base-300 rounded-box">
      <div className="card-body p-4 space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h2 className="font-semibold">{provider.name}</h2>
          {provider.manager === "prowlarr" && (
            <span className="badge badge-sm badge-info">
              managed by Prowlarr
            </span>
          )}
          {provider.default && (
            <span className="badge badge-sm badge-ghost">built-in</span>
          )}
        </div>

        <fieldset className="fieldset">
          <legend className="fieldset-legend">Name</legend>
          <input
            className="input input-sm w-full"
            value={provider.name}
            disabled
          />
        </fieldset>

        <fieldset className="fieldset">
          <legend className="fieldset-legend">
            {subType === "newznab" ? "Site URL" : "Torznab URL"}
          </legend>
          <input
            type="url"
            className="input input-sm w-full"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            spellCheck={false}
          />
        </fieldset>

        <fieldset className="fieldset">
          <legend className="fieldset-legend">API key</legend>
          <div className="join w-full">
            <input
              type={showApikey ? "text" : "password"}
              className="input input-sm join-item flex-1"
              value={apikey}
              onChange={(e) => setApikey(e.target.value)}
              spellCheck={false}
              autoComplete="off"
            />
            <button
              type="button"
              className="btn btn-sm join-item"
              onClick={() => setShowApikey((v) => !v)}
            >
              {showApikey ? <EyeOffIcon size={12} /> : <EyeIcon size={12} />}
            </button>
          </div>
        </fieldset>

        <p className="text-xs text-base-content/60">
          Use{" "}
          <Link
            to="/settings/providers"
            className="link link-hover text-primary"
          >
            Search providers
          </Link>{" "}
          to set search modes, categories, daily/backlog toggles, and other
          per-provider settings.
        </p>

        <div className="flex items-center gap-2 pt-2 flex-wrap">
          <button
            type="button"
            className="btn btn-sm btn-primary"
            onClick={() => save.mutate()}
            disabled={!dirty || save.isPending}
          >
            {save.isPending ? (
              <span className="loading loading-spinner loading-xs" />
            ) : (
              "Save"
            )}
          </button>
          <button
            type="button"
            className="btn btn-sm btn-error gap-1"
            onClick={() => removeProvider.mutate()}
            disabled={!canRemove || removeProvider.isPending}
            title={
              canRemove
                ? `Delete ${provider.name}`
                : provider.default
                  ? "Built-in providers can't be deleted"
                  : "Prowlarr-imported providers should be removed from the Prowlarr settings panel"
            }
          >
            <Trash2 size={14} />
            Delete
          </button>
          {save.isError && (
            <span className="text-xs text-error inline-flex items-center gap-1">
              <TriangleAlert size={12} /> Save failed
            </span>
          )}
          {save.isSuccess && !dirty && (
            <span className="text-xs text-success inline-flex items-center gap-1">
              <Check size={12} /> Saved
            </span>
          )}
        </div>
      </div>
    </section>
  );
}

function TorrentRssPanel() {
  const queryClient = useQueryClient();
  const providersQ = useQuery({
    queryKey: ["providers"],
    queryFn: ({ signal }) =>
      api.get<ProviderSummary[]>("/providers", { signal }).then((r) => r.data),
  });

  const customs = useMemo(
    () =>
      (providersQ.data ?? []).filter((p) => p.subType === "torrentrss"),
    [providersQ.data],
  );

  const [selectedId, setSelectedId] = useState<string | "#add">("#add");
  const selected =
    selectedId === "#add" ? null : customs.find((p) => p.id === selectedId);

  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [cookies, setCookies] = useState("");
  const [titleTag, setTitleTag] = useState("title");

  const addProvider = useMutation({
    mutationFn: () =>
      api.post(`/providers/torrentrss`, {
        name,
        url,
        // Backend reads cookies via `data.get('cookies', {}).get('values')`.
        cookies: { values: cookies },
        titleTag,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["providers"] });
      const refreshed = await queryClient.fetchQuery<ProviderSummary[]>({
        queryKey: ["providers"],
      });
      const justAdded = refreshed
        .filter((p) => p.subType === "torrentrss")
        .find((p) => p.name === name || p.name.startsWith(`${name}_`));
      if (justAdded) setSelectedId(justAdded.id);
      setName("");
      setUrl("");
      setCookies("");
      setTitleTag("title");
    },
  });

  const removeProvider = useMutation({
    mutationFn: (id: string) => api.delete(`/providers/torrentrss/${id}`),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["providers"] });
      setSelectedId("#add");
    },
  });

  const canAdd =
    name.trim().length > 0 && url.trim().length > 0 && titleTag.trim().length > 0;

  return (
    <div className="space-y-6">
      <fieldset className="fieldset max-w-md">
        <legend className="fieldset-legend">Select provider</legend>
        <select
          className="select select-sm w-full"
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
        >
          <option value="#add">— Add a new provider —</option>
          {customs.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </fieldset>

      {selectedId === "#add" ? (
        <section className="card bg-base-100 border-2 border-base-300 rounded-box">
          <div className="card-body p-4 space-y-3">
            <h2 className="font-semibold">Add a TorrentRSS provider</h2>
            <fieldset className="fieldset">
              <legend className="fieldset-legend">Provider name</legend>
              <input
                className="input input-sm w-full"
                value={name}
                onChange={(e) => setName(e.target.value)}
                spellCheck={false}
              />
            </fieldset>
            <fieldset className="fieldset">
              <legend className="fieldset-legend">RSS URL</legend>
              <input
                type="url"
                className="input input-sm w-full"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                spellCheck={false}
              />
            </fieldset>
            <fieldset className="fieldset">
              <legend className="fieldset-legend">Cookies (optional)</legend>
              <input
                className="input input-sm w-full"
                value={cookies}
                onChange={(e) => setCookies(e.target.value)}
                spellCheck={false}
                autoComplete="off"
                placeholder="uid=1234; pass=abcd"
              />
            </fieldset>
            <fieldset className="fieldset">
              <legend className="fieldset-legend">Title element</legend>
              <input
                className="input input-sm w-full"
                value={titleTag}
                onChange={(e) => setTitleTag(e.target.value)}
              />
              <p className="text-xs text-base-content/50 mt-1">
                XML element inside each &lt;item&gt; that holds the release
                name. Defaults to <code>title</code>; some feeds use{" "}
                <code>description</code> or a custom tag.
              </p>
            </fieldset>

            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                className="btn btn-sm btn-primary gap-1"
                onClick={() => addProvider.mutate()}
                disabled={!canAdd || addProvider.isPending}
              >
                {addProvider.isPending ? (
                  <span className="loading loading-spinner loading-xs" />
                ) : (
                  <Plus size={14} />
                )}
                Add provider
              </button>
              {addProvider.isError && (
                <span className="text-xs text-error inline-flex items-center gap-1">
                  <TriangleAlert size={12} /> Add failed
                </span>
              )}
              {addProvider.isSuccess && (
                <span className="text-xs text-success inline-flex items-center gap-1">
                  <Check size={12} /> Added — switched to it
                </span>
              )}
            </div>
          </div>
        </section>
      ) : selected ? (
        <section className="card bg-base-100 border-2 border-base-300 rounded-box">
          <div className="card-body p-4 space-y-3">
            <h2 className="font-semibold">{selected.name}</h2>
            <p className="text-xs text-base-content/60">
              TorrentRSS providers are edited via{" "}
              <Link
                to="/settings/providers"
                className="link link-hover text-primary"
              >
                Search providers
              </Link>{" "}
              (URL / cookies live under the common search config). This panel
              just lets you remove them.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                className="btn btn-sm btn-error gap-1"
                onClick={() => removeProvider.mutate(selected.id)}
                disabled={removeProvider.isPending}
              >
                <Trash2 size={14} /> Delete
              </button>
              {removeProvider.isError && (
                <span className="text-xs text-error inline-flex items-center gap-1">
                  <TriangleAlert size={12} /> Delete failed
                </span>
              )}
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}

export function CategoryEditor({
  provider,
  catIds,
  onChange,
}: {
  provider: ProviderSummary;
  catIds: string[];
  onChange: (next: string[]) => void;
}) {
  // GETCATEGORIES return shape: Capabilities namedtuple._asdict() →
  // { success, categories: [{id,name}], params, message }.
  type Caps = {
    success: boolean;
    categories: { id: string; name: string }[];
    params: string[];
    message: string;
  };

  const fetchCats = useMutation({
    mutationFn: () =>
      api
        .post<{ result: Caps }>(
          `/providers/${provider.subType}/operation`,
          {
            type: "GETCATEGORIES",
            name: provider.name,
            url: provider.config.url,
            apikey: provider.config.apikey,
          },
        )
        .then((r) => r.data.result),
  });

  const available = fetchCats.data?.categories ?? [];
  const knownById = new Map(available.map((c) => [c.id, c.name]));

  // Show selected first, then any newly fetched ones not yet selected.
  const allIds = Array.from(
    new Set<string>([...catIds, ...available.map((c) => c.id)]),
  );

  const toggle = (id: string) => {
    if (catIds.includes(id)) onChange(catIds.filter((x) => x !== id));
    else onChange([...catIds, id]);
  };

  const [manual, setManual] = useState("");

  return (
    <fieldset className="fieldset">
      <legend className="fieldset-legend text-xs">Categories</legend>

      <div className="flex items-center gap-2 flex-wrap mb-2">
        <button
          type="button"
          className="btn btn-xs gap-1"
          onClick={() => fetchCats.mutate()}
          disabled={
            !provider.config.url ||
            !provider.config.apikey ||
            fetchCats.isPending
          }
          title={
            !provider.config.url || !provider.config.apikey
              ? "Save URL + API key first"
              : "Query the provider's t=caps endpoint"
          }
        >
          <RefreshCw
            size={12}
            className={fetchCats.isPending ? "animate-spin" : ""}
          />
          Fetch from provider
        </button>
        {fetchCats.isError && (
          <span className="text-xs text-error inline-flex items-center gap-1">
            <TriangleAlert size={12} /> Couldn't fetch
          </span>
        )}
        {fetchCats.isSuccess && !fetchCats.data?.success && (
          <span className="text-xs text-warning inline-flex items-center gap-1">
            <TriangleAlert size={12} /> {fetchCats.data?.message}
          </span>
        )}
      </div>

      {allIds.length === 0 ? (
        <p className="text-xs text-base-content/50">
          No categories set. Fetch from the provider or add one manually.
        </p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {allIds.map((id) => {
            const checked = catIds.includes(id);
            const name = knownById.get(id);
            return (
              <button
                key={id}
                type="button"
                onClick={() => toggle(id)}
                className={`badge badge-sm gap-1 cursor-pointer ${
                  checked ? "badge-primary" : "badge-ghost"
                }`}
                title={name ? `${id} — ${name}` : `Category id ${id}`}
              >
                {checked ? <Check size={10} /> : null}
                {id}
                {name && <span className="opacity-60">· {name}</span>}
              </button>
            );
          })}
        </div>
      )}

      <div className="flex gap-2 mt-2">
        <input
          className="input input-xs flex-1"
          placeholder="Add a category id manually…"
          value={manual}
          onChange={(e) => setManual(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && manual.trim()) {
              e.preventDefault();
              const id = manual.trim();
              if (!catIds.includes(id)) onChange([...catIds, id]);
              setManual("");
            }
          }}
        />
      </div>
      <p className="text-xs text-base-content/50 mt-1">
        Newznab/Torznab cat IDs. Standard TV codes are typically 5000-5999.
        The backend sends these to the provider's API as the <code>cat</code>{" "}
        parameter.
      </p>
    </fieldset>
  );
}
