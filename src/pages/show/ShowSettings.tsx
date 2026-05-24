import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, Plus, TriangleAlert, X } from "lucide-react";
import api from "../../lib/api";
import { pushToast } from "../../lib/toasts";
import { useEditSeries } from "../../lib/series-actions";
import { DEFAULT_EPISODE_STATUSES, LANGUAGE_OPTIONS, type Series } from "../../types/medusa";
import ConfirmDialog from "../../components/ConfirmDialog";
import Toggle from "../../components/forms/Toggle";
import QualityPicker from "../../components/forms/QualityPicker";
import FolderPicker from "../../components/forms/FolderPicker";
import TagInput from "../../components/forms/TagInput";

// /api/v2/alias?series=<slug> returns one row per scene exception attached to
// this show. `type === 'local'` means user-added (deletable); null means it
// came from the global sync (XEM / AniDB / Medusa wiki) — read-only because
// the next sync would re-add it.
interface SceneAlias {
  id: number;
  series: string;
  name: string;
  season: number | null;
  type: "local" | null;
}

function seasonLabel(s: number): string {
  if (s === 0) return "Specials";
  return `Season ${s}`;
}

export default function ShowSettings() {
  const { slug = "" } = useParams<{ slug: string }>();

  const { data: show, isLoading } = useQuery({
    queryKey: ["series", slug, "detailed"],
    queryFn: ({ signal }) =>
      api
        .get<Series>(`/series/${slug}`, { signal, params: { detailed: true } })
        .then((r) => r.data),
    enabled: !!slug,
  });

  if (isLoading || !show) {
    return (
      <div className="flex justify-center py-20">
        <span className="loading loading-spinner loading-lg" />
      </div>
    );
  }

  return <SettingsForm show={show} />;
}

interface FormState {
  location: string;
  paused: boolean;
  language: string;
  defaultEpisodeStatus: string;
  qualityAllowed: number[];
  qualityPreferred: number[];
  anime: boolean;
  scene: boolean;
  subtitlesEnabled: boolean;
  seasonFolders: boolean;
  dvdOrder: boolean;
  airByDate: boolean;
  ignoredWords: string[];
  ignoredWordsExclude: boolean;
  requiredWords: string[];
  requiredWordsExclude: boolean;
}

function formFromShow(show: Series): FormState {
  const c = show.config;
  return {
    location: c.location ?? "",
    paused: !!c.paused,
    language: show.language ?? "",
    defaultEpisodeStatus: c.defaultEpisodeStatus ?? "Skipped",
    qualityAllowed: c.qualities?.allowed ?? [],
    qualityPreferred: c.qualities?.preferred ?? [],
    anime: !!c.anime,
    scene: !!c.scene,
    subtitlesEnabled: !!c.subtitlesEnabled,
    seasonFolders: c.seasonFolders ?? true,
    dvdOrder: !!c.dvdOrder,
    airByDate: !!c.airByDate,
    ignoredWords: c.release?.ignoredWords ?? [],
    ignoredWordsExclude: !!c.release?.ignoredWordsExclude,
    requiredWords: c.release?.requiredWords ?? [],
    requiredWordsExclude: !!c.release?.requiredWordsExclude,
  };
}

