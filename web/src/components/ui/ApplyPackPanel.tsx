import { useEffect, useMemo, useState } from "react";
import { Check, Download, Package } from "lucide-react";
import { api } from "../../api";
import { type ApplyPackItem } from "../../lib/apply-pack";
import { ActionButton } from "./ActionButton";

type Props = {
  items: ApplyPackItem[];
  projectRoot?: string;
  locale?: "ar" | "en";
  onItemsChange?: (items: ApplyPackItem[]) => void;
};

const LABELS = {
  en: {
    title: "Review pack",
    apply: "Apply selected",
    applying: "Applying…",
    autoHigh: "Auto-select high confidence",
    path: "Path",
    action: "Action",
    preview: "Preview",
    none: "No applicable items to apply.",
    done: "Applied",
    failed: "Failed",
  },
  ar: {
    title: "مراجعة الحزمة",
    apply: "تطبيق المحدد",
    applying: "جاري التطبيق…",
    autoHigh: "تحديد الثقة العالية تلقائياً",
    path: "المسار",
    action: "الإجراء",
    preview: "معاينة",
    none: "لا توجد عناصر للتطبيق.",
    done: "تم",
    failed: "فشل",
  },
} as const;

export function ApplyPackPanel({ items: initialItems, projectRoot, locale = "en", onItemsChange }: Props) {
  const L = LABELS[locale];
  const [items, setItems] = useState(initialItems);
  const [applying, setApplying] = useState(false);
  const [results, setResults] = useState<Record<string, "ok" | "err">>({});

  useEffect(() => {
    setItems(initialItems);
    setResults({});
  }, [initialItems]);

  const selectedCount = useMemo(() => items.filter((i) => i.selected).length, [items]);

  const updateItems = (next: ApplyPackItem[]) => {
    setItems(next);
    onItemsChange?.(next);
  };

  const toggle = (id: string) => {
    updateItems(items.map((i) => (i.id === id ? { ...i, selected: !i.selected } : i)));
  };

  const setPath = (id: string, path: string) => {
    updateItems(items.map((i) => (i.id === id ? { ...i, path } : i)));
  };

  const selectHighConfidence = () => {
    updateItems(
      items.map((i) => ({
        ...i,
        selected: i.confidence === "high" || i.confidence === "medium" || !i.confidence,
      })),
    );
  };

  const apply = async () => {
    const selected = items.filter((i) => i.selected && i.path.trim());
    if (!selected.length) return;
    setApplying(true);
    try {
      const res = await api.applyArtifactPack(
        selected.map((i) => ({
          path: i.path.trim(),
          content: i.content,
          action: i.action,
          selected: true,
        })),
        projectRoot,
      );
      const next: Record<string, "ok" | "err"> = {};
      res.results.forEach((r, idx) => {
        const item = selected[idx];
        if (item) next[item.id] = r.ok ? "ok" : "err";
      });
      setResults(next);
    } catch (e) {
      alert(String(e));
    } finally {
      setApplying(false);
    }
  };

  if (!items.length) return null;

  return (
    <section className="apply-pack-panel">
      <div className="apply-pack-head">
        <h4>
          <Package size={16} /> {L.title} ({selectedCount}/{items.length})
        </h4>
        <div className="apply-pack-actions">
          <ActionButton variant="ghost" onClick={selectHighConfidence}>
            {L.autoHigh}
          </ActionButton>
          <ActionButton variant="primary" icon={Download} disabled={applying || selectedCount === 0} onClick={apply}>
            {applying ? L.applying : L.apply}
          </ActionButton>
        </div>
      </div>
      <div className="apply-pack-table-wrap">
        <table className="apply-pack-table">
          <thead>
            <tr>
              <th />
              <th>{L.path}</th>
              <th>{L.action}</th>
              <th>{L.preview}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className={results[item.id] ? `apply-${results[item.id]}` : ""}>
                <td>
                  <input type="checkbox" checked={item.selected} onChange={() => toggle(item.id)} />
                </td>
                <td>
                  <input
                    type="text"
                    className="analysis-save-path-input"
                    value={item.path}
                    onChange={(e) => setPath(item.id, e.target.value)}
                  />
                  <div className="apply-pack-label">{item.label}</div>
                </td>
                <td>{item.action ?? "create"}</td>
                <td>
                  <pre className="apply-pack-preview">{item.diffPreview ?? item.content.slice(0, 200)}</pre>
                </td>
                <td>
                  {results[item.id] === "ok" && (
                    <span className="badge-ok">
                      <Check size={14} /> {L.done}
                    </span>
                  )}
                  {results[item.id] === "err" && <span className="badge-warn">{L.failed}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
