import { describe, expect, test } from "bun:test";
import { decodePiProjectSlug, getAgentConfig, isAgentKind } from "./paths.ts";
import { realTotalFromUsage } from "./usage.ts";

describe("agent registry", () => {
  test("recognizes supported agents and defaults unknown values out", () => {
    expect(isAgentKind("claude")).toBe(true);
    expect(isAgentKind("pi")).toBe(true);
    expect(isAgentKind("opencode")).toBe(true);
    expect(isAgentKind("other")).toBe(false);
  });

  test("uses the discovered Pi sessions directory", () => {
    expect(getAgentConfig("pi").sessionsDir).toContain(".pi");
    expect(getAgentConfig("pi").sessionsDir).toContain("agent");
    expect(getAgentConfig("pi").sessionsDir).toContain("sessions");
  });

  test("decodes Pi project slugs to readable Windows paths", () => {
    expect(decodePiProjectSlug("--D--dev-ERP-SAP--")).toBe("D:\\dev\\ERP-SAP");
    expect(decodePiProjectSlug("--C--Users-Eng.Zoheer--")).toBe("C:\\Users\\Eng.Zoheer");
  });
});

describe("usage totals", () => {
  test("computes Claude input-context totals", () => {
    expect(
      realTotalFromUsage({
        input_tokens: 10,
        cache_creation_input_tokens: 20,
        cache_read_input_tokens: 30,
        output_tokens: 999,
      }),
    ).toBe(60);
  });

  test("computes Pi input-context totals", () => {
    expect(
      realTotalFromUsage({
        input: 10,
        cacheWrite: 20,
        cacheRead: 30,
        output: 999,
      }),
    ).toBe(60);
  });
});
