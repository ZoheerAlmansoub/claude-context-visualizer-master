import type { LlmModelInfo } from "@shared/llm-model-info.ts";
import { formatContextLength, formatPricing } from "@shared/llm-model-info.ts";
import { capabilityLabel, catalogLabels, type CatalogLocale } from "../../lib/model-display.ts";

type Props = {
  model: LlmModelInfo | null;
  locale?: CatalogLocale;
};

export function ModelDetailPanel({ model, locale = "en" }: Props) {
  const L = catalogLabels(locale);
  if (!model) {
    return <div className="model-detail-panel empty">{L.selectModel}</div>;
  }

  return (
    <div className="model-detail-panel">
      <div className="model-detail-title">{model.name}</div>
      <div className="model-detail-id">{model.id}</div>
      <div className="model-detail-grid">
        <span>{L.pricing}</span>
        <span>{model.isFree ? "Free" : formatPricing(model)}</span>
        <span>{L.context}</span>
        <span>{formatContextLength(model.contextLength)}</span>
        <span>{L.capabilities}</span>
        <span>{model.capabilities.map((c) => capabilityLabel(c, locale)).join(" · ") || "—"}</span>
      </div>
      {model.description && (
        <p className="model-detail-desc">
          <strong>{L.description}: </strong>
          {model.description}
        </p>
      )}
      {model.parameterSize && (
        <p className="model-detail-meta">
          {model.parameterSize}
          {model.quantization ? ` · ${model.quantization}` : ""}
        </p>
      )}
      {model.deprecated && (
        <p className="model-detail-warn">{L.deprecated}{model.expirationDate ? `: ${model.expirationDate}` : ""}</p>
      )}
    </div>
  );
}
