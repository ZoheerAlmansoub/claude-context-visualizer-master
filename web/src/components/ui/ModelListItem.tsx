import type { LlmModelInfo } from "@shared/llm-model-info.ts";
import { formatContextLength, formatPricing } from "@shared/llm-model-info.ts";

type Props = {
  model: LlmModelInfo;
  selected?: boolean;
  active?: boolean;
  onSelect?: () => void;
  onHover?: () => void;
  id?: string;
};

export function ModelListItem({ model, selected, active, onSelect, onHover, id }: Props) {
  return (
    <button
      type="button"
      id={id}
      role="option"
      aria-selected={selected}
      className={`model-catalog-item${selected ? " selected" : ""}${active ? " active" : ""}`}
      onClick={onSelect}
      onMouseEnter={onHover}
    >
      <div className="model-catalog-item-main">
        <span className="model-catalog-item-name">{model.name}</span>
        <div className="model-catalog-badges">
          {model.isFree ? (
            <span className="model-badge model-badge-free">Free</span>
          ) : model.pricing ? (
            <span className="model-badge model-badge-paid">{formatPricing(model)}</span>
          ) : null}
          {model.contextLength != null && (
            <span className="model-badge model-badge-context">{formatContextLength(model.contextLength)}</span>
          )}
          {model.capabilities.includes("vision") && (
            <span className="model-badge model-badge-vision">Vision</span>
          )}
          {model.capabilities.includes("tools") && (
            <span className="model-badge model-badge-tools">Tools</span>
          )}
          {model.capabilities.includes("reasoning") && (
            <span className="model-badge model-badge-reasoning">Reasoning</span>
          )}
          {model.deprecated && (
            <span className="model-badge model-badge-deprecated">Deprecated</span>
          )}
        </div>
      </div>
      <div className="model-catalog-item-id">{model.id}</div>
    </button>
  );
}
