import {
  formatContextLength,
  formatPricing,
  type LlmModelInfo,
  type ModelSortBy,
} from "@shared/llm-model-info.ts";

export { formatContextLength, formatPricing };

export type CatalogLocale = "en" | "ar";

const LABELS = {
  en: {
    search: "Search models…",
    sort: "Sort",
    recommended: "Recommended",
    freeFirst: "Free first",
    contextDesc: "Context (high→low)",
    name: "Name",
    priceAsc: "Price (low→high)",
    freeOnly: "Free",
    vision: "Vision",
    tools: "Tools",
    chatOnly: "Chat",
    loading: "Loading models…",
    emptyCredentials: "Enter API key to load models",
    emptyFilter: "No models match filters",
    retry: "Retry",
    selectModel: "Select model",
    context: "Context",
    pricing: "Pricing",
    capabilities: "Capabilities",
    description: "Description",
    deprecated: "Deprecated",
    local: "Local",
  },
  ar: {
    search: "بحث في النماذج…",
    sort: "ترتيب",
    recommended: "موصى به",
    freeFirst: "المجانية أولاً",
    contextDesc: "السياق (الأكبر)",
    name: "الاسم",
    priceAsc: "السعر (الأقل)",
    freeOnly: "مجاني",
    vision: "رؤية",
    tools: "أدوات",
    chatOnly: "محادثة",
    loading: "جاري تحميل النماذج…",
    emptyCredentials: "أدخل مفتاح API لتحميل النماذج",
    emptyFilter: "لا توجد نماذج مطابقة",
    retry: "إعادة المحاولة",
    selectModel: "اختر نموذجاً",
    context: "السياق",
    pricing: "التسعير",
    capabilities: "القدرات",
    description: "الوصف",
    deprecated: "منتهي",
    local: "محلي",
  },
} as const;

export function catalogLabels(locale: CatalogLocale = "en") {
  return LABELS[locale];
}

export function sortLabel(sort: ModelSortBy, locale: CatalogLocale = "en"): string {
  const L = LABELS[locale];
  switch (sort) {
    case "free-first":
      return L.freeFirst;
    case "context-desc":
      return L.contextDesc;
    case "name":
      return L.name;
    case "price-asc":
      return L.priceAsc;
    default:
      return L.recommended;
  }
}

export function capabilityLabel(cap: string, locale: CatalogLocale = "en"): string {
  if (locale === "ar") {
    const map: Record<string, string> = {
      chat: "محادثة",
      vision: "رؤية",
      tools: "أدوات",
      reasoning: "تفكير",
      embedding: "تضمين",
    };
    return map[cap] ?? cap;
  }
  return cap;
}

export function modelSummaryBadges(model: LlmModelInfo): string[] {
  const badges: string[] = [];
  if (model.isFree) badges.push("Free");
  else if (model.pricing) badges.push(formatPricing(model));
  if (model.contextLength) badges.push(formatContextLength(model.contextLength));
  if (model.capabilities.includes("vision")) badges.push("Vision");
  if (model.capabilities.includes("tools")) badges.push("Tools");
  return badges;
}
