import { Fragment } from "react";
import { Info } from "lucide-react";
import {
  QUALITY,
  QUALITY_PRESETS,
  detectQualityPreset,
  qualityName,
} from "../../types/medusa";

const CUSTOM_SENTINEL = "__custom__";

// Quality groups for a scannable layout. Order matches a roughly
// ascending-resolution mental model. Each row is one bitmask value from
// medusa/common.py:Quality — both `allowed` and `preferred` columns toggle
// the same numeric value on/off in their respective lists.
interface QualityRow {
  value: number;
  label: string;
}

interface QualityGroup {
  label: string;
  rows: QualityRow[];
}

const QUALITY_GROUPS: QualityGroup[] = [
  {
    label: "SD",
    rows: [
      { value: QUALITY.SDTV, label: "SDTV" },
      { value: QUALITY.SDDVD, label: "SD DVD" },
    ],
  },
  {
    label: "720p",
    rows: [
      { value: QUALITY.HDTV, label: "HDTV" },
      { value: QUALITY.HDWEBDL, label: "WEB-DL" },
      { value: QUALITY.HDBLURAY, label: "BluRay" },
    ],
  },
  {
    label: "1080p",
    rows: [
      { value: QUALITY.FULLHDTV, label: "HDTV" },
      { value: QUALITY.FULLHDWEBDL, label: "WEB-DL" },
      { value: QUALITY.FULLHDBLURAY, label: "BluRay" },
      { value: QUALITY.RAWHDTV, label: "RawHD (1080i mpeg2)" },
    ],
  },
  {
    label: "4K (2160p)",
    rows: [
      { value: QUALITY.UHD_4K_TV, label: "UHD TV" },
      { value: QUALITY.UHD_4K_WEBDL, label: "UHD WEB-DL" },
      { value: QUALITY.UHD_4K_BLURAY, label: "UHD BluRay" },
    ],
  },
  {
    label: "Other",
    rows: [{ value: QUALITY.UNKNOWN, label: "Unknown" }],
  },
];

interface QualityPickerProps {
  allowed: number[];
  preferred: number[];
  onChange: (next: { allowed: number[]; preferred: number[] }) => void;
}

export default function QualityPicker({
  allowed,
  preferred,
  onChange,
}: QualityPickerProps) {
  const matchingPreset = detectQualityPreset(allowed);
  // Preset is considered active only if it matches AND there are no preferred
  // qualities (presets never set preferred). Otherwise we're in custom mode.
  const presetActive = matchingPreset !== null && preferred.length === 0;

  const onPresetChange = (key: string) => {
    if (key === CUSTOM_SENTINEL) return;
    onChange({
      allowed: [...QUALITY_PRESETS[key].allowed].sort((a, b) => a - b),
      preferred: [],
    });
  };

  const toggle = (q: number, kind: "allowed" | "preferred") => {
    const list = kind === "allowed" ? allowed : preferred;
    const next = list.includes(q)
      ? list.filter((x) => x !== q)
      : [...list, q].sort((a, b) => a - b);
    onChange({
      allowed: kind === "allowed" ? next : allowed,
      preferred: kind === "preferred" ? next : preferred,
    });
  };

  return (
    <div className="space-y-2">
      <select
        className="select select-sm w-full max-w-md"
        value={presetActive ? matchingPreset! : CUSTOM_SENTINEL}
        onChange={(e) => onPresetChange(e.target.value)}
      >
        {Object.entries(QUALITY_PRESETS).map(([key, preset]) => (
          <option key={key} value={key}>
            {preset.label}
          </option>
        ))}
        <option value={CUSTOM_SENTINEL}>Custom…</option>
      </select>

      <QualityExplanation allowed={allowed} preferred={preferred} />

      <div className="rounded-box bg-base-100 px-4 py-2 border-2 border-base-300 overflow-hidden">
        <table className="table table-xs">
          <thead>
            <tr>
              <th></th>
              <th className="text-center w-24">Allowed</th>
              <th className="text-center w-24">Preferred</th>
            </tr>
          </thead>
          <tbody>
            {QUALITY_GROUPS.map((group) => (
              <Fragment key={group.label}>
                <tr className="bg-base-200/40">
                  <td
                    colSpan={3}
                    className="pt-4 text-xs font-semibold uppercase text-base-content/60"
                  >
                    {group.label}
                  </td>
                </tr>
                {group.rows.map((row) => (
                  <tr key={row.value}>
                    <td>{row.label}</td>
                    <td className="text-center">
                      <input
                        type="checkbox"
                        className="checkbox checkbox-sm"
                        checked={allowed.includes(row.value)}
                        onChange={() => toggle(row.value, "allowed")}
                      />
                    </td>
                    <td className="text-center">
                      <input
                        type="checkbox"
                        className="checkbox checkbox-sm"
                        checked={preferred.includes(row.value)}
                        onChange={() => toggle(row.value, "preferred")}
                      />
                    </td>
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function QualityExplanation({
  allowed,
  preferred,
}: {
  allowed: number[];
  preferred: number[];
}) {
  const allowedNames = allowed.map(qualityName);
  const preferredNames = preferred.map(qualityName);

  if (allowed.length === 0 && preferred.length === 0) {
    return (
      <div className="alert alert-soft alert-warning text-xs">
        <Info size={14} />
        Pick at least one allowed quality — otherwise Medusa won't snatch
        anything for this show.
      </div>
    );
  }

  return (
    <div className="rounded bg-base-200/40 border border-base-300 p-2 text-xs space-y-1">
      <div className="flex items-center gap-2">
        <Info size={12} className="shrink-0 text-base-content/50" />
        <div className="space-y-1">
          {preferred.length === 0 ? (
            <p>
              Downloads <strong>any</strong> of: {allowedNames.join(", ")} —
              then stops searching.
            </p>
          ) : (
            <>
              <p>
                Downloads <strong>any</strong> of:{" "}
                {allowedNames.length > 0 ? allowedNames.join(", ") : "(none)"}.
              </p>
              <p>
                Keeps searching to upgrade to one of:{" "}
                {preferredNames.join(", ")}. Once one of these arrives,
                searching stops.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
