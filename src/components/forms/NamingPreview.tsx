import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { Check, TriangleAlert, BookOpen } from "lucide-react";

// Backend endpoints come from the legacy Tornado tree (medusa/server/web/
// config/post_processing.py), not the v2 API. They return plain text:
//   testNaming      → "<dir>/<name>" (no extension) or "" on failure
//   isNamingValid   → "valid" | "invalid" | "seasonfolders"
const TEST_URL = "/config/postProcessing/testNaming";
const VALIDATE_URL = "/config/postProcessing/isNamingValid";

// Sentinel select value — distinguishes "user is editing freely" from a
// concrete preset. Stored only in local state, never sent to the backend.
const CUSTOM_SENTINEL = "__custom__";

export interface NamingPreviewProps {
  pattern: string;
  onChange: (next: string) => void;
  multiEp?: number;
  animeType?: number;
  // When provided alongside `multiEp`, a multi-ep style picker is rendered
  // inside the field. The preview row updates as the user changes it.
  multiEpOptions?: { value: number; label: string }[];
  onMultiEpChange?: (next: number) => void;
  // Variant flags — only one of these is true at a time for a given pattern
  // field. Drives which validator the backend runs and which presets we show.
  abd?: boolean; // air by date
  sports?: boolean;
  presets?: { pattern: string; example: string }[];
}

const DEFAULT_PRESETS: { pattern: string; example: string }[] = [
  {
    pattern: "Season %0S/%SN - %Sx%0E - %EN",
    example: "Season 02/Show Name - 2x03 - Ep Name",
  },
  {
    pattern: "Season %0S/%S.N.S%0SE%0E.%E.N",
    example: "Season 02/Show.Name.S02E03.Ep.Name",
  },
  {
    pattern: "Season %S/%S_N_%Sx%0E_%E_N",
    example: "Season 2/Show_Name_2x03_Ep_Name",
  },
  {
    pattern: "Season %S/%SN S%0SE%0E %SQN",
    example: "Season 2/Show Name S02E03 720p HDTV x264",
  },
  {
    pattern: "Season %0S/%S.N.S%0SE%0E.%Q.N-%RG",
    example: "Season 02/Show.Name.S02E03.720p.HDTV-RLSGROUP",
  },
];

const TOKEN_GROUPS: { label: string; tokens: [string, string][] }[] = [
  {
    label: "Show name",
    tokens: [
      ["%SN", "Show Name"],
      ["%S.N", "Show.Name"],
      ["%S_N", "Show_Name"],
    ],
  },
  {
    label: "Season number",
    tokens: [
      ["%S", "2"],
      ["%0S", "02"],
      ["%XS", "2 (XEM)"],
      ["%0XS", "02 (XEM)"],
    ],
  },
  {
    label: "Episode number",
    tokens: [
      ["%E", "3"],
      ["%0E", "03"],
      ["%XE", "3 (XEM)"],
      ["%0XE", "03 (XEM)"],
    ],
  },
  {
    label: "Absolute (anime)",
    tokens: [
      ["%AB", "3"],
      ["%0AB", "003"],
    ],
  },
  {
    label: "Episode name",
    tokens: [
      ["%EN", "Episode Name"],
      ["%E.N", "Episode.Name"],
      ["%E_N", "Episode_Name"],
    ],
  },
  {
    label: "Quality",
    tokens: [
      ["%QN", "720p HDTV"],
      ["%Q.N", "720p.HDTV"],
      ["%SQN", "720p HDTV x264"],
    ],
  },
  {
    label: "Release",
    tokens: [
      ["%RG", "RLSGROUP"],
      ["%RT", "PROPER"],
    ],
  },
  {
    label: "Air date",
    tokens: [
      ["%M", "March"],
      ["%D", "9"],
      ["%Y", "2026"],
    ],
  },
];

