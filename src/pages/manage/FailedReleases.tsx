import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronLeft,
  Inbox,
  Sparkles,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import api from "../../lib/api";
import { formatBytes } from "../../lib/time";
import type { ConfigSearch } from "../../types/config";

interface FailedDownload {
  // ROWID from the failed.db table — opaque, only used to send `remove`.
  id: number;
  release: string;
  // Bytes. -1 when the original size was unknown at log time.
  size: number;
  provider: {
    id: string;
    name: string;
    imageName: string;
  };
}

// Fixture data for `?preview=1` — lets you see the table shape without real
// rows in failed.db. Provider names are chosen to overlap with
// common Medusa provider icons (`/images/providers/<name>.png`); missing
// icons fall through the `onError` hide path.
const PREVIEW_ROWS: FailedDownload[] = [
  {
    id: 1,
    release: "The.Bear.S03E07.Legacy.1080p.HULU.WEB-DL.DDP5.1.H.264-NTb",
    size: 2_456_789_012,
    provider: { id: "nzbgeek", name: "NZBgeek", imageName: "nzbgeek.png" },
  },
  {
    id: 2,
    release:
      "Severance.S02E04.Woes.Hollow.2160p.ATVP.WEB-DL.DDP5.1.HDR.H.265-FLUX",
    size: 7_812_345_678,
    provider: {
      id: "drunkenslug",
      name: "DrunkenSlug",
      imageName: "drunkenslug.png",
    },
  },
  {
    id: 3,
    release: "Chernobyl.S01E03.Open.Wide.O.Earth.720p.AMZN.WEB-DL.x264-NTb",
    size: 1_234_567_890,
    provider: {
      id: "torrentleech",
      name: "TorrentLeech",
      imageName: "torrentleech.png",
    },
  },
  {
    id: 4,
    release:
      "Slow.Horses.S04E06.1080p.ATVP.WEB-DL.DDP5.1.Atmos.H.264-FLUX[rarbg]",
    size: 1_987_654_321,
    provider: { id: "1337x", name: "1337x", imageName: "1337x.png" },
  },
  {
    id: 5,
    release: "Some.Old.Show.S02E14.PROPER.HDTV.x264-LOL",
    // Unknown size — exercises the "—" fallback.
    size: -1,
    provider: {
      id: "binsearch",
      name: "Binsearch",
      imageName: "binsearch.png",
    },
  },
  {
    id: 6,
    release:
      "The.Last.of.Us.S02E01.Future.Days.2160p.MAX.WEB-DL.DDP5.1.HDR.H.265-NTb",
    size: 9_876_543_210,
    provider: {
      id: "nzbplanet",
      name: "NZBplanet",
      imageName: "nzbplanet.png",
    },
  },
  {
    id: 7,
    release:
      "Random.Show.With.A.Very.Long.Release.Name.That.Will.Truncate.S01E01.1080p.WEB.h264-ELiTE",
    size: 543_210_987,
    provider: {
      id: "abandoned-provider",
      name: "Abandoned Provider",
      // imageName intentionally points at a file that won't exist, to verify
      // the onError fallback hides cleanly.
      imageName: "abandoned-provider.png",
    },
  },
  {
    id: 8,
    release: "Anime.Show.S01E12.720p.BluRay.x264-anon",
    size: 412_345_678,
    provider: {
      id: "anidex",
      name: "Anidex",
      imageName: "anidex.png",
    },
  },
];

const LIMIT_OPTIONS = [
  { value: 100, label: "100" },
  { value: 250, label: "250" },
  { value: 500, label: "500" },
  { value: 0, label: "All" },
];

