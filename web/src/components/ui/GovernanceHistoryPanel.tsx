import { useEffect, useState } from "react";
import {
  api,
  type AgentKind,
  type GovernancePipelineListItem,
  type GovernancePipelineResult,
} from "../../api";
import { MarkdownView } from "./MarkdownView";
import { PanelLoadingSkeleton } from "./PanelLoadingSkeleton";
import { PipelineWorkflowPanel } from "./PipelineWorkflowPanel";
import { RecordLog } from "./RecordLog";

type Props = {
  agent: AgentKind;
  projectSlug: string;
  sessionId?: string;
  projectRoot?: string;
  locale?: "ar" | "en";
  activePipelineId?: string | null;
  refreshKey?: number;
};

const LABELS = {
  en: {
    title: "Governance history",
    loading: "Loading governance history…",
    empty: "No governance runs saved yet. Start a pipeline to build project memory and playbook.",
    run: "Run",
    steps: "steps",
    failed: "failed",
    loadRun: "Loading run details…",
    finalSummary: "Final summary & takeaways",
    noSummary: "This run has no structured summary yet (older runs). Expand steps below for per-step outputs.",
    playbookNote: "Playbook and step outputs are available below.",
  },
  ar: {
    title: "سجل عمليات الحوكمة",
    loading: "جاري تحميل سجل الحوكمة…",
    empty: "لا توجد عمليات حوكمة محفوظة بعد. شغّل pipeline لبناء الذاكرة وPlaybook.",
    run: "تشغيل",
    steps: "خطوات",
    failed: "فشل",
    loadRun: "جاري تحميل تفاصيل التشغيل…",
    finalSummary: "الخلاصة النهائية والاستفادة",
    noSummary: "لا توجد خلاصة منظمة لهذا التشغيل (تشغيلات قديمة). وسّع الخطوات أدناه لعرض المخرجات.",
    playbookNote: "Playbook ومخرجات الخطوات متاحة أدناه.",
  },
} as const;

function fmtDate(iso?: string): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function statusLabel(status: GovernancePipelineListItem["status"]) {
  return status ?? "unknown";
}

export function GovernanceHistoryPanel({
  agent,
  projectSlug,
  sessionId,
  projectRoot,
  locale = "en",
  activePipelineId,
  refreshKey = 0,
}: Props) {
  const L = LABELS[locale];
  const [items, setItems] = useState<GovernancePipelineListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedPipeline, setSelectedPipeline] = useState<GovernancePipelineResult | null>(null);
  const [loadingRun, setLoadingRun] = useState(false);

  useEffect(() => {
    setLoading(true);
    api
      .governanceHistory(agent, projectSlug, { sessionId, limit: 25 })
      .then((res) => setItems(res.items))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [agent, projectSlug, sessionId, refreshKey]);

  const loadRun = async (pipelineId: string) => {
    if (selectedId === pipelineId && selectedPipeline) return;
    setSelectedId(pipelineId);
    setLoadingRun(true);
    setSelectedPipeline(null);
    try {
      const full = await api.getGovernancePipeline(pipelineId);
      setSelectedPipeline(full);
    } catch {
      setSelectedPipeline(null);
    } finally {
      setLoadingRun(false);
    }
  };

  if (loading) {
    return (
      <section className="card governance-history-card">
        <PanelLoadingSkeleton label={L.loading} />
      </section>
    );
  }

  return (
    <section className="card governance-history-card">
      <RecordLog
        heading={L.title}
        count={items.length}
        emptyText={L.empty}
        defaultExpandedId={activePipelineId ?? items[0]?.pipelineId ?? null}
        items={items.map((entry, index) => ({
          id: entry.pipelineId,
          title: `${L.run} #${items.length - index} · ${entry.scope}${entry.mode ? ` · ${entry.mode}` : ""}`,
          subtitle: fmtDate(entry.updatedAt ?? entry.createdAt),
          active: activePipelineId === entry.pipelineId,
          meta: [
            statusLabel(entry.status),
            `${entry.stepsDone}/${entry.stepsTotal} ${L.steps}`,
            entry.stepsFailed ? `${entry.stepsFailed} ${L.failed}` : "",
            entry.hasSummary ? (locale === "ar" ? "خلاصة" : "summary") : "",
            entry.hasPlaybook ? "playbook" : "",
          ].filter(Boolean),
          onSelect: () => void loadRun(entry.pipelineId),
          children:
            loadingRun && selectedId === entry.pipelineId && !selectedPipeline ? (
              <div className="panel-loading compact">
                <span className="improvement-loading-spinner" aria-hidden />
                <span>{L.loadRun}</span>
              </div>
            ) : selectedPipeline?.pipelineId === entry.pipelineId ? (
              <div className="governance-history-run">
                {selectedPipeline.summaryMarkdown ? (
                  <div className="governance-summary-block">
                    <h4>{L.finalSummary}</h4>
                    <MarkdownView content={selectedPipeline.summaryMarkdown} />
                  </div>
                ) : (
                  <p className="panel-hint">{L.noSummary}</p>
                )}
                {!selectedPipeline.summaryMarkdown && selectedPipeline.playbookMarkdown && (
                  <p className="panel-hint">{L.playbookNote}</p>
                )}
                <PipelineWorkflowPanel
                  agent={agent}
                  sessionId={selectedPipeline.sessionId ?? sessionId ?? ""}
                  projectRoot={projectRoot ?? selectedPipeline.projectRoot}
                  pipeline={selectedPipeline}
                  running={selectedPipeline.status === "running"}
                  locale={locale}
                  showSummary={false}
                />
              </div>
            ) : (
              <div className="record-log-placeholder">
                {locale === "ar" ? "وسّع لتحميل تفاصيل هذا التشغيل." : "Expand to load this run."}
              </div>
            ),
        }))}
      />
    </section>
  );
}
