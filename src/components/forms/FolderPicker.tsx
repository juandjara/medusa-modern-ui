import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { Folder, FolderOpen, ChevronUp, X } from "lucide-react";

// Shape of /browser/?path=… (Tornado endpoint, see medusa/browser.py:list_folders).
// First entry is { currentPath }; if include_parent and not at FS root, a
// { name: '..', path } entry follows; remaining entries are { name, path }.
type BrowserEntry = { currentPath: string } | { name: string; path: string };

interface FolderPickerProps {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

export default function FolderPicker({
  value,
  onChange,
  placeholder,
  className = "",
  disabled,
}: FolderPickerProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);

  // Imperative dialog sync only — no derived state here. The browsing
  // position lives in <BrowserPanel>, which is conditionally rendered so it
  // remounts (and re-initializes from `value`) every time the modal opens.
  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    else if (!open && d.open) d.close();
  }, [open]);

  return (
    <>
      <div className={`join w-full ${className}`}>
        <input
          type="text"
          className="input input-sm join-item flex-1"
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          spellCheck={false}
          disabled={disabled}
        />
        <button
          type="button"
          className="btn btn-sm join-item gap-1"
          onClick={() => setOpen(true)}
          disabled={disabled}
          title="Browse for a folder"
        >
          <FolderOpen size={14} />
          Browse
        </button>
      </div>

      <dialog ref={dialogRef} className="modal" onClose={() => setOpen(false)}>
        <div className="modal-box max-w-2xl">
          {open && (
            <BrowserPanel
              initialPath={value}
              onSelect={(p) => {
                onChange(p);
                setOpen(false);
              }}
              onCancel={() => setOpen(false)}
            />
          )}
        </div>
        <form method="dialog" className="modal-backdrop">
          <button>close</button>
        </form>
      </dialog>
    </>
  );
}

function BrowserPanel({
  initialPath,
  onSelect,
  onCancel,
}: {
  initialPath: string;
  onSelect: (p: string) => void;
  onCancel: () => void;
}) {
  const [path, setPath] = useState(initialPath);
  const onNavigate = setPath;
  const browseQ = useQuery({
    queryKey: ["browser", path],
    queryFn: ({ signal }) =>
      axios
        .get<BrowserEntry[]>("/browser/", {
          signal,
          params: { path },
        })
        .then((r) => r.data),
    // Each path is its own row; folder listings rarely change while the
    // modal is open, so cache them for a few minutes.
    staleTime: 60_000,
  });

  const entries = browseQ.data ?? [];
  const currentEntry = entries.find(
    (e): e is { currentPath: string } => "currentPath" in e,
  );
  const currentPath = currentEntry?.currentPath ?? path;
  const items = entries.filter(
    (e): e is { name: string; path: string } => "name" in e,
  );
  const parent = items.find((e) => e.name === "..");
  const folders = items.filter((e) => e.name !== "..");

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-semibold">Select folder</h3>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={onCancel}
          aria-label="Close"
        >
          <X size={16} />
        </button>
      </div>

      <div className="flex items-center gap-1 text-sm">
        <button
          type="button"
          className="btn btn-ghost btn-xs"
          onClick={() => parent && onNavigate(parent.path)}
          disabled={!parent}
          title="Up one level"
        >
          <ChevronUp size={14} />
        </button>
        <code className="font-mono text-xs bg-base-200 rounded px-2 py-1 flex-1 truncate">
          {currentPath}
        </code>
      </div>

      <div className="max-h-80 overflow-y-auto rounded border border-base-300">
        {browseQ.isLoading ? (
          <div className="flex justify-center py-10">
            <span className="loading loading-spinner" />
          </div>
        ) : browseQ.isError ? (
          <div className="p-4 text-sm text-error">
            Couldn't list folder. Path may not exist or you're not
            authenticated.
          </div>
        ) : folders.length === 0 ? (
          <div className="p-6 text-sm text-base-content/50 text-center">
            No subfolders here.
          </div>
        ) : (
          <ul>
            {folders.map((f) => (
              <li key={f.path}>
                <button
                  type="button"
                  className="w-full text-left flex items-center gap-2 px-3 py-2 hover:bg-base-200 text-sm"
                  onClick={() => onNavigate(f.path)}
                  onDoubleClick={() => onSelect(f.path)}
                  title={f.path}
                >
                  <Folder size={14} className="text-base-content/50" />
                  <span className="truncate">{f.name}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <button
          type="button"
          className="btn btn-sm btn-ghost"
          onClick={onCancel}
        >
          Cancel
        </button>
        <button
          type="button"
          className="btn btn-sm btn-primary"
          onClick={() => onSelect(currentPath)}
        >
          Use this folder
        </button>
      </div>
    </div>
  );
}
