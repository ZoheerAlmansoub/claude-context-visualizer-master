import { useMemo } from "react";
import type { ReactNode } from "react";
import {
  AlertTriangle,
  BookOpen,
  Check,
  Copy,
  Lightbulb,
  Sparkles,
} from "lucide-react";
import type { PromptImprovementResult } from "../../api";
import { coerceImprovementFields, isFallbackRationale } from "../../utils/parse-improvement";
import { ActionButton } from "./ActionButton";
import { MarkdownView } from "./MarkdownView";

type Props = {
  imp: PromptImprovementResult;
  copiedId: string | null;
  onCopy: (id: string, text: string) => void;
};

const LABELS = {
  en: {
    improved: "Improved prompt",
    rationale: "Why this works better",
    issues: "Issues in original",
    tips: "Tips for next time",
    copy: "Copy",
    copied: "Copied",
    copyAll: "Copy full report",
    saved: "Saved",
    new: "New",
  },
  ar: {
    improved: "المطالبة المحسّنة",
    rationale: "لماذا هذا أفضل",
    issues: "مشاكل النسخة الأصلية",
    tips: "نصائح للمرات القادمة",
    copy: "نسخ",
    copied: "تم النسخ",
    copyAll: "نسخ التقرير كاملاً",
    saved: "محفوظ",
    new: "جديد",
  },
} as const;

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

type CardProps = {
  icon: typeof Sparkles;
  tone: "violet" | "blue" | "amber" | "green";
  title: string;
  copyId: string;
  copyText: string;
  copiedId: string | null;
  onCopy: (id: string, text: string) => void;
  copyLabel: string;
  copiedLabel: string;
  wide?: boolean;
  children: ReactNode;
};

function DetailCard({
  icon: Icon,
  tone,
  title,
  copyId,
  copyText,
  copiedId,
  onCopy,
  copyLabel,
  copiedLabel,
  wide = false,
  children,
}: CardProps) {
  const copied = copiedId === copyId;
  return (
    <article className={`detail-card detail-card-${tone}${wide ? " detail-card-wide" : ""}`}>
      <header className="detail-card-header">
        <div className="detail-card-title-wrap">
          <span className="detail-card-icon" aria-hidden>
            <Icon size={16} strokeWidth={2} />
          </span>
          <h4 className="detail-card-title">{title}</h4>
        </div>
        <ActionButton
          variant="ghost"
          icon={copied ? Check : Copy}
          className="detail-card-copy"
          onClick={() => onCopy(copyId, copyText)}
        >
          {copied ? copiedLabel : copyLabel}
        </ActionButton>
      </header>
      <div className="detail-card-body detail-card-scroll">{children}</div>
    </article>
  );
}

export function ImprovementResultCards({ imp, copiedId, onCopy }: Props) {
  const L = LABELS[imp.locale] ?? LABELS.en;
  const prefix = imp.messageId;

  const data = useMemo(
    () =>
      coerceImprovementFields({
        improvedPrompt: imp.improvedPrompt,
        rationale: imp.rationale,
        tips: imp.tips ?? [],
        issues: imp.issues ?? [],
      }),
    [imp],
  );

  const showRationale = Boolean(data.rationale) && !isFallbackRationale(data.rationale);

  return (
    <div className="improvement-results">
      <div className="improvement-results-meta">
        <span className="improvement-status-pill">{imp.cached ? L.saved : L.new}</span>
        <span>
          {imp.provider} · {imp.model}
        </span>
        <span>{fmtDate(imp.createdAt)}</span>
      </div>

      <div className="detail-card-grid">
        <DetailCard
          icon={Sparkles}
          tone="violet"
          title={L.improved}
          copyId={`${prefix}-imp`}
          copyText={data.improvedPrompt}
          copiedId={copiedId}
          onCopy={onCopy}
          copyLabel={L.copy}
          copiedLabel={L.copied}
          wide
        >
          <MarkdownView content={data.improvedPrompt} />
        </DetailCard>

        {showRationale && (
          <DetailCard
            icon={Lightbulb}
            tone="blue"
            title={L.rationale}
            copyId={`${prefix}-rat`}
            copyText={data.rationale}
            copiedId={copiedId}
            onCopy={onCopy}
            copyLabel={L.copy}
            copiedLabel={L.copied}
          >
            <MarkdownView content={data.rationale} />
          </DetailCard>
        )}

        {data.issues.length > 0 && (
          <DetailCard
            icon={AlertTriangle}
            tone="amber"
            title={L.issues}
            copyId={`${prefix}-issues`}
            copyText={data.issues.map((x) => `• ${x}`).join("\n")}
            copiedId={copiedId}
            onCopy={onCopy}
            copyLabel={L.copy}
            copiedLabel={L.copied}
          >
            <ul className="detail-card-list">
              {data.issues.map((issue, i) => (
                <li key={i}>{issue}</li>
              ))}
            </ul>
          </DetailCard>
        )}

        {data.tips.length > 0 && (
          <DetailCard
            icon={BookOpen}
            tone="green"
            title={L.tips}
            copyId={`${prefix}-tips`}
            copyText={data.tips.map((x) => `• ${x}`).join("\n")}
            copiedId={copiedId}
            onCopy={onCopy}
            copyLabel={L.copy}
            copiedLabel={L.copied}
          >
            <ul className="detail-card-list detail-card-list-tips">
              {data.tips.map((tip, i) => (
                <li key={i}>{tip}</li>
              ))}
            </ul>
          </DetailCard>
        )}
      </div>

      <div className="improvement-results-footer">
        <ActionButton
          variant="secondary"
          icon={copiedId === `${prefix}-md` ? Check : Copy}
          onClick={() => onCopy(`${prefix}-md`, imp.markdown)}
        >
          {copiedId === `${prefix}-md` ? L.copied : L.copyAll}
        </ActionButton>
      </div>
    </div>
  );
}

export function ImprovementLoadingCards({ locale = "en" }: { locale?: "ar" | "en" }) {
  const L = LABELS[locale] ?? LABELS.en;
  const titles = [L.improved, L.rationale, L.issues, L.tips];
  return (
    <div className="improvement-results improvement-results-loading">
      <div className="improvement-loading-banner">
        <span className="improvement-loading-spinner" aria-hidden />
        <span>{locale === "ar" ? "جاري تحسين المطالبة…" : "Improving prompt…"}</span>
      </div>
      <div className="detail-card-grid">
        {titles.map((title) => (
          <article key={title} className="detail-card detail-card-skeleton">
            <header className="detail-card-header">
              <div className="detail-card-title-wrap">
                <span className="detail-card-icon skeleton-block" />
                <h4 className="detail-card-title skeleton-line">{title}</h4>
              </div>
            </header>
            <div className="detail-card-body">
              <div className="skeleton-line wide" />
              <div className="skeleton-line" />
              <div className="skeleton-line short" />
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
