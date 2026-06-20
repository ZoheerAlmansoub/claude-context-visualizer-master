import { useEffect, useState } from "react";
import { LayoutDashboard, RefreshCw } from "lucide-react";
import {
  api,
  type AgentKind,
  type GovernancePipelineMode,
  type LlmProviderKind,
  type ProjectContextSummary,
  type RecurringPattern,
  type SessionListItem,
} from "../api";
import { useGovernancePipeline } from "../context/GovernancePipelineContext";
import { ActionButton } from "./ui/ActionButton";
import { GovernanceRunControls } from "./ui/GovernanceRunControls";
import { PanelLoadingSkeleton } from "./ui/PanelLoadingSkeleton";
import { PatternGrid } from "./ui/PatternGrid";
import { PipelineWorkflowPanel } from "./ui/PipelineWorkflowPanel";
import { ProjectMetricsHero } from "./ui/ProjectMetricsHero";
import { GovernanceHistoryPanel } from "./ui/GovernanceHistoryPanel";

type Props = {
  agent: AgentKind;
  session: SessionListItem;
  locale?: "ar" | "en";
  onSelectSession?: (id: string) => void;
};

type DashboardData = {
  context: ProjectContextSummary;
  patterns: RecurringPattern[];
  sessions: Array<{ id: string; title: string; mtimeMs: number; realTotal: number | null; hasCompaction: boolean }>;
  schedule: { lastRunAt: string | null; lastSessionCount: number; minNewSessions: number };
  eligibility: { eligible: boolean; newSessions: number; reason: string };
};

const LABELS = {
  en: {
    title: "Project dashboard",
    loading: "Loading project dashboard…",
    sessions: "Sessions",
    memoryFiles: "Memory files",
    patterns: "Cross-session patterns",
    newSessions: "New since govern",
    noPatterns: "No cross-session patterns yet.",
    topPatterns: "Top patterns",
    recentSessions: "Recent sessions",
    eligible: "new session(s) — project governance recommended",
    lastGovern: "Last governance",
    refresh: "Refresh",
    compacted: "compacted",
  },
  ar: {
    title: "لوحة المشروع",
    loading: "جاري تحميل لوحة المشروع…",
    sessions: "الجلسات",
    memoryFiles: "ملفات الذاكرة",
    patterns: "أنماط cross-session",
    newSessions: "جلسات جديدة",
    noPatterns: "لا توجد أنماط cross-session بعد.",
    topPatterns: "أهم الأنماط",
    recentSessions: "آخر الجلسات",
    eligible: "جلسة جديدة — يُنصح بتشغيل حوكمة المشروع",
    lastGovern: "آخر حوكمة",
    refresh: "تحديث",
    compacted: "مضغوطة",
  },
} as const;

