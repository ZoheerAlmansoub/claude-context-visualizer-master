export function AnalysisLoadingState({ locale = "en" }: { locale?: "ar" | "en" }) {
  return (
    <div className="analysis-loading">
      <div className="improvement-loading-banner">
        <span className="improvement-loading-spinner" aria-hidden />
        <span>{locale === "ar" ? "جاري التحليل…" : "Analyzing session…"}</span>
      </div>
      <div className="analysis-skeleton">
        <div className="skeleton-line wide" />
        <div className="skeleton-line" />
        <div className="skeleton-line" />
        <div className="skeleton-line short" />
        <div className="skeleton-line wide" />
        <div className="skeleton-line" />
      </div>
    </div>
  );
}
