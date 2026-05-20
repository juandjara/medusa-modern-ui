import { Check, TriangleAlert } from "lucide-react";

interface TestRowProps {
  result: string | null;
  ok: boolean;
  pending: boolean;
  onClick: () => void;
  label?: string;
}

export default function TestRow({
  result,
  ok,
  pending,
  onClick,
  label = "Test connection",
}: TestRowProps) {
  return (
    <div className="flex items-center gap-3 pt-2 flex-wrap">
      <button
        type="button"
        className="btn btn-sm"
        onClick={onClick}
        disabled={pending}
      >
        {pending ? (
          <span className="loading loading-spinner loading-xs" />
        ) : (
          label
        )}
      </button>
      {result && (
        <span
          className={`text-sm inline-flex items-center gap-1 ${
            ok ? "text-success" : "text-error"
          }`}
        >
          {ok ? <Check size={14} /> : <TriangleAlert size={14} />}
          {result}
        </span>
      )}
    </div>
  );
}
