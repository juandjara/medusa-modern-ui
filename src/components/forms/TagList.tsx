import { useRef, useState, type KeyboardEvent } from "react";
import { Plus, X } from "lucide-react";

interface TagListProps {
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  // Hint type for the "add" input — useful for browser autocomplete and
  // visible affordances. Defaults to "text"; pass "url" for tracker lists,
  // script paths, etc.
  type?: "text" | "url";
  // Case-insensitive dedupe. Defaults to false because long values like URLs
  // tend to be case-significant.
  uniqueCi?: boolean;
}

// Vertical editable list for long-string lists (URLs, paths, script
// locations). Each existing value is its own row with an inline editor and a
// remove button; an "Add" row at the bottom accepts new entries. No
// chip-wrapping — values that don't fit truncate cleanly via overflow.
export default function TagList({
  value,
  onChange,
  placeholder,
  type = "text",
  uniqueCi = false,
}: TagListProps) {
  const [draft, setDraft] = useState("");
  const draftRef = useRef<HTMLInputElement>(null);

  const isDuplicate = (candidate: string) =>
    uniqueCi
      ? value.some((v) => v.toLowerCase() === candidate.toLowerCase())
      : value.includes(candidate);

  const commit = () => {
    const trimmed = draft.trim();
    if (!trimmed || isDuplicate(trimmed)) {
      setDraft("");
      return;
    }
    onChange([...value, trimmed]);
    setDraft("");
    // Keep focus on the add row so multi-entry pasting / typing flows.
    requestAnimationFrame(() => draftRef.current?.focus());
  };

  const update = (i: number, next: string) => {
    onChange(value.map((v, idx) => (idx === i ? next : v)));
  };

  const remove = (i: number) => onChange(value.filter((_, idx) => idx !== i));

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      commit();
    }
  };

  return (
    <div className="rounded-box border-2 border-base-300 overflow-hidden divide-y divide-base-300">
      {value.map((entry, i) => (
        <div key={i} className="flex items-center gap-1 pl-2 pr-1 py-1">
          <input
            type={type}
            className="input input-xs input-ghost flex-1 font-mono"
            value={entry}
            onChange={(e) => update(i, e.target.value)}
            spellCheck={false}
          />
          <button
            type="button"
            className="btn btn-ghost btn-xs btn-square"
            onClick={() => remove(i)}
            aria-label={`Remove ${entry}`}
            title="Remove"
          >
            <X size={12} />
          </button>
        </div>
      ))}
      <div className="flex items-center gap-1 pl-2 pr-1 py-1 bg-base-200/40">
        <input
          ref={draftRef}
          type={type}
          className="input input-xs input-ghost flex-1 font-mono"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKey}
          onBlur={commit}
          placeholder={placeholder ?? "Add…"}
          spellCheck={false}
        />
        <button
          type="button"
          className="btn btn-ghost btn-xs btn-square"
          onClick={commit}
          disabled={draft.trim().length === 0}
          aria-label="Add"
          title="Add"
        >
          <Plus size={12} />
        </button>
      </div>
    </div>
  );
}
