import {
  InvalidPromptError,
  UnsupportedFunctionalityError,
} from "@ai-sdk/provider";
import { convertToOllamaCompletionPrompt } from "./convert-to-ollama-completion-prompt";

describe("convertToOllamaCompletionPrompt", () => {
  it("should prefix system message and format user/assistant turns", () => {
    const result = convertToOllamaCompletionPrompt({
      prompt: [
        { role: "system", content: "You are helpful." },
        {
          role: "user",
          content: [{ type: "text", text: "Hello" }],
        },
        {
          role: "assistant",
          content: [{ type: "text", text: "Hi there!" }],
        },
        {
          role: "user",
          content: [{ type: "text", text: "How are you?" }],
        },
      ],
    });

    expect(result).toEqual({
      prompt:
        "You are helpful.\n\nuser:\nHello\n\nassistant:\nHi there!\n\nuser:\nHow are you?\n\nassistant:\n",
      stopSequences: ["\nuser:"],
    });
  });

  it("should support custom role labels", () => {
    const result = convertToOllamaCompletionPrompt({
      prompt: [
        {
          role: "user",
          content: [{ type: "text", text: "Hello" }],
        },
      ],
      user: "Human",
      assistant: "Bot",
    });

    expect(result.prompt).toBe("Human:\nHello\n\nBot:\n");
    expect(result.stopSequences).toEqual(["\nHuman:"]);
  });

  it("should throw for system message after the first message", () => {
    expect(() =>
      convertToOllamaCompletionPrompt({
        prompt: [
          {
            role: "user",
            content: [{ type: "text", text: "Hello" }],
          },
          { role: "system", content: "Late system message" },
        ],
      }),
    ).toThrow(InvalidPromptError);
  });

  it("should throw for tool messages", () => {
    expect(() =>
      convertToOllamaCompletionPrompt({
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
      }),
    ).toThrow(UnsupportedFunctionalityError);
  });

  it("should throw for assistant tool-call messages", () => {
    expect(() =>
      convertToOllamaCompletionPrompt({
        prompt: [
          {
            role: "assistant",
            content: [
              {
                type: "tool-call",
                toolCallId: "call_1",
                toolName: "weather",
                input: { location: "SF" },
              },
            ],
          },
        ],
      }),
    ).toThrow(UnsupportedFunctionalityError);
  });
});
