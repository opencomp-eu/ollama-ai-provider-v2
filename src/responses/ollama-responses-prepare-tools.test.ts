import { LanguageModelV4FunctionTool } from "@ai-sdk/provider";
import { prepareResponsesTools } from "./ollama-responses-prepare-tools";

const functionTool: LanguageModelV4FunctionTool = {
  type: "function",
  name: "weather",
  description: "Get weather",
  inputSchema: {
    type: "object",
    properties: { location: { type: "string" } },
    required: ["location"],
    additionalProperties: false,
  },
};

describe("prepareResponsesTools", () => {
  it("should return undefined tools for empty array", () => {
    const result = prepareResponsesTools({ tools: [] });

    expect(result).toEqual({
      tools: undefined,
      toolChoice: undefined,
      toolWarnings: [],
    });
  });

  it("should map function tools", () => {
    const result = prepareResponsesTools({
      tools: [functionTool],
    });

    expect(result.tools).toEqual([
      {
        type: "function",
        function: {
          name: "weather",
          description: "Get weather",
          parameters: functionTool.inputSchema,
        },
      },
    ]);
    expect(result.toolWarnings).toEqual([]);
  });

  it("should warn for unsupported tool types", () => {
    const result = prepareResponsesTools({
      tools: [
        {
          type: "provider",
          id: "provider.web_search",
          name: "web_search",
          args: {},
        },
      ],
    });

    expect(result.toolWarnings).toEqual([
      {
        type: "unsupported",
        feature: "tool",
        details: "web_search",
      },
    ]);
  });

  it.each([
    ["auto", "auto"],
    ["none", "none"],
    ["required", "required"],
  ] as const)("should pass through %s tool choice", (choice, expected) => {
    const result = prepareResponsesTools({
      tools: [functionTool],
      toolChoice: { type: choice },
    });

    expect(result.toolChoice).toBe(expected);
  });

  it("should map specific function tool choice", () => {
    const result = prepareResponsesTools({
      tools: [functionTool],
      toolChoice: { type: "tool", toolName: "weather" },
    });

    expect(result.toolChoice).toEqual({
      type: "function",
      name: "weather",
    });
  });

  it("should map web_search_preview tool choice", () => {
    const result = prepareResponsesTools({
      tools: [functionTool],
      toolChoice: { type: "tool", toolName: "web_search_preview" },
    });

    expect(result.toolChoice).toEqual({ type: "web_search_preview" });
  });
});
