import { useCallback, useEffect, useState } from "react";
import {
  api,
  UNCHANGED_KEY_SENTINEL,
  type LlmConfig,
  type LlmProviderKind,
  type LlmSettingsView,
  type LlmTestResult,
} from "../api";

type Props = {
  onClose: () => void;
  onSaved?: (config: LlmConfig) => void;
};

type ProviderForm = {
  apiKey: string;
  defaultModel: string;
  baseUrl: string;
  apiUrl: string;
  textModel: string;
  visionModel: string;
};

function emptyProviderForm(): ProviderForm {
  return {
    apiKey: UNCHANGED_KEY_SENTINEL,
    defaultModel: "",
    baseUrl: "",
    apiUrl: "",
    textModel: "",
    visionModel: "",
  };
}

function formsFromSettings(settings: LlmSettingsView): Record<LlmProviderKind, ProviderForm> {
  const map = {
    anthropic: emptyProviderForm(),
    openai: emptyProviderForm(),
    ollama: emptyProviderForm(),
    nvidia: emptyProviderForm(),
  };
  for (const p of settings.providers) {
    map[p.id] = {
      apiKey: UNCHANGED_KEY_SENTINEL,
      defaultModel: p.defaultModel,
      baseUrl: p.baseUrl ?? "",
      apiUrl: p.apiUrl ?? "",
      textModel: p.textModel ?? "",
      visionModel: p.visionModel ?? "",
    };
  }
  return map;
}