export default function FailedReleases() {
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const preview = searchParams.get("preview") === "1";

  const [limit, setLimit] = useState<number>(100);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  // Local-only store for preview mode so the Remove button has somewhere to
  // splice from. Initialised once from PREVIEW_ROWS; real mode never reads it.
  const [previewRows, setPreviewRows] =
    useState<FailedDownload[]>(PREVIEW_ROWS);

  const failedQ = useQuery({
    queryKey: ["failed-downloads", limit],
    queryFn: ({ signal }) =>
      api
        .get<FailedDownload[]>("/internal/getFailed", {
          signal,
          params: { limit },
        })
        .then((r) => r.data),
    staleTime: 30_000,
    enabled: !preview,
  });

  // `app.USE_FAILED_DOWNLOADS` controls both whether failures get logged AND
  // whether the search filters against this list. When it's off, this page is
  // dormant — rows aren't added and existing rows don't influence searches.
  // Share the query key with SearchSettings so the two reuse the same cache.
  const searchCfgQ = useQuery({
    queryKey: ["config", "search"],
    queryFn: ({ signal }) =>
      api.get<ConfigSearch>("/config/search", { signal }).then((r) => r.data),
    staleTime: 60_000,
  });
  const handlingEnabled =
    searchCfgQ.data?.general?.failedDownloads?.enabled ?? true;

  const items = preview ? previewRows : (failedQ.data ?? []);

  const removeMutation = useMutation<void, Error, number[]>({
    mutationFn: async (ids) => {
      // In preview mode the rows are local-only; "remove" splices client-side
      // and resolves so the rest of the page (loading, etc.) behaves the same.
      if (preview) {
        setPreviewRows((rows) => rows.filter((r) => !ids.includes(r.id)));
        return;
      }
      await api.post("/internal/removeFailed", { remove: ids });
    },
    onSuccess: () => {
      setSelected(new Set());
      if (!preview) {
        queryClient.invalidateQueries({ queryKey: ["failed-downloads"] });
      }
    },
  });

  // "Select all" header checkbox — tri-state, but we collapse to two via the
  // `indeterminate` ref below.
  const allOnPageSelected =
    items.length > 0 && items.every((it) => selected.has(it.id));
  const someSelected = selected.size > 0;

  const toggleAll = () => {
    if (allOnPageSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(items.map((it) => it.id)));
    }
  };

  const toggleOne = (id: number) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const removeSelected = () => {
    if (selected.size === 0) return;
    removeMutation.mutate([...selected]);
  };

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center gap-2">
        <Link to="/manage" className="btn btn-ghost btn-sm gap-1">
          <ChevronLeft size={16} /> Manage
        </Link>
      </div>

      <header className="space-y-1">
        <h1 className="text-2xl font-bold">Failed releases</h1>
        <p className="text-sm text-base-content/60">
          This is the <strong>Release Blacklist</strong>. It is composed of
          releases Medusa snatched that didn't end up as a successfully
          processed episode: post-processing couldn't match the files, the
          download client reported an error, or the user marked them failed.
          While a release stays on this list, Medusa won't try to re-snatch it.
          You can remove entries from the list to let the search find them
          again.
        </p>
      </header>

      {!handlingEnabled && (
        <div className="alert alert-soft alert-warning text-sm py-2">
          <TriangleAlert size={14} />
          <span>
            <em>Track failed releases</em> is disabled in{" "}
            <Link to="/settings/search" className="link link-hover font-medium">
              Search settings
            </Link>
            . No new releases will be added to the blacklist while that toggle
            is off.
          </span>
        </div>
      )}

      {preview && (
        <div className="alert alert-soft alert-info text-sm py-2">
          <Sparkles size={14} />
          <span>
            Preview mode — these rows are fake fixture data so you can see the
            layout. Remove still works but only against the local list.{" "}
            <Link to="/manage/failed" className="link link-hover">
              Switch to real data
            </Link>
            .
          </span>
        </div>
      )}

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <button
          type="button"
          className="btn btn-sm btn-error gap-1"
          onClick={removeSelected}
          disabled={!someSelected || removeMutation.isPending}
        >
          <Trash2 size={14} />
          {removeMutation.isPending ? (
            "Removing…"
          ) : (
            <>Remove selected{someSelected ? ` (${selected.size})` : ""}</>
          )}
        </button>

        <label className="flex items-center gap-2 text-sm">
          <span className="text-base-content/60">Limit</span>
          <select
            className="select select-sm"
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
          >
            {LIMIT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {removeMutation.isError && (
        <div className="alert alert-soft alert-error text-sm">
          <TriangleAlert size={14} />
          Couldn't remove the selected entries. Try again or check the server
          logs.
        </div>
      )}

      {failedQ.isLoading && (
        <div className="flex justify-center py-16">
          <span className="loading loading-spinner loading-lg" />
        </div>
      )}

      {!failedQ.isLoading && items.length === 0 && (
        <div className="text-center py-16 text-base-content/50 space-y-2">
          <Inbox size={32} className="mx-auto opacity-40" />
          <div>No failed releases recorded.</div>
          <div className="text-xs">
            Releases that fail post-processing or get marked failed by the user
            will show up here.
          </div>
        </div>
      )}

      {items.length > 0 && (
        <div className="space-y-2">
          <div className="text-sm text-base-content/60">
            {items.length} failed release{items.length === 1 ? "" : "s"}
          </div>
          <div className="overflow-x-auto">
            <table className="table table-zebra table-sm">
              <thead>
                <tr>
                  <th className="w-10">
                    <input
                      type="checkbox"
                      className="checkbox checkbox-sm"
                      checked={allOnPageSelected}
                      onChange={toggleAll}
                      aria-label="Select all"
                    />
                  </th>
                  <th>Release</th>
                  <th className="whitespace-nowrap">Size</th>
                  <th>Provider</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => (
                  <tr key={it.id}>
                    <td>
                      <input
                        type="checkbox"
                        className="checkbox checkbox-sm"
                        checked={selected.has(it.id)}
                        onChange={() => toggleOne(it.id)}
                        aria-label={`Select ${it.release}`}
                      />
                    </td>
                    <td
                      className="text-xs font-mono max-w-sm truncate"
                      title={it.release}
                    >
                      {it.release}
                    </td>
                    <td className="whitespace-nowrap text-xs">
                      {it.size > 0 ? formatBytes(it.size) : "—"}
                    </td>
                    <td className="text-xs">
                      <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                        {it.provider.imageName && (
                          <img
                            src={`/images/providers/${it.provider.imageName}`}
                            alt=""
                            width={16}
                            height={16}
                            className="shrink-0"
                            onError={(e) => {
                              e.currentTarget.style.display = "none";
                            }}
                          />
                        )}
                        {it.provider.name}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
