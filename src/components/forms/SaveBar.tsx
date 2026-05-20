import { Check, TriangleAlert } from "lucide-react";

interface SaveBarProps {
  dirty: boolean;
  pending: boolean;
  success: boolean;
  error: boolean;
  onSave: () => void;
  // Defaults: "Save changes" / "Unsaved changes" / "Saved" / "Save failed".
  label?: string;
  dirtyLabel?: string;
  savedLabel?: string;
  errorLabel?: string;
}

export default function SaveBar({
  dirty,
  pending,
  success,
  error,
  onSave,
  label = "Save changes",
  dirtyLabel = "Unsaved changes",
  savedLabel = "Saved",
  errorLabel = "Save failed",
}: SaveBarProps) {
  return (
    <div className="flex items-center gap-2 sticky top-0 bg-base-200 py-2 z-10">
      <button
        type="button"
        className="btn btn-sm btn-primary"
        onClick={onSave}
        disabled={!dirty || pending}
      >
        {pending ? (
          <span className="loading loading-spinner loading-xs" />
        ) : (
          label
        )}
      </button>
      {dirty && (
        <span className="text-xs text-warning inline-flex items-center gap-1">
          <TriangleAlert size={12} /> {dirtyLabel}
        </span>
      )}
      {success && !dirty && (
        <span className="text-xs text-success inline-flex items-center gap-1">
          <Check size={12} /> {savedLabel}
        </span>
      )}
      {error && (
        <span className="text-xs text-error inline-flex items-center gap-1">
          <TriangleAlert size={12} /> {errorLabel}
        </span>
      )}
    </div>
  );
}
