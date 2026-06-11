import { UnsupportedFunctionalityError } from "@ai-sdk/provider";
import { convertToOllamaResponsesMessages } from "./convert-to-ollama-responses-messages";

describe("convertToOllamaResponsesMessages", () => {
  it("should convert system message", () => {
    const result = convertToOllamaResponsesMessages({
      prompt: [{ role: "system", content: "You are helpful." }],
      systemMessageMode: "system",
    });

    expect(result).toEqual({
      messages: [{ role: "system", content: "You are helpful." }],
      warnings: [],
    });
  });

  it("should warn when system messages are removed", () => {
    const result = convertToOllamaResponsesMessages({
      prompt: [{ role: "system", content: "You are helpful." }],
      systemMessageMode: "remove",
    });

    expect(result.messages).toEqual([]);
    expect(result.warnings).toEqual([
      {
        type: "other",
        message: "system messages are removed for this model",
      },
    ]);
  });

  it("should convert user text and image parts", () => {
    const result = convertToOllamaResponsesMessages({
      prompt: [
        {
          role: "user",
          content: [
            { type: "text", text: "What is this?" },
            {
              type: "file",
              mediaType: "image/png",
              data: "base64data",
            },
          ],
        },
      ],
      systemMessageMode: "system",
    });

    expect(result.messages).toEqual([
      {
        role: "user",
        content: [
          { type: "input_text", text: "What is this?" },
          {
            type: "input_image",
            image_url: "data:image/png;base64,base64data",
            detail: undefined,
          },
        ],
      },
    ]);
  });

  it("should convert assistant text and tool calls", () => {
    const result = convertToOllamaResponsesMessages({
      prompt: [
        {
          role: "assistant",
          content: [
            { type: "text", text: "Checking weather." },
            {
              type: "tool-call",
              toolCallId: "call_1",
              toolName: "weather",
              input: { location: "SF" },
            },
          ],
        },
      ],
      systemMessageMode: "system",
    });

    expect(result.messages).toEqual([
      {
        role: "assistant",
        content: [{ type: "output_text", text: "Checking weather." }],
      },
      {
        type: "function_call",
        call_id: "call_1",
        name: "weather",
        arguments: '{"location":"SF"}',
      },
    ]);
  });

  it("should convert tool results", () => {
    const result = convertToOllamaResponsesMessages({
      prompt: [
        {
          role: "tool",
          content: [
            {
              type: "tool-result",
              toolCallId: "call_1",
              toolName: "weather",
              output: { type: "text", value: "sunny" },
            },
          ],
        },
      ],
      systemMessageMode: "system",
    });

    expect(result.messages).toEqual([
      {
        type: "function_call_output",
        call_id: "call_1",
        output: "sunny",
      },
    ]);
  });

  it("should throw for unsupported file media types", () => {
    expect(() =>
      convertToOllamaResponsesMessages({
        prompt: [
          {
            role: "user",
            content: [
              {
                type: "file",
                mediaType: "audio/mp3",
                data: "data",
              },
            ],
          },
        ],
        systemMessageMode: "system",
      }),
    ).toThrow(UnsupportedFunctionalityError);
  });
});