export function LlmSettings({ onClose, onSaved }: Props) {
  const [settings, setSettings] = useState<LlmSettingsView | null>(null);
  const [defaultProvider, setDefaultProvider] = useState<LlmProviderKind>("anthropic");
  const [defaultModel, setDefaultModel] = useState("");
  const [activeTab, setActiveTab] = useState<LlmProviderKind>("anthropic");
  const [forms, setForms] = useState<Record<LlmProviderKind, ProviderForm>>({
    anthropic: emptyProviderForm(),
    openai: emptyProviderForm(),
    ollama: emptyProviderForm(),
    nvidia: emptyProviderForm(),
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<LlmTestResult | null>(null);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    api
      .llmSettings()
      .then((s) => {
        setSettings(s);
        setDefaultProvider(s.defaultProvider);
        setDefaultModel(s.defaultModel);
        setForms(formsFromSettings(s));
        setActiveTab(s.defaultProvider);
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const patchFromForms = (): Record<string, string | LlmProviderKind> => {
    const f = forms[activeTab];
    const base: Record<string, string | LlmProviderKind> = {
      defaultProvider,
      defaultModel,
    };
    if (activeTab === "anthropic") {
      base.anthropicApiKey = f.apiKey;
      base.anthropicModel = f.defaultModel;
    } else if (activeTab === "openai") {
      base.openaiApiKey = f.apiKey;
      base.openaiModel = f.defaultModel;
    } else if (activeTab === "ollama") {
      base.ollamaBaseUrl = f.baseUrl;
      base.ollamaModel = f.defaultModel;
    } else if (activeTab === "nvidia") {
      base.nvidiaApiKey = f.apiKey;
      base.nvidiaApiUrl = f.apiUrl;
      base.nvidiaTextModel = f.textModel || f.defaultModel;
      base.nvidiaVisionModel = f.visionModel || f.textModel || f.defaultModel;
    }
    return base;
  };

  const testOverrides = () => {
    const f = forms[activeTab];
    return {
      apiKey: f.apiKey === UNCHANGED_KEY_SENTINEL ? undefined : f.apiKey,
      baseUrl: f.baseUrl || undefined,
      apiUrl: f.apiUrl || undefined,
      model:
        activeTab === "nvidia"
          ? f.textModel || f.defaultModel || undefined
          : f.defaultModel || undefined,
    };
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveMsg(null);
    setError(null);
    try {
      const res = await api.saveLlmSettings({
        ...patchFromForms(),
        // persist all provider models on save
        anthropicApiKey: forms.anthropic.apiKey,
        anthropicModel: forms.anthropic.defaultModel,
        openaiApiKey: forms.openai.apiKey,
        openaiModel: forms.openai.defaultModel,
        ollamaBaseUrl: forms.ollama.baseUrl,
        ollamaModel: forms.ollama.defaultModel,
        nvidiaApiKey: forms.nvidia.apiKey,
        nvidiaApiUrl: forms.nvidia.apiUrl,
        nvidiaTextModel: forms.nvidia.textModel || forms.nvidia.defaultModel,
        nvidiaVisionModel: forms.nvidia.visionModel || forms.nvidia.textModel || forms.nvidia.defaultModel,
      });
      setSettings(res.settings);
      setForms(formsFromSettings(res.settings));
      setSaveMsg("Saved — active immediately, no restart needed.");
      const full = await api.llmConfig();
      onSaved?.(full);
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    setError(null);
    try {
      const result = await api.testLlmConnection(activeTab, testOverrides());
      setTestResult(result);
    } catch (e) {
      setError(String(e));
    } finally {
      setTesting(false);
    }
  };

  const updateForm = (patch: Partial<ProviderForm>) => {
    setForms((prev) => ({
      ...prev,
      [activeTab]: { ...prev[activeTab], ...patch },
    }));
  };

  const activeProvider = settings?.providers.find((p) => p.id === activeTab);
  const f = forms[activeTab];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-lg llm-settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="llm-settings-header">
          <div>
            <h3>LLM Settings</h3>
            <p className="modal-hint">
              Changes apply instantly to analysis and artifacts. Stored locally in{" "}
              <code>.cache/llm-settings.json</code>
            </p>
          </div>
          <button type="button" className="btn-icon" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        {loading && <div className="loading">Loading settings…</div>}
        {error && <div className="notice warning">{error}</div>}
        {saveMsg && <div className="notice compaction">{saveMsg}</div>}

        {!loading && settings && (
          <>
            <div className="llm-global-row">
              <label>
                Default provider
                <select
                  value={defaultProvider}
                  onChange={(e) => {
                    const p = e.target.value as LlmProviderKind;
                    setDefaultProvider(p);
                    setActiveTab(p);
                    const prov = settings.providers.find((x) => x.id === p);
                    if (prov) setDefaultModel(prov.defaultModel);
                  }}
                >
                  {settings.providers.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Default model
                <input
                  type="text"
                  value={defaultModel}
                  onChange={(e) => setDefaultModel(e.target.value)}
                  placeholder="Model for analysis when not specified"
                />
              </label>
            </div>

            <div className="llm-tabs">
              {settings.providers.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className={`llm-tab${activeTab === p.id ? " active" : ""}`}
                  onClick={() => setActiveTab(p.id)}
                >
                  {p.label}
                  <span className={`dot-status ${p.configured ? "ok" : "warn"}`} />
                </button>
              ))}
            </div>

            <div className="llm-provider-panel">
              <div className="llm-provider-status">
                <span className={activeProvider?.configured ? "status-ok" : "status-warn"}>
                  {activeProvider?.configured ? "Configured" : "Not configured"}
                </span>
                {activeProvider?.hasApiKey && activeProvider.apiKeyMasked && (
                  <span className="modal-hint">Key: {activeProvider.apiKeyMasked}</span>
                )}
              </div>

              {activeTab !== "ollama" && (
                <label>
                  API key
                  <input
                    type="password"
                    value={f.apiKey === UNCHANGED_KEY_SENTINEL ? "" : f.apiKey}
                    placeholder={
                      activeProvider?.hasApiKey
                        ? "Leave blank to keep current key"
                        : "Enter API key"
                    }
                    onChange={(e) =>
                      updateForm({ apiKey: e.target.value || UNCHANGED_KEY_SENTINEL })
                    }
                    autoComplete="off"
                  />
                </label>
              )}

              {activeTab === "ollama" && (
                <label>
                  Base URL
                  <input
                    type="url"
                    value={f.baseUrl}
                    onChange={(e) => updateForm({ baseUrl: e.target.value })}
                    placeholder="http://localhost:11434"
                  />
                </label>
              )}

              {activeTab === "nvidia" && (
                <>
                  <label>
                    API URL
                    <input
                      type="url"
                      value={f.apiUrl}
                      onChange={(e) => updateForm({ apiUrl: e.target.value })}
                      placeholder="https://integrate.api.nvidia.com/v1"
                    />
                  </label>
                  <label>
                    Text model
                    <input
                      type="text"
                      value={f.textModel || f.defaultModel}
                      onChange={(e) => updateForm({ textModel: e.target.value, defaultModel: e.target.value })}
                    />
                  </label>
                  <label>
                    Vision model
                    <input
                      type="text"
                      value={f.visionModel}
                      onChange={(e) => updateForm({ visionModel: e.target.value })}
                    />
                  </label>
                </>
              )}

              {activeTab !== "nvidia" && (
                <label>
                  Default model
                  <input
                    type="text"
                    value={f.defaultModel}
                    onChange={(e) => updateForm({ defaultModel: e.target.value })}
                  />
                </label>
              )}

              {testResult && testResult.provider === activeTab && (
                <div className={`llm-test-result${testResult.ok ? " ok" : " fail"}`}>
                  <strong>{testResult.ok ? "✓" : "✗"} {testResult.message}</strong>
                  <div className="modal-hint">
                    {testResult.model} · {testResult.latencyMs}ms
                    {testResult.preview ? ` · "${testResult.preview}"` : ""}
                  </div>
                  {testResult.error && <div className="test-error">{testResult.error}</div>}
                </div>
              )}
            </div>

            <div className="modal-actions llm-settings-actions">
              <button type="button" className="btn-secondary" onClick={handleTest} disabled={testing}>
                {testing ? "Testing…" : "Test connection"}
              </button>
              <button type="button" className="btn-secondary" onClick={load} disabled={loading}>
                Reset
              </button>
              <button type="button" className="btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? "Saving…" : "Save settings"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
