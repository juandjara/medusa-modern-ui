import { useRef, useState, type KeyboardEvent } from "react";
import { X } from "lucide-react";

interface TagInputProps {
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  // Optional case-insensitive uniqueness check. Defaults to true to match how
  // Medusa stores word filters (matches lowercased content).
  uniqueCi?: boolean;
}

// Single-line, horizontally-scrollable chip input. Use this for *short*
// tokens (word filters, language codes, etc.) where chips fit naturally on
// one line and the user benefits from seeing the whole row at once. For
// long values (URLs, paths) use TagList instead — chip-wrapping at small
// widths produces visual jank.
export default function TagInput({
  value,
  onChange,
  placeholder,
  uniqueCi = true,
}: TagInputProps) {
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const commit = () => {
    const trimmed = draft.trim();
    if (!trimmed) return;
    const exists = uniqueCi
      ? value.some((v) => v.toLowerCase() === trimmed.toLowerCase())
      : value.includes(trimmed);
    if (exists) {
      setDraft("");
      return;
    }
    onChange([...value, trimmed]);
    setDraft("");
    // Scroll the newest chip into view.
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({
        left: scrollRef.current.scrollWidth,
        behavior: "smooth",
      });
    });
  };

  const remove = (i: number) => onChange(value.filter((_, idx) => idx !== i));

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      commit();
    } else if (
      e.key === "Backspace" &&
      draft.length === 0 &&
      value.length > 0
    ) {
      e.preventDefault();
      remove(value.length - 1);
    }
  };

  return (
    <div
      ref={scrollRef}
      className="input input-sm w-full flex items-center gap-1 overflow-x-auto whitespace-nowrap"
    >
      {value.map((tag, i) => (
        <span
          key={`${tag}-${i}`}
          className="badge badge-sm badge-neutral gap-1 pl-2 pr-1 shrink-0"
        >
          {tag}
          <button
            type="button"
            className="hover:text-error"
            onClick={() => remove(i)}
            aria-label={`Remove ${tag}`}
          >
            <X size={10} />
          </button>
        </span>
      ))}
      <input
        type="text"
        className="bg-transparent outline-none flex-1 min-w-32 text-sm"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKey}
        onBlur={commit}
        placeholder={value.length === 0 ? placeholder : ""}
        spellCheck={false}
      />
    </div>
  );
}
