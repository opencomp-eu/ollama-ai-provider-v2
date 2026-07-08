import { convertToOllamaChatMessages } from "./convert-to-ollama-chat-messages";

describe("convertToOllamaChatMessages", () => {
  it("should convert system message with default mode", () => {
    const result = convertToOllamaChatMessages({
      prompt: [{ role: "system", content: "You are helpful." }],
    });

    expect(result).toEqual([{ role: "system", content: "You are helpful." }]);
  });

  it("should convert system message to developer role", () => {
    const result = convertToOllamaChatMessages({
      prompt: [{ role: "system", content: "You are helpful." }],
      systemMessageMode: "developer",
    });

    expect(result).toEqual([
      { role: "developer", content: "You are helpful." },
    ]);
  });

  it("should remove system message when mode is remove", () => {
    const result = convertToOllamaChatMessages({
      prompt: [
        { role: "system", content: "You are helpful." },
        {
          role: "user",
          content: [{ type: "text", text: "Hello" }],
        },
      ],
      systemMessageMode: "remove",
    });

    expect(result).toEqual([{ role: "user", content: "Hello" }]);
  });

  it("should convert plain text user message", () => {
    const result = convertToOllamaChatMessages({
      prompt: [
        {
          role: "user",
          content: [{ type: "text", text: "Hello" }],
        },
      ],
    });

    expect(result).toEqual([{ role: "user", content: "Hello" }]);
  });

  it("should convert multi-part user message with images", () => {
    const result = convertToOllamaChatMessages({
      prompt: [
        {
          role: "user",
          content: [
            { type: "text", text: "What is this?" },
            {
              type: "file",
              mediaType: "image/png",
              data: { type: "data", data: "base64data" },
            },
          ],
        },
      ],
    });

    expect(result).toEqual([
      {
        role: "user",
        content: "What is this?",
        images: ["base64data"],
      },
    ]);
  });

  it("should convert assistant message with text, reasoning, and tool calls", () => {
    const result = convertToOllamaChatMessages({
      prompt: [
        {
          role: "assistant",
          content: [
            { type: "reasoning", text: "thinking..." },
            { type: "text", text: "The weather is sunny." },
            {
              type: "tool-call",
              toolCallId: "call_1",
              toolName: "weather",
              input: { location: "SF" },
            },
          ],
        },
      ],
    });

    expect(result).toEqual([
      {
        role: "assistant",
        content: "The weather is sunny.",
        thinking: "thinking...",
        tool_calls: [
          {
            id: "call_1",
            type: "function",
            function: {
              name: "weather",
              arguments: { location: "SF" },
            },
          },
        ],
      },
    ]);
  });

  it("should convert tool result messages", () => {
    const result = convertToOllamaChatMessages({
      prompt: [
        {
          role: "tool",
          content: [
            {
              type: "tool-result",
              toolCallId: "call_1",
              toolName: "weather",
              output: { type: "json", value: { temp: 72 } },
            },
          ],
        },
      ],
    });

    expect(result).toEqual([
      {
        role: "tool",
        tool_call_id: "call_1",
        content: '{"temp":72}',
      },
    ]);
  });
});
