import { useEffect, useState } from "react";
import { Clock } from "lucide-react";

type Props = {
  locale?: "ar" | "en";
  typeLabel?: string;
  provider?: string;
};

function formatElapsed(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSec / 60);
  const seconds = totalSec % 60;
  const tenths = Math.floor((ms % 1000) / 100);
  if (minutes > 0) {
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  }
  if (totalSec < 10) {
    return `${totalSec}.${tenths}s`;
  }
  return `${totalSec}s`;
}

export function AnalysisLoadingState({ locale = "en", typeLabel, provider }: Props) {
  const [elapsedMs, setElapsedMs] = useState(0);
  const isAr = locale === "ar";

  useEffect(() => {
    const startedAt = performance.now();
    const tick = () => setElapsedMs(performance.now() - startedAt);
    tick();
    const id = window.setInterval(tick, 100);
    return () => window.clearInterval(id);
  }, []);

  return (
    <article className="analysis-active-card" aria-live="polite" aria-busy="true">
      <header className="analysis-active-header">
        <div className="analysis-active-title">
          <span className="improvement-loading-spinner" aria-hidden />
          <span>{isAr ? "جاري التحليل…" : "Analyzing session…"}</span>
        </div>
        <div className="analysis-elapsed" title={isAr ? "الوقت المنقضي" : "Elapsed time"}>
          <Clock size={14} aria-hidden />
          <span className="analysis-elapsed-value" aria-label={isAr ? "الوقت المنقضي" : "Elapsed"}>
            {formatElapsed(elapsedMs)}
          </span>
        </div>
      </header>
      {(typeLabel || provider) && (
        <p className="analysis-active-meta">
          {[typeLabel, provider].filter(Boolean).join(" · ")}
        </p>
      )}
      <div className="analysis-skeleton">
        <div className="skeleton-line wide" />
        <div className="skeleton-line" />
        <div className="skeleton-line" />
        <div className="skeleton-line short" />
        <div className="skeleton-line wide" />
        <div className="skeleton-line" />
      </div>
    </article>
  );
}
