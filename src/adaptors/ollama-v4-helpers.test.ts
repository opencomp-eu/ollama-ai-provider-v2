import { SharedV4Warning } from "@ai-sdk/provider";
import { resolveOllamaThink } from "./ollama-v4-helpers";

describe("resolveOllamaThink", () => {
  it("should prefer explicit provider think settings", () => {
    const warnings: SharedV4Warning[] = [];

    expect(
      resolveOllamaThink({
        reasoning: "high",
        ollamaThink: "low",
        warnings,
      }),
    ).toBe("low");
    expect(warnings).toEqual([]);
  });

  it("should map reasoning none to false", () => {
    const warnings: SharedV4Warning[] = [];

    expect(
      resolveOllamaThink({
        reasoning: "none",
        warnings,
      }),
    ).toBe(false);
    expect(warnings).toEqual([]);
  });

  it("should map reasoning levels to Ollama think levels", () => {
    const warnings: SharedV4Warning[] = [];

    expect(
      resolveOllamaThink({
        reasoning: "medium",
        warnings,
      }),
    ).toBe("medium");
    expect(warnings).toEqual([]);
  });

  it("should default to false when reasoning is not set", () => {
    const warnings: SharedV4Warning[] = [];

    expect(
      resolveOllamaThink({
        warnings,
      }),
    ).toBe(false);
    expect(warnings).toEqual([]);
  });
});
