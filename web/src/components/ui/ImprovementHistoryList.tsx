import { useMemo, useState } from "react";
import type { PromptImprovementResult } from "../../api";
import { ImprovementResultCards } from "./ImprovementResultCards";
import { RecordLog } from "./RecordLog";

type Props = {
  items: PromptImprovementResult[];
  copiedId: string | null;
  onCopy: (id: string, text: string) => void;
  locale: "ar" | "en";
};

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function ImprovementHistoryList({ items, copiedId, onCopy, locale }: Props) {
  const sorted = useMemo(
    () =>
      [...items].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      ),
    [items],
  );
  const [activeId, setActiveId] = useState<string | null>(sorted[0]?.improvementId ?? null);

  const heading = locale === "ar" ? "سجل التحسينات" : "Improvement history";
  const emptyText =
    locale === "ar" ? "لا توجد تحسينات محفوظة بعد." : "No saved improvements yet.";

  return (
    <RecordLog
      heading={heading}
      count={sorted.length}
      emptyText={emptyText}
      defaultExpandedId={sorted[0]?.improvementId}
      items={sorted.map((imp, index) => ({
        id: imp.improvementId,
        title:
          locale === "ar"
            ? `تحسين #${sorted.length - index}`
            : `Run #${sorted.length - index}`,
        subtitle: fmtDate(imp.createdAt),
        active: activeId === imp.improvementId,
        meta: [
          imp.provider,
          imp.model,
          imp.locale.toUpperCase(),
          imp.tokensUsed != null ? `~${imp.tokensUsed} tok` : "",
        ].filter(Boolean),
        onSelect: () => setActiveId(imp.improvementId),
        children: (
          <ImprovementResultCards
            imp={imp}
            copiedId={copiedId}
            onCopy={onCopy}
          />
        ),
      }))}
    />
  );
}
