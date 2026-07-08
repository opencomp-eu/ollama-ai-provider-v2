import {
  LanguageModelV4Prompt,
  SharedV4Warning,
} from "@ai-sdk/provider";
import { OllamaChatPrompt } from "./ollama-chat-prompt";
import {
  extractOllamaFileData,
  formatOllamaToolResultOutput,
} from "./ollama-v4-helpers";

export function convertToOllamaChatMessages({
  prompt,
  systemMessageMode = "system",
  warnings = [],
}: {
  prompt: LanguageModelV4Prompt;
  systemMessageMode?: "system" | "developer" | "remove";
  warnings?: Array<SharedV4Warning>;
}): OllamaChatPrompt {
  const messages: OllamaChatPrompt = [];

  for (const { role, content } of prompt) {
    switch (role) {
      case "system": {
        switch (systemMessageMode) {
          case "system": {
            messages.push({ role: "system", content });
            break;
          }
          case "developer": {
            messages.push({ role: "developer", content });
            break;
          }
          case "remove": {
            break;
          }
          default: {
            const _exhaustiveCheck: never = systemMessageMode;
            throw new Error(
              `Unsupported system message mode: ${_exhaustiveCheck}`,
            );
          }
        }
        break;
      }

      case "user": {
        if (content.length === 1 && content[0].type === "text") {
          messages.push({ role: "user", content: content[0].text });
          break;
        }

        const userText = content
          .filter((part) => part.type === "text")
          .map((part) => part.text)
          .join("");
        const images = content
          .filter((part): part is Extract<typeof part, { type: "file" }> => {
            return part.type === "file" && part.mediaType.startsWith("image/");
          })
          .map((part) => extractOllamaFileData(part.data));

        messages.push({
          role: "user",
          content: userText.length > 0 ? userText : [],
          images: images.length > 0 ? images : undefined,
        });

        break;
      }

      case "assistant": {
        let text = "";
        let thinking = "";
        const toolCalls: Array<{
          id: string;
          type: "function";
          function: { name: string; arguments: object };
        }> = [];

        for (const part of content) {
          switch (part.type) {
            case "text": {
              text += part.text;
              break;
            }
            case "tool-call": {
              toolCalls.push({
                id: part.toolCallId,
                type: "function",
                function: {
                  name: part.toolName,
                  arguments: part.input as object,
                },
              });
              break;
            }
            case "reasoning": {
              thinking += part.text;
              break;
            }
            case "file":
            case "reasoning-file":
            case "custom":
            case "tool-result": {
              warnings.push({
                type: "other",
                message: `Unsupported assistant part type "${part.type}" for Ollama chat messages`,
              });
              break;
            }
            default: {
              const _exhaustiveCheck: never = part;
              throw new Error(`Unsupported part: ${_exhaustiveCheck}`);
            }
          }
        }

        messages.push({
          role: "assistant",
          content: text,
          ...(thinking && { thinking }),
          tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
        });

        break;
      }

      case "tool": {
        for (const toolResponse of content) {
          switch (toolResponse.type) {
            case "tool-result": {
              messages.push({
                role: "tool",
                tool_call_id: toolResponse.toolCallId,
                content: formatOllamaToolResultOutput(toolResponse.output),
              });
              break;
            }
            case "tool-approval-response": {
              warnings.push({
                type: "other",
                message:
                  "tool approval response parts are not supported for Ollama chat messages",
              });
              break;
            }
            default: {
              const _exhaustiveCheck: never = toolResponse;
              throw new Error(`Unsupported tool part: ${_exhaustiveCheck}`);
            }
          }
        }
        break;
      }

      default: {
        const _exhaustiveCheck: never = role;
        throw new Error(`Unsupported role: ${_exhaustiveCheck}`);
      }
    }
  }

  return messages;
}