export function ProjectDashboard({ agent, session, locale = "en", onSelectSession }: Props) {
  const L = LABELS[locale];
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [provider, setProvider] = useState<LlmProviderKind>("openrouter");
  const [model, setModel] = useState("");
  const [llmProviders, setLlmProviders] = useState<Array<{ id: LlmProviderKind; label: string; configured: boolean }>>([]);
  const [mode, setMode] = useState<GovernancePipelineMode>("standard");
  const [autoApply, setAutoApply] = useState(false);
  const [historyRefresh, setHistoryRefresh] = useState(0);

  const { pipeline, running, setRunning, runProject, stopPipeline, resumePipeline } = useGovernancePipeline();

  const load = () => {
    setLoading(true);
    api
      .projectDashboard(agent, session.project, session.projectPath)
      .then(setData)
      .catch((e) => alert(String(e)))
      .finally(() => setLoading(false));
  };

  useEffect(load, [agent, session.project, session.projectPath]);

  useEffect(() => {
    api.llmConfig().then((cfg) => {
      setProvider(cfg.defaultProvider);
      setModel(cfg.defaultModel);
      setLlmProviders(cfg.providers);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!pipeline?.status || pipeline.status === "running") return;
    setHistoryRefresh((n) => n + 1);
  }, [pipeline?.status, pipeline?.pipelineId]);

  const govern = async () => {
    try {
      await runProject(session.project, {
        agent,
        provider,
        model,
        locale,
        mode,
        autoApply,
      });
      load();
    } catch (e) {
      alert(String(e));
      setRunning(false);
    }
  };

  if (loading || !data) return <PanelLoadingSkeleton label={L.loading} />;

  return (
    <div className="panel project-dashboard workspace-panel">
      <header className="workspace-panel-header workspace-panel-header-row">
        <h2 className="card-title">
          <LayoutDashboard size={18} /> {L.title}
        </h2>
        <ActionButton variant="ghost" icon={RefreshCw} onClick={load} disabled={running}>
          {L.refresh}
        </ActionButton>
      </header>

      {pipeline && (
        <PipelineWorkflowPanel
          agent={agent}
          sessionId={pipeline.sessionId ?? session.id}
          projectRoot={data.context.projectRoot}
          pipeline={pipeline}
          running={running}
          locale={locale}
        />
      )}

      {running && !pipeline && (
        <section className="card pipeline-workflow-card">
          <div className="pipeline-active-banner is-running">
            <div className="pipeline-active-head">
              <div className="pipeline-active-title">
                <span className="improvement-loading-spinner" aria-hidden />
                <span>{locale === "ar" ? "جاري بدء حوكمة المشروع…" : "Starting project governance…"}</span>
              </div>
            </div>
          </div>
        </section>
      )}

      {data.eligibility.eligible && (
        <div className="notice warning workspace-notice">
          <span className="icon">!</span>
          <span>
            {data.eligibility.newSessions} {L.eligible}
          </span>
        </div>
      )}

      <ProjectMetricsHero
        title={data.context.projectRoot}
        subtitle={
          <>
            <span className={data.context.verified ? "badge-ok" : "badge-warn"}>
              {data.context.verified ? (locale === "ar" ? "موثّق" : "Verified") : locale === "ar" ? "غير موثّق" : "Unverified"}
            </span>
            {data.schedule.lastRunAt && (
              <span className="panel-hint inline-hint">
                {L.lastGovern}: {new Date(data.schedule.lastRunAt).toLocaleString()}
              </span>
            )}
          </>
        }
        stats={[
          { label: L.sessions, value: data.sessions.length, accent: true },
          { label: L.memoryFiles, value: data.context.files.length },
          { label: L.patterns, value: data.patterns.length },
          {
            label: L.newSessions,
            value: data.eligibility.newSessions,
            accent: data.eligibility.eligible,
            hint: data.eligibility.eligible ? L.eligible : undefined,
          },
        ]}
      />

      <GovernanceRunControls
        locale={locale}
        mode={mode}
        autoApply={autoApply}
        running={running}
        pipeline={pipeline}
        provider={provider}
        model={model}
        providers={llmProviders}
        onProviderChange={setProvider}
        onModelChange={setModel}
        showSessionAction={false}
        showExport={false}
        onModeChange={setMode}
        onAutoApplyChange={setAutoApply}
        onRunProject={govern}
        onStop={() => void stopPipeline().catch((e) => alert(String(e)))}
        onResume={() => void resumePipeline().catch((e) => alert(String(e)))}
      />

      <GovernanceHistoryPanel
        agent={agent}
        projectSlug={session.project}
        projectRoot={data.context.projectRoot}
        locale={locale}
        activePipelineId={pipeline?.pipelineId}
        refreshKey={historyRefresh}
      />

      <PatternGrid
        patterns={data.patterns}
        title={L.topPatterns}
        emptyMessage={L.noPatterns}
        limit={6}
        showSessions
        agent={agent}
        locale={locale}
      />

      <section className="card insights-card">
        <h3 className="card-title">{L.recentSessions}</h3>
        <div className="dashboard-sessions">
          {data.sessions.map((s) => (
            <button
              key={s.id}
              type="button"
              className="dashboard-session-row"
              onClick={() => onSelectSession?.(s.id)}
            >
              <span className="dashboard-session-title">{s.title}</span>
              <span className="dashboard-session-meta">
                {s.realTotal != null && <span>{s.realTotal.toLocaleString()} tok</span>}
                {s.hasCompaction && <span className="compaction-mark">{L.compacted}</span>}
              </span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
