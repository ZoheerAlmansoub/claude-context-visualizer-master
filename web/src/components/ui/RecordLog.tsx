import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

export type RecordLogItem = {
  id: string;
  title: string;
  subtitle?: string;
  meta?: string[];
  active?: boolean;
  onSelect?: () => void;
  children: React.ReactNode;
};

type Props = {
  heading: string;
  count?: number;
  emptyText?: string;
  items: RecordLogItem[];
  defaultExpandedId?: string | null;
};

export function RecordLog({ heading, count, emptyText, items, defaultExpandedId }: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    if (defaultExpandedId) return new Set([defaultExpandedId]);
    if (items[0]) return new Set([items[0].id]);
    return new Set();
  });

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (items.length === 0) {
    if (!emptyText) return null;
    return (
      <div className="record-log">
        <div className="record-log-header">
          <span className="record-log-heading">{heading}</span>
        </div>
        <div className="record-log-empty">{emptyText}</div>
      </div>
    );
  }

  return (
    <div className="record-log">
      <div className="record-log-header">
        <span className="record-log-heading">{heading}</span>
        {count != null && <span className="record-log-count">{count}</span>}
      </div>
      <div className="record-log-list">
        {items.map((item) => {
          const open = expanded.has(item.id);
          return (
            <div
              key={item.id}
              className={`record-log-item${open ? " expanded" : ""}${item.active ? " active" : ""}`}
            >
              <button
                type="button"
                className="record-log-item-header"
                onClick={() => {
                  if (!open) item.onSelect?.();
                  toggle(item.id);
                }}
                aria-expanded={open}
              >
                <span className="record-log-chevron" aria-hidden>
                  {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                </span>
                <span className="record-log-item-main">
                  <span className="record-log-item-title">{item.title}</span>
                  {item.subtitle && (
                    <span className="record-log-item-subtitle">{item.subtitle}</span>
                  )}
                </span>
                {item.meta && item.meta.length > 0 && (
                  <span className="record-log-item-meta">
                    {item.meta.map((m, i) => (
                      <span key={i} className="record-log-meta-pill">
                        {m}
                      </span>
                    ))}
                  </span>
                )}
              </button>
              {open && <div className="record-log-item-body">{item.children}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
