import type { ReactNode } from "react";

export type DetailTab = "context" | "messages" | "analysis" | "artifacts" | "insights";

type Props = {
  active: DetailTab;
  onChange: (tab: DetailTab) => void;
};

const TABS: Array<{ id: DetailTab; label: string }> = [
  { id: "context", label: "Context" },
  { id: "messages", label: "Messages" },
  { id: "analysis", label: "Analysis" },
  { id: "artifacts", label: "Artifacts" },
  { id: "insights", label: "Insights" },
];

export function SessionTabs({ active, onChange }: Props): ReactNode {
  return (
    <div className="session-tabs" role="tablist">
      {TABS.map((t) => (
        <button
          key={t.id}
          role="tab"
          type="button"
          className={active === t.id ? "active" : ""}
          aria-selected={active === t.id}
          onClick={() => onChange(t.id)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
