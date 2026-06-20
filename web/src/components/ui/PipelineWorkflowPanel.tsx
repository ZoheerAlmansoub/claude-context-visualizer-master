import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  Clock,
  Loader2,
  SkipForward,
} from "lucide-react";
import { useEffect, useState } from "react";
import {
  api,
  copyText,
  type AgentKind,
  type AnalyzeResult,
  type GovernancePipelineResult,
} from "../../api";
import { FALLBACK_ANALYSIS_TYPES } from "../../analysis-types";
import { ActionButton } from "./ActionButton";
import { AnalysisLoadingState } from "./AnalysisLoadingState";
import { AnalysisResultCards } from "./AnalysisResultCards";
import { MarkdownView } from "./MarkdownView";
import { pipelineCurrentStep, pipelineProgress } from "../../hooks/useGovernancePipeline";
import { isPipelineInitializing } from "../../lib/governance-pipeline-ui";

type Props = {
  agent: AgentKind;
  sessionId: string;
  projectRoot?: string;
  pipeline: GovernancePipelineResult;
  running: boolean;
  locale?: "ar" | "en";
  showSummary?: boolean;
};

const STATUS_LABELS = {
  en: {
    running: "Governance pipeline running",
    complete: "Pipeline complete",
    cancelled: "Pipeline cancelled",
    error: "Pipeline finished with errors",
    progress: "Progress",
    steps: "Pipeline steps",
    current: "Current step",
    autoApplied: "Auto-applied",
    playbook: "Playbook",
    copyPlaybook: "Copy playbook",
    viewResult: "View analysis output",
    hideResult: "Hide output",
    noOutput: "No analysis output for this step.",
    loadError: "Could not load analysis result.",
    initializing: "Initializing pipeline…",
    stepsCount: "Steps",
  },
  ar: {
    running: "جاري تشغيل pipeline الحوكمة",
    complete: "اكتمل Pipeline",
    cancelled: "تم إلغاء Pipeline",
    error: "انتهى Pipeline مع أخطاء",
    progress: "التقدم",
    steps: "خطوات Pipeline",
    current: "الخطوة الحالية",
    autoApplied: "تم التطبيق التلقائي",
    playbook: "Playbook",
    copyPlaybook: "نسخ Playbook",
    viewResult: "عرض مخرجات التحليل",
    hideResult: "إخفاء المخرجات",
    noOutput: "لا توجد مخرجات لهذه الخطوة.",
    loadError: "تعذّر تحميل نتيجة التحليل.",
    initializing: "جاري تهيئة Pipeline…",
    stepsCount: "الخطوات",
  },
} as const;

function typeLabel(type: string): string {
  return FALLBACK_ANALYSIS_TYPES.find((t) => t.id === type)?.label ?? type;
}

function statusTitle(
  status: GovernancePipelineResult["status"],
  L: { complete: string; cancelled: string; error: string; running: string; initializing: string },
  initializing: boolean,
) {
  if (initializing) return L.initializing;
  if (status === "complete") return L.complete;
  if (status === "cancelled") return L.cancelled;
  if (status === "error") return L.error;
  return L.running;
}

function StepIcon({ status }: { status: GovernancePipelineResult["steps"][0]["status"] }) {
  switch (status) {
    case "done":
      return <CheckCircle2 size={16} className="pipeline-step-icon pipeline-step-icon-done" />;
    case "running":
      return <Loader2 size={16} className="pipeline-step-icon spin pipeline-step-icon-running" />;
    case "error":
      return <AlertCircle size={16} className="pipeline-step-icon pipeline-step-icon-error" />;
    case "skipped":
      return <SkipForward size={16} className="pipeline-step-icon pipeline-step-icon-skipped" />;
    default:
      return <Circle size={14} className="pipeline-step-icon pipeline-step-icon-pending" />;
  }
}

