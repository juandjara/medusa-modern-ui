import type { ReactNode } from "react";

interface ToggleProps {
  label: string;
  hint?: ReactNode;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  disabledHint?: string;
  className?: string;
}

export default function Toggle({
  label,
  hint,
  checked,
  onChange,
  disabled,
  disabledHint,
  className = "max-w-md",
}: ToggleProps) {
  return (
    <label
      className={`flex items-start gap-2 ${
        disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"
      } ${className}`}
      title={disabled ? disabledHint : undefined}
    >
      <input
        type="checkbox"
        className="toggle toggle-sm mt-0.5"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
      />
      <span>
        <span className="text-sm block">{label}</span>
        {hint && (
          <span className="text-xs text-base-content/50 block mt-0.5">
            {hint}
          </span>
        )}
      </span>
    </label>
  );
}