export default function NamingPreview({
  pattern,
  onChange,
  multiEp,
  animeType,
  multiEpOptions,
  onMultiEpChange,
  abd,
  sports,
  presets,
}: NamingPreviewProps) {
  const [showLegend, setShowLegend] = useState(false);
  const effectivePresets = presets ?? DEFAULT_PRESETS;

  // Custom-mode is sticky once entered (until the user picks a preset again).
  // Initialise it from the pattern: if it doesn't match any preset, the user
  // is already in custom mode.
  const matchingPreset = effectivePresets.find((p) => p.pattern === pattern);
  const [customMode, setCustomMode] = useState(
    pattern.length > 0 && !matchingPreset,
  );
  const isCustom = customMode || (!matchingPreset && pattern.length > 0);

  const selectValue = isCustom
    ? CUSTOM_SENTINEL
    : (matchingPreset?.pattern ?? CUSTOM_SENTINEL);

  const onSelectChange = (value: string) => {
    if (value === CUSTOM_SENTINEL) {
      setCustomMode(true);
      // Leave pattern as-is — preset value becomes the editable starting
      // point. If pattern is currently empty, the input shows empty.
    } else {
      setCustomMode(false);
      onChange(value);
    }
  };

  // Shared params *without* `multi` — the backend uses single-ep rendering
  // when `multi` is absent. The multi query layers `multi: multiEp` on top.
  const baseParams = useMemo(() => {
    const p: Record<string, string | number | boolean> = { pattern };
    if (animeType !== undefined) p.anime_type = animeType;
    if (abd) p.abd = true;
    if (sports) p.sports = true;
    return p;
  }, [pattern, animeType, abd, sports]);

  const single = useQuery({
    queryKey: ["naming", "preview", "single", baseParams],
    queryFn: ({ signal }) =>
      axios
        .get<string>(TEST_URL, {
          signal,
          params: baseParams,
          responseType: "text",
        })
        .then((r) => r.data),
    enabled: pattern.length > 0,
    staleTime: 30_000,
  });

  const multi = useQuery({
    queryKey: ["naming", "preview", "multi", baseParams, multiEp],
    queryFn: ({ signal }) =>
      axios
        .get<string>(TEST_URL, {
          signal,
          params: { ...baseParams, multi: multiEp },
          responseType: "text",
        })
        .then((r) => r.data),
    enabled: pattern.length > 0 && !!multiEp,
    staleTime: 30_000,
  });

  // Validation runs against the full param set so a multi-only failure shows.
  const validation = useQuery({
    queryKey: ["naming", "validate", baseParams, multiEp],
    queryFn: ({ signal }) =>
      axios
        .get<string>(VALIDATE_URL, {
          signal,
          params: multiEp ? { ...baseParams, multi: multiEp } : baseParams,
          responseType: "text",
        })
        .then((r) => r.data.trim()),
    enabled: pattern.length > 0,
    staleTime: 30_000,
  });

  const validity = validation.data;
  const isInvalid = validity === "invalid";
  const needsSeasonFolders = validity === "seasonfolders";

  return (
    <div className="space-y-2">
      <select
        className="select select-sm w-full"
        value={selectValue}
        onChange={(e) => onSelectChange(e.target.value)}
      >
        {effectivePresets.map((p) => (
          <option key={p.pattern} value={p.pattern}>
            {p.example}
          </option>
        ))}
        <option value={CUSTOM_SENTINEL}>Custom…</option>
      </select>

      {isCustom && (
        <input
          className={`input input-sm w-full font-mono ${
            isInvalid ? "input-error" : ""
          }`}
          value={pattern}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Type a custom pattern…"
          spellCheck={false}
        />
      )}

      {pattern.length === 0 ? (
        <p className="text-xs text-base-content/50">
          Pattern is empty — preview unavailable.
        </p>
      ) : (
        <div className="overflow-x-scroll rounded border-2 border-base-300 bg-base-200/40 p-2 pt-3 text-xs flex flex-wrap items-end gap-2">
          <div className="space-y-1 grow shrink-0">
            <div className="flex items-center gap-2">
              <span className="text-base-content/50 w-16 shrink-0">
                Single:
              </span>
              <code className="font-mono break-all flex-1">
                {single.data ? `${single.data}.ext` : "…"}
              </code>
            </div>
            {!!multiEp && (
              <div className="flex items-center gap-2">
                <span className="text-base-content/50 w-16 shrink-0">
                  Multi:
                </span>
                <code className="font-mono break-all flex-1">
                  {multi.data ? `${multi.data}.ext` : "…"}
                </code>
              </div>
            )}
          </div>
          {multiEpOptions && onMultiEpChange && (
            <select
              className="select select-xs w-32 shrink-0 -ml-1"
              value={multiEp}
              onChange={(e) => onMultiEpChange(Number(e.target.value))}
              title="Multi-episode naming style"
            >
              {multiEpOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          )}
        </div>
      )}

      {isInvalid && (
        <div className="text-xs text-error inline-flex items-center gap-1">
          <TriangleAlert size={12} /> Invalid pattern — won't round-trip through
          the parser.
        </div>
      )}
      {needsSeasonFolders && (
        <div className="text-xs text-warning inline-flex items-center gap-1">
          <TriangleAlert size={12} /> Pattern needs season folders, but the
          per-file portion doesn't include season/episode tokens.
        </div>
      )}
      <div className="flex items-center gap-1">
        {!isInvalid && !needsSeasonFolders && validity === "valid" && (
          <div className="text-xs text-success inline-flex items-center gap-1">
            <Check size={12} /> Pattern is valid.
          </div>
        )}
        {isCustom && (
          <button
            type="button"
            className="btn btn-ghost btn-xs gap-1"
            onClick={() => setShowLegend((v) => !v)}
          >
            <BookOpen size={12} />
            {showLegend ? "Hide" : "Show"} token reference
          </button>
        )}
      </div>
      {showLegend && (
        <div className="rounded border-2 border-base-300 p-2 text-xs grid grid-cols-1 sm:grid-cols-2 gap-3">
          {TOKEN_GROUPS.map((g) => (
            <div key={g.label}>
              <div className="font-semibold text-base-content/60 mb-1">
                {g.label}
              </div>
              <table className="w-full mb-3">
                <tbody>
                  {g.tokens.map(([tok, ex]) => (
                    <tr key={tok}>
                      <td className="w-1/3 font-mono text-base-content/80 pr-3">
                        {tok}
                      </td>
                      <td className="w-2/3 text-base-content/60">{ex}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
          <p className="col-span-full text-base-content/50 text-[10px]">
            Lower-case the letters for a lower-cased result (e.g.{" "}
            <code>%sn</code> → "show name"). Separators (<code>.</code>,{" "}
            <code>_</code>) inside the token transfer to the rendered string.
          </p>
        </div>
      )}
    </div>
  );
}
