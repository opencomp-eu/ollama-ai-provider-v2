import {
  LanguageModelV4Prompt,
  SharedV4Warning,
  UnsupportedFunctionalityError,
} from "@ai-sdk/provider";
import {
  extractOllamaFileData,
  fileDataToDataUri,
  formatOllamaToolResultOutput,
} from "../adaptors/ollama-v4-helpers";
import { OllamaResponsesPrompt } from "./ollama-responses-api-types";

export function convertToOllamaResponsesMessages({
  prompt,
  systemMessageMode,
}: {
  prompt: LanguageModelV4Prompt;
  systemMessageMode: "system" | "developer" | "remove";
}): {
  messages: OllamaResponsesPrompt;
  warnings: Array<SharedV4Warning>;
} {
  const messages: OllamaResponsesPrompt = [];
  const warnings: Array<SharedV4Warning> = [];

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
            warnings.push({
              type: "other",
              message: "system messages are removed for this model",
            });
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
        messages.push({
          role: "user",
          content: content.map((part, index) => {
            switch (part.type) {
              case "text": {
                return { type: "input_text", text: part.text };
              }
              case "file": {
                const fileData = extractOllamaFileData(part.data);

                if (part.mediaType.startsWith("image/")) {
                  const mediaType =
                    part.mediaType === "image/*"
                      ? "image/jpeg"
                      : part.mediaType;

                  return {
                    type: "input_image",
                    image_url: fileDataToDataUri(fileData, mediaType),

                    // Ollama specific extension: image detail
                    detail: part.providerOptions?.ollama?.imageDetail,
                  };
                } else if (part.mediaType === "application/pdf") {
                  if (fileData instanceof URL) {
                    throw new UnsupportedFunctionalityError({
                      functionality: "PDF file parts with URLs",
                    });
                  }

                  return {
                    type: "input_file",
                    filename: part.filename ?? `part-${index}.pdf`,
                    file_data: fileDataToDataUri(fileData, "application/pdf"),
                  };
                } else {
                  throw new UnsupportedFunctionalityError({
                    functionality: `file part media type ${part.mediaType}`,
                  });
                }
              }
              default: {
                const _exhaustiveCheck: never = part;
                throw new Error(`Unsupported user part: ${_exhaustiveCheck}`);
              }
            }
          }),
        });

        break;
      }

      case "assistant": {
        for (const part of content) {
          switch (part.type) {
            case "text": {
              messages.push({
                role: "assistant",
                content: [{ type: "output_text", text: part.text }],
              });
              break;
            }
            case "tool-call": {
              if (part.providerExecuted) {
                break;
              }

              messages.push({
                type: "function_call",
                call_id: part.toolCallId,
                name: part.toolName,
                arguments: JSON.stringify(part.input),
              });
              break;
            }
            case "reasoning": {
              warnings.push({
                type: "other",
                message:
                  "reasoning parts in assistant messages are not supported for Ollama responses",
              });
              break;
            }
            case "file":
            case "reasoning-file":
            case "custom":
            case "tool-result": {
              warnings.push({
                type: "other",
                message: `Unsupported assistant part type "${part.type}" for Ollama responses`,
              });
              break;
            }
            default: {
              const _exhaustiveCheck: never = part;
              throw new Error(`Unsupported assistant part: ${_exhaustiveCheck}`);
            }
          }
        }

        break;
      }

      case "tool": {
        for (const part of content) {
          switch (part.type) {
            case "tool-result": {
              messages.push({
                type: "function_call_output",
                call_id: part.toolCallId,
                output: formatOllamaToolResultOutput(part.output),
              });
              break;
            }
            case "tool-approval-response": {
              warnings.push({
                type: "other",
                message:
                  "tool approval response parts are not supported for Ollama responses",
              });
              break;
            }
            default: {
              const _exhaustiveCheck: never = part;
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

  return { messages, warnings };
}
