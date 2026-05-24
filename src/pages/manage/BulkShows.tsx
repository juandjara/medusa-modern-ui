import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronDown,
  ChevronLeft,
  Edit3,
  Eraser,
  HardDrive,
  Image as ImageIcon,
  Inbox,
  Languages,
  Pause,
  RefreshCw,
  Search,
  Settings as SettingsIcon,
  Play,
  Trash2,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import api, { getAssetUrl } from "../../lib/api";
import QualityPicker from "../../components/forms/QualityPicker";
import ConfirmDialog from "../../components/ConfirmDialog";
import { pushToast } from "../../lib/toasts";
import { DEFAULT_EPISODE_STATUSES, type Series } from "../../types/medusa";

// -----------------------------------------------------------------------------
// "Keep / Yes / No" tri-state for the Edit panel. `null` ⇒ keep current value.
// -----------------------------------------------------------------------------

type TriBool = boolean | null;

interface EditState {
  qualities: { allowed: number[]; preferred: number[] };
  paused: TriBool;
  defaultEpisodeStatus: string | null;
  seasonFolders: TriBool;
  subtitles: TriBool;
  anime: TriBool;
  scene: TriBool;
  sports: TriBool;
  airByDate: TriBool;
  dvdOrder: TriBool;
}

const emptyEdit: EditState = {
  qualities: { allowed: [], preferred: [] },
  paused: null,
  defaultEpisodeStatus: null,
  seasonFolders: null,
  subtitles: null,
  anime: null,
  scene: null,
  sports: null,
  airByDate: null,
  dvdOrder: null,
};

// Per-config-key on the backend: anything left as `null` here means "keep the
// show's current value" (see series_mass_edit.py:92-101). Quality is keyed
// off the empty-array sentinel.
function buildMassEditPayload(
  selectedSlugs: string[],
  state: EditState,
): {
  shows: string[];
  options: Record<string, unknown>;
} {
  return {
    shows: selectedSlugs,
    options: {
      // Per series_mass_edit.py:103 — both arrays empty = keep current quality.
      qualities: state.qualities,
      paused: state.paused,
      defaultEpisodeStatus: state.defaultEpisodeStatus,
      seasonFolders: state.seasonFolders,
      subtitles: state.subtitles,
      anime: state.anime,
      scene: state.scene,
      sports: state.sports,
      airByDate: state.airByDate,
      dvdOrder: state.dvdOrder,
      // languageKeep=true makes the backend reuse each show's current lang
      // (series_mass_edit.py:101). Bulk language changes belong on the
      // per-show settings page where the indexer's valid languages are known.
      language: null,
      languageKeep: true,
      // rootDirs is only honored if the row matches the show's current
      // parent dir (series_mass_edit.py:81). Leave empty for now — moving
      // shows in bulk is its own UX problem.
      rootDirs: [],
    },
  };
}

// -----------------------------------------------------------------------------
// Run-job actions
// -----------------------------------------------------------------------------

interface JobAction {
  key:
    | "update"
    | "rescan"
    | "rename"
    | "subtitle"
    | "image"
    | "remove"
    | "delete";
  label: string;
  hint: string;
  icon: LucideIcon;
  destructive?: boolean;
}

const JOB_ACTIONS: JobAction[] = [
  {
    key: "update",
    label: "Update info from indexer",
    hint: "Re-fetch metadata for each show (titles, descriptions, season layout).",
    icon: RefreshCw,
  },
  {
    key: "rescan",
    label: "Rescan files on disk",
    hint: "Walk each show's folder to refresh which episodes Medusa thinks are on disk.",
    icon: HardDrive,
  },
  {
    key: "rename",
    label: "Rename files",
    hint: "Apply the configured naming pattern to every episode file.",
    icon: Edit3,
  },
  {
    key: "subtitle",
    label: "Search subtitles",
    hint: "Look for missing subtitles in the configured languages.",
    icon: Languages,
  },
  {
    key: "image",
    label: "Refresh images",
    hint: "Re-fetch posters, banners and fan art from the cache.",
    icon: ImageIcon,
  },
  {
    key: "remove",
    label: "Remove from Medusa",
    hint: "Stop tracking each show and remove its metadata from your library. Files on disk are untouched.",
    icon: Eraser,
    destructive: true,
  },
  {
    key: "delete",
    label: "Delete show & files",
    hint: "Stop tracking, remove metadata AND delete the files from disk. This cannot be undone.",
    icon: Trash2,
    destructive: true,
  },
];

