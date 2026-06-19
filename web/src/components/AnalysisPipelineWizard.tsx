import { useState } from "react";
import { Wand2 } from "lucide-react";
import {
  api,
  type AgentKind,
  type AnalyzeResult,
  type AnalyzeType,
  type LlmProviderKind,
  type SessionListItem,
} from "../api";
import { SESSION_WIZARD_STEPS } from "../lib/pipeline-steps";
import { ActionButton } from "./ui/ActionButton";
import { AnalysisResultCards } from "./ui/AnalysisResultCards";
import { ApplyPackPanel } from "./ui/ApplyPackPanel";
import { collectFromAnalysisResult } from "../lib/apply-pack";

type Props = {
  agent: AgentKind;
  session: SessionListItem;
  provider: LlmProviderKind;
  model: string;
  locale: "ar" | "en";
};

type StepState = {
  type: AnalyzeType;
  status: "pending" | "running" | "done" | "error";
  result?: AnalyzeResult;
  error?: string;
};

export function AnalysisPipelineWizard({ agent, session, provider, model, locale }: Props) {
  const [open, setOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [steps, setSteps] = useState<StepState[]>(() =>
    SESSION_WIZARD_STEPS.map((type) => ({ type, status: "pending" })),
  );
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const run = async () => {
    setRunning(true);
    const next = SESSION_WIZARD_STEPS.map((type) => ({ type, status: "pending" as const }));
    setSteps(next);

    for (let i = 0; i < SESSION_WIZARD_STEPS.length; i++) {
      const type = SESSION_WIZARD_STEPS[i]!;
      setSteps((prev) => prev.map((s, idx) => (idx === i ? { ...s, status: "running" } : s)));
      try {
        const result = await api.analyze(agent, session.id, {
          type,
          provider,
          model,
          locale,
          force: true,
        });
        setSteps((prev) =>
          prev.map((s, idx) => (idx === i ? { type, status: "done", result } : s)),
        );
      } catch (e) {
        setSteps((prev) =>
          prev.map((s, idx) =>
            idx === i ? { type, status: "error", error: String(e) } : s,
          ),
        );
      }
    }
    setRunning(false);
  };

  const allPackItems = steps
    .filter((s) => s.result)
    .flatMap((s) => collectFromAnalysisResult(s.result!, agent));

  return (
    <section className="analysis-wizard">
      <div className="analysis-wizard-head">
        <h3 className="card-title">
          <Wand2 size={16} /> Guided session pipeline
        </h3>
        <ActionButton variant="secondary" onClick={() => setOpen((v) => !v)}>
          {open ? "Hide" : "Show"}
        </ActionButton>
        <ActionButton variant="primary" disabled={running} onClick={run}>
          {running ? "Running…" : "Run full workflow"}
        </ActionButton>
      </div>
      {open && (
        <>
          <ul className="pipeline-steps">
            {steps.map((s) => (
              <li key={s.type} className={`pipeline-step pipeline-${s.status}`}>
                <code>{s.type}</code> — {s.status}
                {s.error ? `: ${s.error}` : ""}
              </li>
            ))}
          </ul>
          {steps.map(
            (s) =>
              s.result && (
                <div key={`result-${s.type}`} className="wizard-step-result">
                  <h4>{s.type}</h4>
                  <AnalysisResultCards
                    result={s.result}
                    copiedId={copiedId}
                    onCopy={(id, text) => {
                      void navigator.clipboard.writeText(text).then(() => {
                        setCopiedId(id);
                        setTimeout(() => setCopiedId(null), 1500);
                      });
                    }}
                    locale={locale}
                    agent={agent}
                    projectRoot={session.projectPath}
                  />
                </div>
              ),
          )}
          {allPackItems.length > 0 && (
            <ApplyPackPanel items={allPackItems} projectRoot={session.projectPath} locale={locale} />
          )}
        </>
      )}
    </section>
  );
}
