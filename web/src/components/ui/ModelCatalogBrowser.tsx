import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  filterModels,
  searchModels,
  sortModels,
  type LlmModelInfo,
  type ModelFilters,
  type ModelSortBy,
} from "@shared/llm-model-info.ts";
import { ChevronDown, Loader2, RefreshCw } from "lucide-react";
import { catalogLabels, modelSummaryBadges, sortLabel, type CatalogLocale } from "../../lib/model-display.ts";
import { ModelDetailPanel } from "./ModelDetailPanel.tsx";
import { ModelListItem } from "./ModelListItem.tsx";

type Props = {
  label?: string;
  value: string;
  onChange: (modelId: string) => void;
  models: LlmModelInfo[];
  loading?: boolean;
  error?: string | null;
  canFetch?: boolean;
  onRetry?: () => void;
  locale?: CatalogLocale;
  visionOnly?: boolean;
  disabled?: boolean;
};

const SORT_OPTIONS: ModelSortBy[] = ["recommended", "free-first", "context-desc", "price-asc", "name"];

export function ModelCatalogBrowser({
  label,
  value,
  onChange,
  models,
  loading = false,
  error = null,
  canFetch = true,
  onRetry,
  locale = "en",
  visionOnly = false,
  disabled = false,
}: Props) {
  const L = catalogLabels(locale);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [sortBy, setSortBy] = useState<ModelSortBy>("recommended");
  const [filters, setFilters] = useState<ModelFilters>({ chatOnly: true, visionOnly });
  const [activeIndex, setActiveIndex] = useState(0);
  const [hoverModel, setHoverModel] = useState<LlmModelInfo | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const effectiveFilters = useMemo(
    () => ({ ...filters, visionOnly: visionOnly || filters.visionOnly }),
    [filters, visionOnly],
  );

  const displayed = useMemo(() => {
    let list = filterModels(models, effectiveFilters);
    list = searchModels(list, query);
    list = sortModels(list, sortBy);
    return list;
  }, [models, effectiveFilters, query, sortBy]);

  const selectedModel = models.find((m) => m.id === value) ?? null;
  const detailModel = hoverModel ?? selectedModel ?? displayed[activeIndex] ?? null;

  const rowVirtualizer = useVirtualizer({
    count: displayed.length,
    getScrollElement: () => listRef.current,
    estimateSize: () => 56,
    overscan: 8,
  });

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    searchRef.current?.focus();
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) close();
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open, close]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query, sortBy, filters, visionOnly]);

  const selectAt = (index: number) => {
    const m = displayed[index];
    if (!m) return;
    onChange(m.id);
    close();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open) {
      if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown") {
        e.preventDefault();
        setOpen(true);
      }
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      close();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, displayed.length - 1));
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    }
    if (e.key === "Enter") {
      e.preventDefault();
      selectAt(activeIndex);
    }
  };

  const toggleFilter = (key: keyof ModelFilters) => {
    setFilters((f) => ({ ...f, [key]: !f[key] }));
  };

  const emptyMessage = !canFetch
    ? L.emptyCredentials
    : error
      ? error
      : loading
        ? L.loading
        : displayed.length === 0
          ? L.emptyFilter
          : L.selectModel;

  return (
    <div className="model-catalog-root" ref={rootRef}>
      {label && <span className="control-label">{label}</span>}
      <button
        type="button"
        className="model-catalog-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={onKeyDown}
      >
        <div className="model-catalog-trigger-body">
          {loading && !selectedModel ? (
            <span className="model-catalog-loading-inline">
              <Loader2 size={14} className="spin" /> {L.loading}
            </span>
          ) : selectedModel ? (
            <>
              <span className="model-catalog-trigger-name">{selectedModel.name}</span>
              <span className="model-catalog-trigger-badges">
                {modelSummaryBadges(selectedModel).slice(0, 3).join(" · ")}
              </span>
            </>
          ) : (
            <span className="model-catalog-trigger-placeholder">{emptyMessage}</span>
          )}
        </div>
        <ChevronDown size={16} className={open ? "rotated" : ""} />
      </button>

      {open && (
        <div className="model-catalog-popover" role="presentation">
          <div className="model-catalog-toolbar">
            <input
              ref={searchRef}
              type="search"
              className="model-catalog-search"
              placeholder={L.search}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
            />
            <select
              className="model-catalog-sort"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as ModelSortBy)}
              aria-label={L.sort}
            >
              {SORT_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {sortLabel(s, locale)}
                </option>
              ))}
            </select>
          </div>
          <div className="model-catalog-filters">
            <button
              type="button"
              className={`model-filter-chip${filters.freeOnly ? " on" : ""}`}
              onClick={() => toggleFilter("freeOnly")}
            >
              {L.freeOnly}
            </button>
            <button
              type="button"
              className={`model-filter-chip${filters.vision ? " on" : ""}`}
              onClick={() => toggleFilter("vision")}
            >
              {L.vision}
            </button>
            <button
              type="button"
              className={`model-filter-chip${filters.tools ? " on" : ""}`}
              onClick={() => toggleFilter("tools")}
            >
              {L.tools}
            </button>
            {!visionOnly && (
              <button
                type="button"
                className={`model-filter-chip${filters.chatOnly ? " on" : ""}`}
                onClick={() => toggleFilter("chatOnly")}
              >
                {L.chatOnly}
              </button>
            )}
            {error && onRetry && (
              <button type="button" className="model-filter-chip retry" onClick={onRetry}>
                <RefreshCw size={12} /> {L.retry}
              </button>
            )}
          </div>

          <div
            ref={listRef}
            className="model-catalog-list"
            role="listbox"
            aria-label={label ?? L.selectModel}
          >
            {loading && displayed.length === 0 ? (
              <div className="model-catalog-empty">{L.loading}</div>
            ) : displayed.length === 0 ? (
              <div className="model-catalog-empty">{emptyMessage}</div>
            ) : (
              <div style={{ height: rowVirtualizer.getTotalSize(), position: "relative" }}>
                {rowVirtualizer.getVirtualItems().map((row) => {
                  const model = displayed[row.index];
                  return (
                    <div
                      key={model.id}
                      style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        width: "100%",
                        transform: `translateY(${row.start}px)`,
                      }}
                    >
                      <ModelListItem
                        id={`model-option-${row.index}`}
                        model={model}
                        selected={model.id === value}
                        active={row.index === activeIndex}
                        onSelect={() => selectAt(row.index)}
                        onHover={() => setHoverModel(model)}
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <ModelDetailPanel model={detailModel} locale={locale} />
        </div>
      )}
    </div>
  );
}