// -----------------------------------------------------------------------------
// Page
// -----------------------------------------------------------------------------

interface MassUpdateResponse {
  shows: Record<string, string[]>;
  totals: Record<string, number>;
}

export default function BulkShows() {
  const queryClient = useQueryClient();
  const [view, setView] = useState<"select" | "edit">("select");
  const [confirmAction, setConfirmAction] = useState<JobAction | null>(null);

  // Same cache key as the show list — they share data.
  const showsQ = useQuery({
    queryKey: ["series"],
    queryFn: ({ signal }) =>
      api.get<Series[]>("/series", { signal }).then((r) => r.data),
  });

  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const sortedShows = useMemo(() => {
    const list = showsQ.data ?? [];
    return [...list].sort((a, b) => a.title.localeCompare(b.title));
  }, [showsQ.data]);

  const filteredShows = useMemo(() => {
    if (!filter.trim()) return sortedShows;
    const q = filter.trim().toLowerCase();
    return sortedShows.filter((s) => s.title.toLowerCase().includes(q));
  }, [sortedShows, filter]);

  const toggleShow = (slug: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  };

  const selectAllFiltered = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const s of filteredShows) next.add(s.id.slug);
      return next;
    });
  };
  const clearSelection = () => setSelected(new Set());

  // Run-job mutation. Lives at the parent so the Run-job dropdown can fire
  // any action and so onSuccess/onError can clear the page-level selection.
  const runJob = useMutation({
    mutationFn: (actionKey: JobAction["key"]) => {
      const empty: Record<JobAction["key"], string[]> = {
        update: [],
        rescan: [],
        rename: [],
        subtitle: [],
        image: [],
        remove: [],
        delete: [],
      };
      return api
        .post<MassUpdateResponse>("/massupdate", {
          ...empty,
          [actionKey]: Array.from(selected),
        })
        .then((r) => r.data);
    },
    onSuccess: (data, actionKey) => {
      const action =
        JOB_ACTIONS.find((a) => a.key === actionKey) ?? JOB_ACTIONS[0];
      const successes = data.totals[actionKey] ?? 0;
      const failureCount = Object.keys(data.shows).length;
      if (failureCount > 0) {
        pushToast({
          title: `${action.label}: ${successes} ok, ${failureCount} failed`,
          body: "Check the activity log for which shows failed.",
          type: "error",
        });
      } else {
        pushToast({
          title: `Queued ${action.label.toLowerCase()} for ${successes} show${successes === 1 ? "" : "s"}`,
          type: "notice",
        });
      }
      queryClient.invalidateQueries({ queryKey: ["series"] });
      clearSelection();
    },
    onError: () => {
      pushToast({
        title: "Couldn't queue the job",
        body: "Check the server logs.",
        type: "error",
      });
    },
  });

  const triggerJob = (action: JobAction) => {
    // Close the dropdown by blurring whatever is focused.
    (document.activeElement as HTMLElement | null)?.blur();
    if (action.destructive) setConfirmAction(action);
    else runJob.mutate(action.key);
  };

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex items-center gap-2">
        <Link to="/manage" className="btn btn-ghost btn-sm gap-1">
          <ChevronLeft size={16} /> Manage
        </Link>
      </div>

      <header className="space-y-1">
        <h1 className="text-2xl font-bold">Bulk operations on shows</h1>
        <p className="text-sm text-base-content/60">
          Apply settings or run maintenance jobs across many shows at once. Pick
          the shows below, then choose between{" "}
          <strong>editing their settings</strong> (quality, paused state, …) or{" "}
          <strong>running a job</strong> on each one (rescan, rename, refresh
          images, remove from library).
        </p>
      </header>

      {view === "edit" ? (
        <>
          <div className="flex items-center gap-3 flex-wrap">
            <button
              type="button"
              className="btn btn-ghost btn-sm gap-1"
              onClick={() => setView("select")}
            >
              <ChevronLeft size={16} /> Back to selection
            </button>
            <div className="text-sm text-base-content/60">
              Editing {selected.size} show{selected.size === 1 ? "" : "s"}
            </div>
          </div>
          <EditPanel
            selectedSlugs={Array.from(selected)}
            onApplied={() => {
              queryClient.invalidateQueries({ queryKey: ["series"] });
              setView("select");
              clearSelection();
            }}
          />
        </>
      ) : (
        <>
          {/* Top action bar — primary actions sit above the table. */}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex gap-2">
              <button
                type="button"
                className="btn btn-sm gap-1"
                disabled={selected.size === 0}
                onClick={() => setView("edit")}
                title={
                  selected.size === 0
                    ? "Pick at least one show below"
                    : undefined
                }
              >
                <SettingsIcon size={14} /> Edit settings
              </button>
              <div className="dropdown dropdown-bottom">
                <button
                  tabIndex={0}
                  type="button"
                  className="btn btn-sm gap-1"
                  disabled={selected.size === 0 || runJob.isPending}
                  title={
                    selected.size === 0
                      ? "Pick at least one show below"
                      : undefined
                  }
                >
                  <Play size={14} />
                  {runJob.isPending ? "Queueing…" : "Run job"}
                  <ChevronDown size={12} />
                </button>
                <ul
                  tabIndex={0}
                  className="dropdown-content menu z-10 bg-base-100 rounded-box w-80 p-1 shadow-lg border border-base-300"
                >
                  {JOB_ACTIONS.map((action) => {
                    const Icon = action.icon;
                    return (
                      <li key={action.key}>
                        <button
                          type="button"
                          onClick={() => triggerJob(action)}
                          className={`flex items-start gap-2 py-2 ${
                            action.destructive ? "text-error" : ""
                          }`}
                        >
                          <Icon size={14} className="shrink-0 mt-0.5" />
                          <div className="flex flex-col items-start gap-0.5 min-w-0">
                            <span className="font-medium">{action.label}</span>
                            <span className="text-xs opacity-70 font-normal whitespace-normal">
                              {action.hint}
                            </span>
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>
            <div className="text-sm text-base-content/60">
              {selected.size} of {filteredShows.length} selected
            </div>
          </div>

          {/* Show picker */}
          <section className="card bg-base-100 border-2 border-base-300 rounded-box overflow-hidden">
            <header className="px-4 py-3 border-b border-base-300 flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-sm flex-1 min-w-48">
                <Search size={14} className="text-base-content/40" />
                <input
                  type="search"
                  className="input input-sm input-ghost flex-1"
                  placeholder="Filter shows…"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                />
              </label>
              <div className="flex gap-1">
                <button
                  type="button"
                  className="btn btn-ghost btn-xs"
                  onClick={selectAllFiltered}
                  disabled={filteredShows.length === 0}
                >
                  Select all
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-xs"
                  onClick={clearSelection}
                  disabled={selected.size === 0}
                >
                  Clear
                </button>
              </div>
            </header>

            {showsQ.isLoading && (
              <div className="flex justify-center py-12">
                <span className="loading loading-spinner loading-lg" />
              </div>
            )}

            {showsQ.isError && (
              <div className="p-4">
                <div className="alert alert-soft alert-error text-sm">
                  <TriangleAlert size={14} />
                  Couldn't load shows.
                </div>
              </div>
            )}

            {!showsQ.isLoading && filteredShows.length === 0 && (
              <div className="text-center py-12 text-base-content/50 space-y-2">
                <Inbox size={28} className="mx-auto opacity-40" />
                <div>
                  {sortedShows.length === 0
                    ? "No shows in your library."
                    : "No shows match that filter."}
                </div>
              </div>
            )}

            {filteredShows.length > 0 && (
              <ul className="divide-y divide-base-300/60 max-h-100 overflow-y-auto">
                {filteredShows.map((show) => {
                  const isSelected = selected.has(show.id.slug);
                  return (
                    <li
                      key={show.id.slug}
                      className="flex items-center gap-3 px-4 py-2 hover:bg-base-200/40 cursor-pointer"
                      onClick={() => toggleShow(show.id.slug)}
                    >
                      <input
                        type="checkbox"
                        className="checkbox checkbox-sm"
                        checked={isSelected}
                        onChange={() => toggleShow(show.id.slug)}
                        onClick={(e) => e.stopPropagation()}
                        aria-label={`Select ${show.title}`}
                      />
                      <img
                        src={getAssetUrl(show.id.slug, "posterThumb")}
                        alt=""
                        className="w-6 h-9 object-cover rounded shrink-0 bg-base-300"
                        onError={(e) => {
                          e.currentTarget.style.visibility = "hidden";
                        }}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm truncate">
                          {show.title}
                        </div>
                        <div className="text-xs text-base-content/60 inline-flex items-center gap-2 flex-wrap">
                          <span>{show.status}</span>
                          {show.network && (
                            <>
                              <span>·</span>
                              <span>{show.network}</span>
                            </>
                          )}
                          {show.config.paused && (
                            <span className="badge badge-xs badge-ghost gap-1">
                              <Pause size={10} /> Paused
                            </span>
                          )}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </>
      )}

      <ConfirmDialog
        open={confirmAction !== null}
        title={confirmAction ? `${confirmAction.label}?` : ""}
        body={
          confirmAction && (
            <>
              <p>
                This will run <strong>{confirmAction.label}</strong> on{" "}
                <strong>
                  {selected.size} show{selected.size === 1 ? "" : "s"}
                </strong>
                .
              </p>
              {confirmAction.key === "delete" && (
                <p className="mt-2">
                  <strong>Files on disk will be deleted.</strong> This cannot be
                  undone.
                </p>
              )}
              {confirmAction.key === "remove" && (
                <p className="mt-2">
                  Files on disk are kept. Only the library entries are removed;
                  you can re-add the shows later.
                </p>
              )}
            </>
          )
        }
        confirmLabel={confirmAction?.label ?? "Confirm"}
        variant="danger"
        onConfirm={() => {
          if (confirmAction) runJob.mutate(confirmAction.key);
          setConfirmAction(null);
        }}
        onClose={() => setConfirmAction(null)}
      />
    </div>
  );
}

// -----------------------------------------------------------------------------
// Edit panel
// -----------------------------------------------------------------------------

function EditPanel({
  selectedSlugs,
  onApplied,
}: {
  selectedSlugs: string[];
  onApplied: () => void;
}) {
  const [edit, setEdit] = useState<EditState>(emptyEdit);
  // The quality payload uses empty arrays to mean "keep current quality"
  // (series_mass_edit.py:103). UI state lets the user explicitly pick Keep
  // vs Change so the picker isn't visible until they opt in.
  const [qualityMode, setQualityMode] = useState<"keep" | "set">("keep");

  const save = useMutation({
    mutationFn: () =>
      api
        .post<{
          errors: number;
        }>("/massedit", buildMassEditPayload(selectedSlugs, edit))
        .then((r) => r.data),
    onSuccess: (data) => {
      const n = selectedSlugs.length;
      if (data.errors > 0) {
        pushToast({
          title: `Saved with ${data.errors} error${data.errors === 1 ? "" : "s"}`,
          body: "Check the activity log for which shows failed.",
          type: "error",
        });
      } else {
        pushToast({
          title: `Updated ${n} show${n === 1 ? "" : "s"}`,
          type: "notice",
        });
      }
      setEdit(emptyEdit);
      setQualityMode("keep");
      onApplied();
    },
    onError: () => {
      pushToast({
        title: "Bulk edit failed",
        body: "Check the server logs.",
        type: "error",
      });
    },
  });

  // True when at least one tri-state has been changed away from null OR the
  // quality picker is in Change mode with a non-empty selection.
  const hasChanges =
    (qualityMode === "set" &&
      (edit.qualities.allowed.length > 0 ||
        edit.qualities.preferred.length > 0)) ||
    edit.paused !== null ||
    edit.defaultEpisodeStatus !== null ||
    edit.seasonFolders !== null ||
    edit.subtitles !== null ||
    edit.anime !== null ||
    edit.scene !== null ||
    edit.sports !== null ||
    edit.airByDate !== null ||
    edit.dvdOrder !== null;

  return (
    <div className="card bg-base-100 border-2 border-base-300 rounded-box">
      <div className="card-body p-4 space-y-3">
        <p className="text-xs text-base-content/60">
          Fields left on <em>Keep</em> won't change on the selected shows.
        </p>

        <div className="space-y-2">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs text-base-content/60">Quality</span>
            <select
              className="select select-sm"
              value={qualityMode}
              onChange={(e) => {
                const next = e.target.value as "keep" | "set";
                setQualityMode(next);
                if (next === "keep") {
                  setEdit((s) => ({
                    ...s,
                    qualities: { allowed: [], preferred: [] },
                  }));
                }
              }}
            >
              <option value="keep">Keep</option>
              <option value="set">Change quality</option>
            </select>
          </label>
          {qualityMode === "set" && (
            <QualityPicker
              allowed={edit.qualities.allowed}
              preferred={edit.qualities.preferred}
              onChange={(q) => setEdit((s) => ({ ...s, qualities: q }))}
            />
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          <TriBoolField
            label="Paused"
            value={edit.paused}
            onChange={(v) => setEdit((s) => ({ ...s, paused: v }))}
          />
          <DefaultEpStatusField
            value={edit.defaultEpisodeStatus}
            onChange={(v) =>
              setEdit((s) => ({ ...s, defaultEpisodeStatus: v }))
            }
          />
          <TriBoolField
            label="Season folders"
            value={edit.seasonFolders}
            onChange={(v) => setEdit((s) => ({ ...s, seasonFolders: v }))}
          />
          <TriBoolField
            label="Subtitles"
            value={edit.subtitles}
            onChange={(v) => setEdit((s) => ({ ...s, subtitles: v }))}
          />
          <TriBoolField
            label="Anime"
            value={edit.anime}
            onChange={(v) => setEdit((s) => ({ ...s, anime: v }))}
          />
          <TriBoolField
            label="Scene numbering"
            value={edit.scene}
            onChange={(v) => setEdit((s) => ({ ...s, scene: v }))}
          />
          <TriBoolField
            label="Sports"
            value={edit.sports}
            onChange={(v) => setEdit((s) => ({ ...s, sports: v }))}
          />
          <TriBoolField
            label="Air by date"
            value={edit.airByDate}
            onChange={(v) => setEdit((s) => ({ ...s, airByDate: v }))}
          />
          <TriBoolField
            label="DVD order"
            value={edit.dvdOrder}
            onChange={(v) => setEdit((s) => ({ ...s, dvdOrder: v }))}
          />
        </div>

        <div className="flex justify-end pt-2 border-t border-base-300/60">
          <button
            type="button"
            className="btn btn-sm btn-primary"
            disabled={!hasChanges || save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending
              ? "Saving…"
              : `Save changes on ${selectedSlugs.length} show${selectedSlugs.length === 1 ? "" : "s"}`}
          </button>
        </div>
      </div>
    </div>
  );
}

function TriBoolField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: TriBool;
  onChange: (v: TriBool) => void;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-xs text-base-content/60">{label}</span>
      <select
        className="select select-sm"
        value={value === null ? "keep" : value ? "yes" : "no"}
        onChange={(e) => {
          const v = e.target.value;
          onChange(v === "keep" ? null : v === "yes");
        }}
      >
        <option value="keep">Keep</option>
        <option value="yes">Yes</option>
        <option value="no">No</option>
      </select>
    </label>
  );
}

function DefaultEpStatusField({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (v: string | null) => void;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-xs text-base-content/60">
        Default episode status
      </span>
      <select
        className="select select-sm"
        value={value ?? "keep"}
        onChange={(e) =>
          onChange(e.target.value === "keep" ? null : e.target.value)
        }
      >
        <option value="keep">Keep</option>
        {DEFAULT_EPISODE_STATUSES.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
    </label>
  );
}