function SettingsForm({ show }: { show: Series }) {
  const navigate = useNavigate();
  const editSeries = useEditSeries(show.id.slug);
  // Local form state survives background refetches of the server cache.
  const [form, setForm] = useState<FormState>(() => formFromShow(show));

  const handleSave = () => {
    const body: Record<string, unknown> = {
      language: form.language,
      "config.paused": form.paused,
      "config.defaultEpisodeStatus": form.defaultEpisodeStatus,
      "config.qualities.allowed": form.qualityAllowed,
      "config.qualities.preferred": form.qualityPreferred,
      "config.anime": form.anime,
      "config.scene": form.scene,
      "config.subtitlesEnabled": form.subtitlesEnabled,
      "config.seasonFolders": form.seasonFolders,
      "config.dvdOrder": form.dvdOrder,
      "config.airByDate": form.airByDate,
      "config.release.ignoredWords": form.ignoredWords,
      "config.release.ignoredWordsExclude": form.ignoredWordsExclude,
      "config.release.requiredWords": form.requiredWords,
      "config.release.requiredWordsExclude": form.requiredWordsExclude,
    };
    // Only patch location when the user has actually changed it — saves a
    // potential refresh side effect when the field is just being saved with
    // the rest of the form unchanged.
    if (form.location !== show.config.location) {
      body["config.location"] = form.location;
    }
    editSeries.mutate(body);
  };

  return (
    <div className="max-w-xl mx-auto pt-8 space-y-6">
      <div className="flex items-center justify-between">
        <Link
          to={`/show/${show.id.slug}`}
          className="btn btn-ghost btn-sm gap-1"
        >
          <ChevronLeft size={16} /> {show.title}
        </Link>
      </div>

      <h1 className="text-2xl font-bold">Show settings</h1>

      <fieldset className="fieldset w-full">
        <legend className="fieldset-legend">Location</legend>
        <FolderPicker
          value={form.location}
          onChange={(v) => setForm((s) => ({ ...s, location: v }))}
        />
        {form.location !== show.config.location && (
          <div className="alert alert-soft alert-warning text-xs mt-2 items-start">
            <TriangleAlert size={14} className="mt-0.5 shrink-0" />
            <span>
              Medusa won't move the files. To move a show: pause it so other
              background jobs will not interfere, move the folder on disk
              yourself, update this path, then trigger a refresh.
            </span>
          </div>
        )}
      </fieldset>

      <fieldset className="fieldset w-full">
        <legend className="fieldset-legend">Info Language</legend>
        <select
          className="select w-full"
          value={form.language}
          onChange={(e) =>
            setForm((s) => ({ ...s, language: e.target.value }))
          }
        >
          {LANGUAGE_OPTIONS.map((o) => (
            <option key={o.code} value={o.code}>
              {o.label}
            </option>
          ))}
        </select>
        <p className="label whitespace-normal">
          This only applies to episode filenames and the contents of metadata
          files.
        </p>
      </fieldset>

      <fieldset className="fieldset w-full">
        <legend className="fieldset-legend">Default Episode Status</legend>
        <select
          className="select w-full"
          value={form.defaultEpisodeStatus}
          onChange={(e) =>
            setForm((s) => ({ ...s, defaultEpisodeStatus: e.target.value }))
          }
        >
          {DEFAULT_EPISODE_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <p className="label whitespace-normal">
          Applied to newly aired episodes once Medusa picks them up from the
          indexer.
        </p>
      </fieldset>

      <fieldset className="fieldset w-full">
        <legend className="fieldset-legend">Quality</legend>
        <QualityPicker
          allowed={form.qualityAllowed}
          preferred={form.qualityPreferred}
          onChange={({ allowed, preferred }) =>
            setForm((s) => ({
              ...s,
              qualityAllowed: allowed,
              qualityPreferred: preferred,
            }))
          }
        />
      </fieldset>

      <fieldset className="fieldset w-full">
        <legend className="fieldset-legend mb-1">Behavior</legend>
        <div className="space-y-3">
          <Toggle
            label="Paused"
            hint="Pause searches and daily updates for this show. Medusa will not download new episodes. Useful when you're moving its folder on disk or just want to stop tracking it temporarily."
            checked={form.paused}
            onChange={(v) => setForm((s) => ({ ...s, paused: v }))}
          />
          <Toggle
            label="Anime"
            hint="Absolute episode numbering; matches AniDB / AniList aliases."
            checked={form.anime}
            onChange={(v) => setForm((s) => ({ ...s, anime: v }))}
          />
          <Toggle
            label="Scene numbering"
            hint="Use scene-release season/episode numbers instead of indexer numbers."
            checked={form.scene}
            onChange={(v) => setForm((s) => ({ ...s, scene: v }))}
          />
          <Toggle
            label="Subtitles"
            hint="Search for and download subtitles for episodes."
            checked={form.subtitlesEnabled}
            onChange={(v) => setForm((s) => ({ ...s, subtitlesEnabled: v }))}
          />
          <Toggle
            label="Season folders"
            hint="Organize episodes into Season N subfolders."
            checked={form.seasonFolders}
            onChange={(v) => setForm((s) => ({ ...s, seasonFolders: v }))}
          />
          <Toggle
            label="DVD order"
            hint="Use the DVD-order season/episode numbering."
            checked={form.dvdOrder}
            onChange={(v) => setForm((s) => ({ ...s, dvdOrder: v }))}
          />
          <Toggle
            label="Air by date"
            hint="For shows that air daily, treat date as the episode identifier."
            checked={form.airByDate}
            onChange={(v) => setForm((s) => ({ ...s, airByDate: v }))}
          />
        </div>
      </fieldset>

      <fieldset className="fieldset w-full">
        <legend className="fieldset-legend">Release filters</legend>
        <p className="text-xs text-base-content/50">
          Per-show filter words layered on top of the global lists in{" "}
          <Link to="/settings/search" className="link link-hover font-medium">
            Search settings
          </Link>
          . Press Enter or comma to add a word; matching is case-insensitive.
        </p>

        <div className="space-y-3">
          <div className="space-y-1">
            <label className="label">Ignored words</label>
            <TagInput
              value={form.ignoredWords}
              onChange={(v) => setForm((s) => ({ ...s, ignoredWords: v }))}
              placeholder="e.g. CAM, SCREENER"
            />
            <p className="text-xs text-base-content/50">
              Releases containing any of these words are skipped.
            </p>
          </div>
          <Toggle
            label="Override the global ignored list"
            hint="When off (default), these words are added to the global ignored list for this show. When on, they are subtracted. Use this to allow words that the global list would otherwise filter out."
            checked={form.ignoredWordsExclude}
            onChange={(v) => setForm((s) => ({ ...s, ignoredWordsExclude: v }))}
          />

          <div className="space-y-1 pt-3 border-t border-base-300/60">
            <label className="label">Required words</label>
            <TagInput
              value={form.requiredWords}
              onChange={(v) => setForm((s) => ({ ...s, requiredWords: v }))}
              placeholder="e.g. PROPER, REPACK"
            />
            <p className="text-xs text-base-content/50">
              A release must contain at least one of these to be considered.
            </p>
          </div>
          <Toggle
            label="Override the global required list"
            hint="When off, these words are appended to the global required list for this show. When on, they are subtracted. Use this to relax a global requirement just for this show."
            checked={form.requiredWordsExclude}
            onChange={(v) =>
              setForm((s) => ({ ...s, requiredWordsExclude: v }))
            }
          />
        </div>
      </fieldset>

      <SceneAliasesPanel show={show} />

      <ChangeIndexerPanel show={show} />

      {editSeries.isError && (
        <div className="alert alert-soft alert-error text-sm">
          Failed to save changes. Try again.
        </div>
      )}
      {editSeries.isSuccess && (
        <div className="alert alert-soft alert-success text-sm">Saved.</div>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          className="btn btn-ghost flex-1"
          onClick={() => navigate(`/show/${show.id.slug}`)}
          disabled={editSeries.isPending}
        >
          Cancel
        </button>
        <button
          type="button"
          className="btn btn-primary flex-1"
          onClick={handleSave}
          disabled={editSeries.isPending}
        >
          {editSeries.isPending ? (
            <span className="loading loading-spinner loading-sm" />
          ) : (
            "Save"
          )}
        </button>
      </div>
    </div>
  );
}

function SceneAliasesPanel({ show }: { show: Series }) {
  const queryClient = useQueryClient();
  const slug = show.id.slug;

  const aliasesQ = useQuery({
    queryKey: ["aliases", slug],
    queryFn: ({ signal }) =>
      api
        .get<SceneAlias[]>("/alias", { signal, params: { series: slug } })
        .then((r) => r.data),
    staleTime: 60_000,
  });

  // Sort: synced first (read-only, alpha by season then name), then custom
  // (also alpha). Keeps the user's own additions grouped together at the
  // bottom for quick scanning.
  const aliases = [...(aliasesQ.data ?? [])].sort((a, b) => {
    if (a.type !== b.type) return a.type === null ? -1 : 1;
    const seasonA = a.season ?? -1;
    const seasonB = b.season ?? -1;
    if (seasonA !== seasonB) return seasonA - seasonB;
    return a.name.localeCompare(b.name);
  });

  const [newName, setNewName] = useState("");
  // -1 sentinel = "applies to all seasons" (backend default per alias.py:165).
  const [newSeason, setNewSeason] = useState<number>(-1);

  const addAlias = useMutation({
    mutationFn: (payload: { name: string; season: number }) =>
      api.post<SceneAlias>("/alias", {
        series: slug,
        name: payload.name,
        season: payload.season,
        type: "local",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["aliases", slug] });
      setNewName("");
      pushToast({ title: "Alias added", type: "notice" });
    },
    onError: () => {
      pushToast({
        title: "Couldn't add alias",
        body: "Check the server logs.",
        type: "error",
      });
    },
  });

  const deleteAlias = useMutation({
    mutationFn: (id: number) => api.delete(`/alias/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["aliases", slug] });
      pushToast({ title: "Alias removed", type: "notice" });
    },
    onError: () => {
      pushToast({
        title: "Couldn't remove alias",
        body: "Check the server logs.",
        type: "error",
      });
    },
  });

  const canAdd = newName.trim().length > 0 && !addAlias.isPending;

  return (
    <fieldset className="fieldset w-full">
      <legend className="fieldset-legend">Scene aliases</legend>
      <p className="text-xs text-base-content/50">
        Alternative show titles Medusa will recognize when parsing release
        filenames.<br></br> The <strong>synced</strong> entries come from
        Medusa's wiki, XEM and AniDB and refresh on a schedule. <br></br>
        The <strong>custom</strong> ones below are yours to add or remove.
      </p>

      {aliasesQ.isLoading ? (
        <div className="flex justify-center py-4">
          <span className="loading loading-spinner loading-sm" />
        </div>
      ) : aliases.length === 0 ? (
        <div className="text-xs text-base-content/50 italic py-2">
          No aliases for this show yet.
        </div>
      ) : (
        <ul className="space-y-1 max-h-64 overflow-y-auto pr-1">
          {aliases.map((a) => (
            <li
              key={a.id}
              className="flex items-center gap-2 text-sm bg-base-200/40 rounded px-2 py-1"
            >
              <span className="flex-1 truncate" title={a.name}>
                {a.name}
              </span>
              <span className="badge badge-xs badge-ghost whitespace-nowrap">
                {a.season === null
                  ? "all seasons"
                  : `S${String(a.season).padStart(2, "0")}`}
              </span>
              <span
                className={`badge badge-xs ${
                  a.type === "local" ? "badge-info" : "badge-ghost"
                }`}
                title={
                  a.type === "local"
                    ? "Added by you on this Medusa install"
                    : "Synced from external source — read-only (a refresh would re-add it)"
                }
              >
                {a.type === "local" ? "custom" : "synced"}
              </span>
              {a.type === "local" && (
                <button
                  type="button"
                  className="btn btn-ghost btn-xs btn-square"
                  aria-label={`Remove ${a.name}`}
                  onClick={() => deleteAlias.mutate(a.id)}
                  disabled={deleteAlias.isPending}
                >
                  <X size={12} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-end gap-2 pt-2">
        <label className="flex flex-col gap-1 text-xs flex-1 min-w-48">
          <span className="text-base-content/60">New alias</span>
          <input
            type="text"
            className="input input-sm w-full"
            value={newName}
            placeholder="Alternative show title…"
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && canAdd) {
                e.preventDefault();
                addAlias.mutate({ name: newName.trim(), season: newSeason });
              }
            }}
            spellCheck={false}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-base-content/60">Applies to</span>
          <select
            className="select select-sm"
            value={newSeason}
            onChange={(e) => setNewSeason(Number(e.target.value))}
          >
            <option value={-1}>All seasons</option>
            {(show.seasonCount ?? []).map((s) => (
              <option key={s.season} value={s.season}>
                {seasonLabel(s.season)}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="btn btn-sm gap-1"
          disabled={!canAdd}
          onClick={() =>
            addAlias.mutate({ name: newName.trim(), season: newSeason })
          }
        >
          <Plus size={14} /> Add
        </button>
      </div>
    </fieldset>
  );
}

// -----------------------------------------------------------------------------
// Change indexer
// -----------------------------------------------------------------------------

// Allowed targets (matches legacy slim's manage/select-indexer.vue:29). Other
// keys on `externals` (e.g. tvrage) aren't supported as indexers.
const INDEXER_CHOICES: readonly (keyof Series["externals"])[] = [
  "tvdb",
  "tmdb",
  "tvmaze",
  "imdb",
] as const;

// IMDB IDs round-trip as the `tt0903747` form on `externals`. The slug the
// backend expects is `imdb` + numeric suffix, so strip the prefix here. All
// other indexers carry a plain integer.
function externalIdToSlugSuffix(
  indexer: keyof Series["externals"],
  raw: number | string,
): string {
  if (indexer === "imdb") {
    return String(raw).replace(/^tt0*/, "");
  }
  return String(raw);
}

function indexerLabel(slug: string): string {
  switch (slug) {
    case "tvdb":
      return "TheTVDB";
    case "tmdb":
      return "TMDB";
    case "tvmaze":
      return "TVmaze";
    case "imdb":
      return "IMDb";
    default:
      return slug;
  }
}

function ChangeIndexerPanel({ show }: { show: Series }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const oldSlug = show.id.slug;
  const currentIndexer = show.indexer;

  // Targets are indexers we *already have mappings for* in `externals` and
  // that aren't the current one. v1 doesn't offer the "search manually"
  // escape hatch — most shows have these auto-mapped from TheTVDB.
  const targets = INDEXER_CHOICES.filter((key) => {
    if (key === currentIndexer) return false;
    const id = show.externals[key];
    return id !== undefined && id !== null && id !== "";
  });

  const [target, setTarget] = useState<keyof Series["externals"] | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const newSlugSuffix =
    target && show.externals[target]
      ? externalIdToSlugSuffix(target, show.externals[target])
      : "";
  const newSlug = newSlugSuffix ? `${String(target)}${newSlugSuffix}` : "";

  const change = useMutation({
    mutationFn: async () => {
      if (!newSlug) {
        throw new Error("Missing external id for that indexer");
      }
      if (newSlug === oldSlug) {
        throw new Error("Same slug");
      }
      const { data } = await api.post<{ identifier: string }>(
        "/changeindexer",
        { oldSlug, newSlug },
      );
      return { ...data, newSlug, target };
    },
    onSuccess: () => {
      pushToast({
        title: "Indexer change queued",
        body: `Switching from ${oldSlug} to ${newSlug}.`,
        type: "notice",
      });
      // Make the show-list page pick up the new slug on next visit.
      queryClient.invalidateQueries({ queryKey: ["series"] });
      // Bounce to the show list since the current slug will become stale.
      navigate("/");
    },
    onError: () => {
      pushToast({
        title: "Couldn't queue the indexer change",
        body: "Check the server logs.",
        type: "error",
      });
    },
  });

  return (
    <fieldset className="fieldset w-full">
      <legend className="fieldset-legend">Change indexer</legend>
      <p className="text-xs text-base-content/50">
        Re-map this show from <strong>{indexerLabel(currentIndexer)}</strong> to
        a different indexer with another valid ID. Metadata is re-fetched from
        the new indexer on the next refresh; episode files on disk are
        untouched.
      </p>

      {targets.length === 0 ? (
        <div className="text-xs text-base-content/50 italic py-2">
          No alternate indexers are mapped for this show in{" "}
          <code>externals</code>. Nothing to switch to.
        </div>
      ) : (
        <div className="flex flex-wrap items-end gap-2 pt-1">
          <label className="flex flex-col gap-1 text-xs flex-1 min-w-48">
            <span className="text-base-content/60">Switch to</span>
            <select
              className="select select-sm"
              value={target ?? undefined}
              onChange={(e) =>
                setTarget(e.target.value as keyof Series["externals"])
              }
            >
              <option>Pick an indexer…</option>
              {targets.map((key) => (
                <option key={key} value={key}>
                  {indexerLabel(String(key))} (id: {show.externals[key]})
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="btn btn-sm btn-warning"
            disabled={!target || change.isPending}
            onClick={() => setConfirmOpen(true)}
          >
            {change.isPending ? "Queueing…" : "Change indexer"}
          </button>
        </div>
      )}

      <ConfirmDialog
        open={confirmOpen}
        title={`Change indexer to ${target ? indexerLabel(String(target)) : ""}?`}
        body={
          <>
            <p>
              The show's identifier changes from <code>{oldSlug}</code> to{" "}
              <code>{newSlug}</code>. Existing episode files and statuses are
              kept; metadata, posters and aliases are re-fetched from the new
              indexer.
            </p>
            <p className="mt-2">
              The URL for this show and its settings will change once the swap
              completes. You will be sent back to the show list.
            </p>
          </>
        }
        confirmLabel="Change indexer"
        onConfirm={() => {
          change.mutate();
          setConfirmOpen(false);
        }}
        onClose={() => setConfirmOpen(false)}
      />
    </fieldset>
  );
}
