import type { ReactNode } from "react";

interface FieldProps {
  label: string;
  hint?: ReactNode;
  children: ReactNode;
  // "sm" shrinks the legend for dense subsections (e.g. provider options).
  size?: "sm" | "md";
  className?: string;
}

export default function Field({
  label,
  hint,
  children,
  size = "md",
  className = "",
}: FieldProps) {
  return (
    <fieldset className={`fieldset ${className}`}>
      <legend className={`fieldset-legend ${size === "sm" ? "text-xs" : ""}`}>
        {label}
      </legend>
      {children}
      {hint && <div className="text-xs text-base-content/50 mt-1">{hint}</div>}
    </fieldset>
  );
}