export function PipelineWorkflowPanel({
  agent,
  sessionId,
  projectRoot,
  pipeline,
  running,
  locale = "en",
  showSummary = true,
}: Props) {
  const L = STATUS_LABELS[locale];
  const analysisSessionId = pipeline.analysisSessionId ?? pipeline.sessionId ?? sessionId;
  const initializing = isPipelineInitializing(pipeline);
  const progress = pipelineProgress(pipeline.steps);
  const current = pipelineCurrentStep(pipeline.steps);
  const finishedSteps = pipeline.steps.filter(
    (s) => s.status === "done" || s.status === "error" || s.status === "skipped",
  ).length;
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(running ? current : null);
  const [results, setResults] = useState<Record<string, AnalyzeResult>>({});
  const [loadingType, setLoadingType] = useState<string | null>(null);
  const [stepLoadErrors, setStepLoadErrors] = useState<Record<string, string>>({});
  const [elapsedMs, setElapsedMs] = useState(0);

  useEffect(() => {
    if (!running) return;
    const start = performance.now();
    const id = window.setInterval(() => setElapsedMs(performance.now() - start), 200);
    return () => window.clearInterval(id);
  }, [running, pipeline.pipelineId]);

  useEffect(() => {
    if (running && current) setExpanded(current);
  }, [running, current]);

  const handleCopy = (id: string, text: string) => {
    void copyText(text).then(() => {
      setCopiedId(id);
      window.setTimeout(() => setCopiedId(null), 1500);
    });
  };

  const toggleStep = async (type: string, analysisId?: string) => {
    if (expanded === type) {
      setExpanded(null);
      return;
    }
    setExpanded(type);
    if (!analysisId || results[type]) return;
    setLoadingType(type);
    setStepLoadErrors((prev) => {
      const next = { ...prev };
      delete next[type];
      return next;
    });
    try {
      const result = await api.getAnalysis(agent, analysisSessionId, analysisId);
      setResults((prev) => ({ ...prev, [type]: result }));
    } catch {
      setStepLoadErrors((prev) => ({ ...prev, [type]: L.loadError }));
    } finally {
      setLoadingType(null);
    }
  };

  const formatElapsed = (ms: number) => {
    const sec = Math.floor(ms / 1000);
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return m > 0 ? `${m}:${s.toString().padStart(2, "0")}` : `${sec}s`;
  };

  return (
    <section className="card pipeline-workflow-card" aria-live="polite">
      <div className={`pipeline-active-banner${running ? " is-running" : ""}`}>
        <div className="pipeline-active-head">
          <div className="pipeline-active-title">
            {running && <span className="improvement-loading-spinner" aria-hidden />}
            <span>{statusTitle(pipeline.status, L, initializing)}</span>
            <span className={`pipeline-status-pill pipeline-status-${initializing ? "running" : pipeline.status ?? "running"}`}>
              {initializing ? "starting" : (pipeline.status ?? "running")}
            </span>
          </div>
          {running && (
            <div className="analysis-elapsed">
              <Clock size={14} aria-hidden />
              <span>{formatElapsed(elapsedMs)}</span>
            </div>
          )}
        </div>
        <div className="pipeline-progress-meta">
          <span>
            {L.progress}: <strong>{progress}%</strong>
          </span>
          <span>
            {L.stepsCount}: <strong>{finishedSteps}/{pipeline.steps.length}</strong>
          </span>
          {current && running && (
            <span>
              {L.current}: <code>{typeLabel(current)}</code>
            </span>
          )}
          <span className="pipeline-scope-pill">{pipeline.scope}</span>
          {pipeline.mode && <span className="pipeline-scope-pill">{pipeline.mode}</span>}
        </div>
        <div className="hero-progress pipeline-hero-progress">
          <div className="hero-progress-bar" style={{ width: `${progress}%` }} />
        </div>
      </div>

      {showSummary && pipeline.summaryMarkdown && !running && (
        <div className="governance-summary-block pipeline-summary-block">
          <h3 className="card-title">
            {locale === "ar" ? "الخلاصة النهائية والاستفادة" : "Final summary & takeaways"}
          </h3>
          <MarkdownView content={pipeline.summaryMarkdown} />
        </div>
      )}

      <div className="pipeline-steps-timeline">
        <h3 className="card-title">{L.steps}</h3>
        <ol className="pipeline-timeline">
          {pipeline.steps.map((step, index) => {
            const isOpen = expanded === step.type;
            const canExpand = step.status === "done" && Boolean(step.analysisId);
            return (
              <li
                key={`${step.type}-${index}`}
                className={`pipeline-timeline-item pipeline-timeline-${step.status}${isOpen ? " is-open" : ""}`}
              >
                <button
                  type="button"
                  className="pipeline-timeline-row"
                  disabled={!canExpand && step.status !== "error"}
                  onClick={() => {
                    if (step.status === "error") return;
                    if (canExpand) void toggleStep(step.type, step.analysisId);
                  }}
                >
                  <StepIcon status={step.status} />
                  <span className="pipeline-timeline-index">{index + 1}</span>
                  <span className="pipeline-timeline-label">{typeLabel(step.type)}</span>
                  <code className="pipeline-timeline-type">{step.type}</code>
                  <span className={`pipeline-timeline-status pipeline-${step.status}`}>{step.status}</span>
                  {canExpand &&
                    (isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} className="pipeline-chevron" />)}
                </button>
                {step.error && <p className="pipeline-step-error">{step.error}</p>}
                {isOpen && (
                  <div className="pipeline-step-result">
                    {loadingType === step.type && (
                      <AnalysisLoadingState locale={locale} typeLabel={typeLabel(step.type)} />
                    )}
                    {stepLoadErrors[step.type] && loadingType !== step.type && (
                      <p className="panel-hint pipeline-step-error">{stepLoadErrors[step.type]}</p>
                    )}
                    {results[step.type] && (
                      <AnalysisResultCards
                        result={results[step.type]!}
                        copiedId={copiedId}
                        onCopy={handleCopy}
                        locale={locale}
                        agent={agent}
                        projectRoot={projectRoot}
                      />
                    )}
                    {!loadingType && !results[step.type] && !step.analysisId && (
                      <p className="panel-hint">{L.noOutput}</p>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      </div>

      {pipeline.applyResults && pipeline.applyResults.length > 0 && (
        <div className="pipeline-apply-results">
          <h4>{L.autoApplied}</h4>
          <ul>
            {pipeline.applyResults.map((r) => (
              <li key={r.path} className={r.ok ? "apply-ok" : "apply-err"}>
                <code>{r.path}</code>
                {!r.ok && r.error ? ` — ${r.error}` : ""}
              </li>
            ))}
          </ul>
        </div>
      )}

      {pipeline.playbookMarkdown && (
        <div className="pipeline-playbook-block">
          <div className="governance-playbook-head">
            <h3 className="card-title">{L.playbook}</h3>
            <ActionButton variant="secondary" onClick={() => copyText(pipeline.playbookMarkdown ?? "")}>
              {L.copyPlaybook}
            </ActionButton>
          </div>
          <pre className="governance-playbook">{pipeline.playbookMarkdown}</pre>
        </div>
      )}
    </section>
  );
}
