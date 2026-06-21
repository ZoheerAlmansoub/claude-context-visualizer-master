import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { filterModels, sortModels } from "../../../shared/llm-model-info.ts";
import { openaiParser } from "./openai.ts";
import { enrichOpenCodeZenFromCatalog, parseOpenCodeZenList } from "./opencode-zen.ts";
import { parseOpenRouterList } from "./openrouter.ts";
import { ollamaParser } from "./ollama.ts";

const FIXTURES = join(import.meta.dir, "../../fixtures/models");

describe("model-parsers", () => {
  test("openrouter parses free and paid models", () => {
    const json = JSON.parse(readFileSync(join(FIXTURES, "openrouter-sample.json"), "utf8"));
    const models = parseOpenRouterList(json, "openrouter");
    expect(models.length).toBe(2);
    const free = models.find((m) => m.id.includes("free"));
    expect(free?.isFree).toBe(true);
    expect(free?.capabilities).toContain("vision");
    expect(free?.capabilities).toContain("tools");
    const paid = models.find((m) => m.id === "openai/gpt-4o");
    expect(paid?.isFree).toBe(false);
    expect(paid?.pricing?.promptPer1M).toBeCloseTo(2.5, 1);
    expect(paid?.deprecated).toBe(true);
  });

  test("openai filters non-chat models", () => {
    const json = JSON.parse(readFileSync(join(FIXTURES, "openai-sample.json"), "utf8"));
    const models = openaiParser.parseListResponse(json, "openai");
    expect(models.map((m) => m.id)).toEqual(["gpt-4o-mini"]);
  });

  test("opencode-zen enriches free vs paid from models.dev metadata", () => {
    const listJson = JSON.parse(readFileSync(join(FIXTURES, "opencode-zen-list.json"), "utf8"));
    const meta = JSON.parse(readFileSync(join(FIXTURES, "opencode-zen-metadata.json"), "utf8"));
    const models = enrichOpenCodeZenFromCatalog(parseOpenCodeZenList(listJson), meta);

    expect(models.find((m) => m.id === "deepseek-v4-flash-free")?.isFree).toBe(true);
    expect(models.find((m) => m.id === "big-pickle")?.isFree).toBe(true);
    expect(models.find((m) => m.id === "claude-opus-4-6")?.isFree).toBe(false);
    expect(models.find((m) => m.id === "claude-fable-5")?.isFree).toBe(false);
    expect(models.find((m) => m.id === "claude-opus-4-6")?.pricing?.promptPer1M).toBe(5);
    expect(models.find((m) => m.id === "claude-opus-4-6")?.pricing?.completionPer1M).toBe(25);
    expect(models.find((m) => m.id === "gemini-3-flash")?.capabilities).toContain("vision");
    expect(models.find((m) => m.id === "gemini-3-flash")?.contextLength).toBe(1048576);
  });

  test("ollama tags parser", () => {
    const json = JSON.parse(readFileSync(join(FIXTURES, "ollama-tags.json"), "utf8"));
    const models = ollamaParser.parseListResponse(json, "ollama");
    expect(models.length).toBe(2);
    expect(models[0].isFree).toBe(true);
    expect(models[0].parameterSize).toBe("3B");
    expect(models[1].capabilities).toContain("embedding");
  });
});

describe("shared model helpers", () => {
  test("sortModels free-first", () => {
    const json = JSON.parse(readFileSync(join(FIXTURES, "openrouter-sample.json"), "utf8"));
    const models = parseOpenRouterList(json, "openrouter");
    const sorted = sortModels(models, "free-first");
    expect(sorted[0].isFree).toBe(true);
  });

  test("filterModels vision", () => {
    const json = JSON.parse(readFileSync(join(FIXTURES, "openrouter-sample.json"), "utf8"));
    const models = parseOpenRouterList(json, "openrouter");
    const vision = filterModels(models, { vision: true });
    expect(vision.every((m) => m.capabilities.includes("vision"))).toBe(true);
  });
});
