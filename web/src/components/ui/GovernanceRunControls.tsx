import { Download, Play, RefreshCw, RotateCcw, Square } from "lucide-react";
import type { GovernancePipelineMode, GovernancePipelineResult, LlmProviderKind } from "../../api";
import { ActionButton } from "./ActionButton";

type Props = {
  locale?: "ar" | "en";
  mode: GovernancePipelineMode;
  autoApply: boolean;
  running: boolean;
  pipeline: GovernancePipelineResult | null;
  provider?: LlmProviderKind;
  model?: string;
  providers?: Array<{ id: LlmProviderKind; label: string; configured: boolean }>;
  showSessionAction?: boolean;
  showProjectAction?: boolean;
  showExport?: boolean;
  onModeChange: (mode: GovernancePipelineMode) => void;
  onAutoApplyChange: (value: boolean) => void;
  onProviderChange?: (provider: LlmProviderKind) => void;
  onModelChange?: (model: string) => void;
  onRunSession?: () => void;
  onRunProject?: () => void;
  onStop?: () => void;
  onResume?: () => void;
  onExport?: () => void;
};

const LABELS = {
  en: {
    mode: "Mode",
    provider: "Provider",
    model: "Model",
    quick: "Quick",
    standard: "Standard",
    full: "Full",
    autoApply: "Auto-apply high confidence",
    runSession: "Govern this session",
    runProject: "Govern this project",
    running: "Running pipeline…",
    stop: "Stop",
    resume: "Resume",
    export: "Export playbook",
  },
  ar: {
    mode: "الوضع",
    provider: "المزوّد",
    model: "النموذج",
    quick: "سريع",
    standard: "قياسي",
    full: "كامل",
    autoApply: "تطبيق تلقائي (ثقة عالية)",
    runSession: "حوكمة هذه الجلسة",
    runProject: "حوكمة المشروع",
    running: "جاري التشغيل…",
    stop: "إيقاف",
    resume: "استئناف",
    export: "تصدير Playbook",
  },
} as const;

export function GovernanceRunControls({
  locale = "en",
  mode,
  autoApply,
  running,
  pipeline,
  showSessionAction = true,
  showProjectAction = true,
  showExport = true,
  provider,
  model = "",
  providers = [],
  onModeChange,
  onAutoApplyChange,
  onProviderChange,
  onModelChange,
  onRunSession,
  onRunProject,
  onStop,
  onResume,
  onExport,
}: Props) {
  const L = LABELS[locale];

  return (
    <div className="card governance-controls-card">
      <div className="governance-controls-grid">
        <label className="control-field">
          <span className="control-label">{L.mode}</span>
          <select
            value={mode}
            onChange={(e) => onModeChange(e.target.value as GovernancePipelineMode)}
            disabled={running}
          >
            <option value="quick">{L.quick}</option>
            <option value="standard">{L.standard}</option>
            <option value="full">{L.full}</option>
          </select>
        </label>
        <label className="control-field checkbox-field">
          <input
            type="checkbox"
            checked={autoApply}
            onChange={(e) => onAutoApplyChange(e.target.checked)}
            disabled={running}
          />
          <span>{L.autoApply}</span>
        </label>
        {onProviderChange && providers.length > 0 && (
          <label className="control-field">
            <span className="control-label">{L.provider}</span>
            <select
              value={provider}
              onChange={(e) => onProviderChange(e.target.value as LlmProviderKind)}
              disabled={running}
            >
              {providers.map((p) => (
                <option key={p.id} value={p.id} disabled={!p.configured && p.id !== "ollama"}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
        )}
        {onModelChange && (
          <label className="control-field">
            <span className="control-label">{L.model}</span>
            <input
              type="text"
              value={model}
              onChange={(e) => onModelChange(e.target.value)}
              disabled={running}
              placeholder="default"
            />
          </label>
        )}
      </div>
      <div className="governance-actions">
        {showSessionAction && onRunSession && (
          <ActionButton onClick={onRunSession} disabled={running} variant="primary" icon={Play} loading={running}>
            {running ? L.running : L.runSession}
          </ActionButton>
        )}
        {showProjectAction && onRunProject && (
          <ActionButton onClick={onRunProject} disabled={running} variant="secondary" icon={RefreshCw}>
            {L.runProject}
          </ActionButton>
        )}
        {running && onStop && (
          <ActionButton onClick={onStop} variant="secondary" icon={Square}>
            {L.stop}
          </ActionButton>
        )}
        {!running && pipeline?.status === "cancelled" && onResume && (
          <ActionButton onClick={onResume} variant="secondary" icon={RotateCcw}>
            {L.resume}
          </ActionButton>
        )}
        {showExport && onExport && (
          <ActionButton onClick={onExport} disabled={running} variant="ghost" icon={Download}>
            {L.export}
          </ActionButton>
        )}
      </div>
    </div>
  );
}
