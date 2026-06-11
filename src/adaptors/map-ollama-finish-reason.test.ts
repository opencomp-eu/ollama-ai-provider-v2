import { mapOllamaFinishReason } from "./map-ollama-finish-reason";

describe("mapOllamaFinishReason", () => {
  it.each([
    ["stop", { raw: "stop", unified: "stop" }],
    ["length", { raw: "length", unified: "length" }],
    ["content_filter", { raw: "content_filter", unified: "content-filter" }],
    ["function_call", { raw: "function_call", unified: "tool-calls" }],
    ["tool_calls", { raw: "tool_calls", unified: "tool-calls" }],
    ["unknown", { raw: "unknown", unified: "other" }],
    [undefined, { raw: undefined, unified: "other" }],
  ] as const)("maps %s correctly", (input, expected) => {
    expect(mapOllamaFinishReason(input)).toEqual(expected);
  });
});
