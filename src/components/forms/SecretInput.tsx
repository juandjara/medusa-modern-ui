import { useState } from "react";
import { EyeIcon, EyeOffIcon } from "lucide-react";

interface SecretInputProps {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  // When true, the toggle button also shows "Show" / "Hide" text next to the
  // icon. Pure-icon (default) keeps inline rows tight.
  withLabel?: boolean;
}

export default function SecretInput({
  value,
  onChange,
  placeholder,
  withLabel = false,
}: SecretInputProps) {
  const [reveal, setReveal] = useState(false);
  return (
    <div className="join w-full">
      <input
        type={reveal ? "text" : "password"}
        className="input input-sm join-item flex-1"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
      />
      <button
        type="button"
        className="btn btn-sm join-item"
        onClick={() => setReveal((v) => !v)}
      >
        {reveal ? <EyeOffIcon size={12} /> : <EyeIcon size={12} />}
        {withLabel && (reveal ? "Hide" : "Show")}
      </button>
    </div>
  );
}
