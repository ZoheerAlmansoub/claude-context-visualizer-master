export function PanelLoadingSkeleton({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="panel-loading governance-loading" aria-busy="true">
      <span className="improvement-loading-spinner" aria-hidden />
      <span>{label}</span>
      <div className="analysis-skeleton compact">
        <div className="skeleton-line wide" />
        <div className="skeleton-line" />
        <div className="skeleton-line short" />
      </div>
    </div>
  );
}
