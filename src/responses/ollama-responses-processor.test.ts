import {
  OllamaResponseProcessor,
  extractOllamaResponseObjectsFromChunk,
} from "./ollama-responses-processor";

const config = {
  provider: "ollama.responses",
  url: ({ path }: { path: string }) => `http://127.0.0.1:11434/api${path}`,
  headers: () => ({}),
  generateId: () => "mock-id-1",
};

describe("OllamaResponseProcessor", () => {
  const processor = new OllamaResponseProcessor(config);

  it("should process text response", () => {
    const result = processor.processGenerateResponse({
      model: "llama2",
      created_at: "2024-01-01T00:00:00.000Z",
      done: true,
      done_reason: "stop",
      message: {
        role: "assistant",
        content: "Hello!",
      },
      prompt_eval_count: 10,
      eval_count: 5,
    });

    expect(result.content).toEqual([{ type: "text", text: "Hello!" }]);
    expect(result.finishReason).toEqual({ raw: "stop", unified: "stop" });
    expect(result.usage).toEqual({
      inputTokens: {
        total: 10,
        noCache: undefined,
        cacheRead: undefined,
        cacheWrite: undefined,
      },
      outputTokens: {
        total: 5,
        text: undefined,
        reasoning: undefined,
      },
    });
  });

  it("should process thinking and tool calls", () => {
    const result = processor.processGenerateResponse({
      model: "llama2",
      created_at: "2024-01-01T00:00:00.000Z",
      done: true,
      done_reason: "stop",
      message: {
        role: "assistant",
        content: "Checking weather.",
        thinking: "Let me think.",
        tool_calls: [
          {
            id: "call_1",
            function: {
              name: "weather",
              arguments: { location: "SF" },
            },
          },
        ],
      },
      prompt_eval_count: 12,
      eval_count: 8,
    });

    expect(result.content).toEqual([
      { type: "text", text: "Checking weather." },
      { type: "reasoning", text: "Let me think." },
      {
        type: "tool-call",
        toolCallId: "call_1",
        toolName: "weather",
        input: '{"location":"SF"}',
      },
    ]);
    expect(result.finishReason).toEqual({
      raw: "tool_calls",
      unified: "tool-calls",
    });
  });
});

describe("extractOllamaResponseObjectsFromChunk", () => {
  it("should return value from successful chunk", () => {
    const chunk = {
      success: true,
      value: {
        model: "llama2",
        created_at: "2024-01-01T00:00:00.000Z",
        done: true,
        message: { role: "assistant", content: "Hi" },
      },
    };

    expect(extractOllamaResponseObjectsFromChunk(chunk)).toEqual([chunk.value]);
  });

  it("should recover valid objects from multi-line error chunks", () => {
    const chunk = {
      success: false,
      error: {
        text: [
          '{"model":"llama2","created_at":"2024-01-01T00:00:00.000Z","done":false,"message":{"role":"assistant","content":"Hello"}}',
          '{"model":"llama2","created_at":"2024-01-01T00:00:00.000Z","done":true,"message":{"role":"assistant","content":" world"}}',
        ].join("\n"),
      },
    };

    const results = extractOllamaResponseObjectsFromChunk(chunk);

    expect(results).toHaveLength(2);
    expect(results[0].message.content).toBe("Hello");
    expect(results[1].message.content).toBe(" world");
  });

  it("should return empty array for invalid error chunks", () => {
    expect(
      extractOllamaResponseObjectsFromChunk({
        success: false,
        error: { text: "not json" },
      }),
    ).toEqual([]);
  });
});
