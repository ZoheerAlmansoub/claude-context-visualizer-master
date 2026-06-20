import { useEffect, useState } from "react";
import { Shield, FolderOpen } from "lucide-react";
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
import { GovernanceRunControls } from "./ui/GovernanceRunControls";
import { PanelLoadingSkeleton } from "./ui/PanelLoadingSkeleton";
import { PatternGrid } from "./ui/PatternGrid";
import { PipelineWorkflowPanel } from "./ui/PipelineWorkflowPanel";
import { GovernanceHistoryPanel } from "./ui/GovernanceHistoryPanel";

type Props = {
  agent: AgentKind;
  session: SessionListItem;
  locale?: "ar" | "en";
};

const LABELS = {
  en: {
    title: "Project governance",
    context: "Project context",
    projectRoot: "Project root",
    verified: "Verified",
    unverified: "Unverified",
    patterns: "Cross-session patterns",
    noPatterns: "No cross-session patterns yet.",
    loadContext: "Loading project context…",
    filesLoaded: "memory/rules files",
    expandContext: "Show file list",
    collapseContext: "Hide file list",
  },
  ar: {
    title: "حوكمة المشروع",
    context: "سياق المشروع",
    projectRoot: "جذر المشروع",
    verified: "موثّق",
    unverified: "غير موثّق",
    patterns: "أنماط عبر الجلسات",
    noPatterns: "لا توجد أنماط cross-session بعد.",
    loadContext: "جاري تحميل سياق المشروع…",
    filesLoaded: "ملفات memory/rules",
    expandContext: "عرض قائمة الملفات",
    collapseContext: "إخفاء قائمة الملفات",
  },
} as const;

export function GovernancePanel({ agent, session, locale = "en" }: Props) {
  const L = LABELS[locale];
  const [provider, setProvider] = useState<LlmProviderKind>("openrouter");
  const [model, setModel] = useState("");
  const [llmProviders, setLlmProviders] = useState<Array<{ id: LlmProviderKind; label: string; configured: boolean }>>([]);
  const [mode, setMode] = useState<GovernancePipelineMode>("standard");
  const [autoApply, setAutoApply] = useState(false);
  const [context, setContext] = useState<ProjectContextSummary | null>(null);
  const [showFiles, setShowFiles] = useState(false);
  const [patterns, setPatterns] = useState<RecurringPattern[]>([]);
  const [loading, setLoading] = useState(true);
  const [historyRefresh, setHistoryRefresh] = useState(0);

  const {
    pipeline,
    setPipeline,
    running,
    setRunning,
    runSession,
    runProject,
    stopPipeline,
    resumePipeline,
    pollError,
  } = useGovernancePipeline();

  useEffect(() => {
    api.llmConfig().then((cfg) => {
      setProvider(cfg.defaultProvider);
      setModel(cfg.defaultModel);
      setLlmProviders(cfg.providers);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      api.projectContextSummary(agent, session.project, session.projectPath),
      api.projectInsights(agent, session.project),
    ])
      .then(([ctx, p]) => {
        setContext(ctx);
        setPatterns(p.patterns);
      })
      .catch((e) => alert(String(e)))
      .finally(() => setLoading(false));
  }, [agent, session.project, session.projectPath]);

  useEffect(() => {
    if (!pipeline?.status || pipeline.status === "running") return;
    setHistoryRefresh((n) => n + 1);
  }, [pipeline?.status, pipeline?.pipelineId]);

  const runOpts = { agent, provider, model, locale, mode, autoApply };

  const handleRunSession = async () => {
    try {
      await runSession(session.id, runOpts);
    } catch (e) {
      alert(String(e));
      setRunning(false);
    }
  };

  const handleRunProject = async () => {
    try {
      await runProject(session.project, runOpts);
    } catch (e) {
      alert(String(e));
      setRunning(false);
    }
  };

  const handleExport = async () => {
    setRunning(true);
    try {
      const md = await api.fetchPlaybook(agent, session.project, {
        save: true,
        refresh: false,
        pipelineId: pipeline?.pipelineId,
      });
      setPipeline((prev) => ({
        ...(prev ?? { pipelineId: "", scope: "project", steps: [] }),
        playbookMarkdown: md,
      }));
    } catch (e) {
      alert(String(e));
    } finally {
      setRunning(false);
    }
  };

  if (loading) return <PanelLoadingSkeleton label={L.loadContext} />;

  return (
    <div className="panel governance-panel workspace-panel">
      <header className="workspace-panel-header">
        <h2 className="card-title">
          <Shield size={18} /> {L.title}
        </h2>
      </header>

      <section className="governance-workspace">
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
          onModeChange={setMode}
          onAutoApplyChange={setAutoApply}
          onRunSession={handleRunSession}
          onRunProject={handleRunProject}
          onStop={() => void stopPipeline().catch((e) => alert(String(e)))}
          onResume={() => void resumePipeline().catch((e) => alert(String(e)))}
          onExport={() => void handleExport()}
        />

        {pollError && (
          <p className="panel-hint pipeline-step-error" role="alert">
            {locale === "ar" ? `خطأ في polling: ${pollError}` : `Pipeline poll error: ${pollError}`}
          </p>
        )}

        {pipeline && (
          <PipelineWorkflowPanel
            agent={agent}
            sessionId={session.id}
            projectRoot={context?.projectRoot}
            pipeline={pipeline}
            running={running}
            locale={locale}
          />
        )}
      </section>

      <GovernanceHistoryPanel
        agent={agent}
        projectSlug={session.project}
        projectRoot={context?.projectRoot}
        locale={locale}
        activePipelineId={pipeline?.pipelineId}
        refreshKey={historyRefresh}
      />

      {context && (
        <section className="card context-card">
          <div className="context-card-head">
            <h3 className="card-title">
              <FolderOpen size={16} /> {L.context}
            </h3>
            <span className={context.verified ? "badge-ok" : "badge-warn"}>
              {context.verified ? L.verified : L.unverified}
            </span>
          </div>
          <p className="panel-hint context-path">
            <strong>{L.projectRoot}:</strong> {context.projectRoot}
          </p>
          {context.warning && <p className="panel-hint notice-inline">{context.warning}</p>}
          <p className="panel-hint">
            {context.files.length} {L.filesLoaded}
            <span className="context-hash"> · {context.inventoryHash}</span>
            {context.files.length > 0 && (
              <button type="button" className="link-btn" onClick={() => setShowFiles((v) => !v)}>
                {showFiles ? L.collapseContext : L.expandContext}
              </button>
            )}
          </p>
          {showFiles && (
            <ul className="context-file-list">
              {context.files.map((f) => (
                <li key={f.relativePath}>
                  <code>{f.relativePath}</code>
                  <span>{f.sizeBytes.toLocaleString()} bytes</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <PatternGrid
        patterns={patterns}
        title={L.patterns}
        emptyMessage={L.noPatterns}
        showSessions
        agent={agent}
        locale={locale}
      />
    </div>
  );
}
