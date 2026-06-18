import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Loader2 } from "lucide-react";

type Variant = "primary" | "secondary" | "ghost" | "accent";

type Props = {
  icon?: LucideIcon;
  loading?: boolean;
  loadingLabel?: string;
  variant?: Variant;
  className?: string;
  disabled?: boolean;
  title?: string;
  onClick?: () => void;
  children: ReactNode;
};

export function ActionButton({
  icon: Icon,
  loading = false,
  loadingLabel,
  variant = "secondary",
  className = "",
  disabled,
  title,
  onClick,
  children,
}: Props) {
  const busy = loading || disabled;
  return (
    <button
      type="button"
      className={`action-btn action-btn-${variant}${busy ? " is-busy" : ""} ${className}`.trim()}
      disabled={busy}
      title={title}
      onClick={onClick}
    >
      {loading ? (
        <Loader2 className="action-btn-icon spin" aria-hidden />
      ) : Icon ? (
        <Icon className="action-btn-icon" aria-hidden />
      ) : null}
      <span>{loading && loadingLabel ? loadingLabel : children}</span>
    </button>
  );
}
