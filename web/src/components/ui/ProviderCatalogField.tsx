import { useEffect, useMemo } from "react";
import type { LlmProviderKind, LlmProviderSettingsView } from "../../api";
import { UNCHANGED_KEY_SENTINEL } from "../../api";
import { useModelCatalog, type ModelCatalogCredentials } from "../../hooks/useModelCatalog";
import { ModelCatalogBrowser } from "./ModelCatalogBrowser";

type ProviderFormSlice = {
  apiKey: string;
  defaultModel: string;
  baseUrl: string;
  apiUrl: string;
  textModel: string;
  visionModel: string;
};

type Props = {
  provider: LlmProviderKind;
  providerView?: LlmProviderSettingsView;
  form: ProviderFormSlice;
  value: string;
  onChange: (modelId: string) => void;
  label: string;
  visionOnly?: boolean;
  fallbackModelId?: string;
};

function toCredentials(providerView: LlmProviderSettingsView | undefined, form: ProviderFormSlice): ModelCatalogCredentials {
  return {
    apiKey: form.apiKey,
    baseUrl: form.baseUrl,
    apiUrl: form.apiUrl,
    configured: providerView?.configured,
    hasApiKey: providerView?.hasApiKey,
  };
}

export function ProviderCatalogField({
  provider,
  providerView,
  form,
  value,
  onChange,
  label,
  visionOnly = false,
  fallbackModelId,
}: Props) {
  const credentials = useMemo(
    () => toCredentials(providerView, form),
    [providerView, form.apiKey, form.baseUrl, form.apiUrl, form.defaultModel],
  );

  const catalog = useModelCatalog(provider, credentials, {
    autoFetch: true,
    fallbackModelId,
  });

  useEffect(() => {
    if (catalog.loading || catalog.models.length === 0) return;
    if (value && catalog.models.some((m) => m.id === value)) return;
    const picked = catalog.pickDefault(value || undefined);
    if (picked && picked !== value) onChange(picked);
  }, [catalog.loading, catalog.models, catalog.pickDefault, value, onChange]);

  return (
    <ModelCatalogBrowser
      label={label}
      value={value}
      onChange={onChange}
      models={catalog.models}
      loading={catalog.loading}
      error={catalog.error}
      canFetch={catalog.canFetch}
      onRetry={catalog.retry}
      visionOnly={visionOnly}
    />
  );
}

export function buildCredentialsForProvider(
  provider: LlmProviderKind,
  forms: Record<LlmProviderKind, ProviderFormSlice>,
  settings: { providers: LlmProviderSettingsView[] } | null,
): ModelCatalogCredentials {
  const view = settings?.providers.find((p) => p.id === provider);
  return toCredentials(view, forms[provider]);
}
