import {
  LanguageModelV4CallOptions,
  LanguageModelV4ToolResultOutput,
  SharedV4FileData,
  SharedV4Warning,
  UnsupportedFunctionalityError,
} from "@ai-sdk/provider";
import {
  convertInlineFileDataToUint8Array,
  convertUint8ArrayToBase64,
  isCustomReasoning,
  mapReasoningToProviderEffort,
} from "@ai-sdk/provider-utils";
import { OllamaThink, OllamaThinkLevel } from "../common/ollama-think";

export function resolveOllamaThink({
  reasoning,
  ollamaThink,
  warnings,
}: {
  reasoning?: LanguageModelV4CallOptions["reasoning"];
  ollamaThink?: OllamaThink;
  warnings: SharedV4Warning[];
}): OllamaThink {
  if (ollamaThink !== undefined) {
    return ollamaThink;
  }

  if (isCustomReasoning(reasoning)) {
    if (reasoning === "none") {
      return false;
    }

    return (
      mapReasoningToProviderEffort<OllamaThinkLevel>({
        reasoning,
        effortMap: {
          minimal: "low",
          low: "low",
          medium: "medium",
          high: "high",
          xhigh: "max",
        },
        warnings,
      }) ?? false
    );
  }

  return false;
}

export function fileDataToBase64String(
  data: URL | Uint8Array | string,
): string {
  if (data instanceof URL) {
    throw new UnsupportedFunctionalityError({
      functionality: "file parts with URLs for base64 conversion",
    });
  }

  if (typeof data === "string") {
    if (data.startsWith("data:")) {
      return data.split(",")[1] ?? data;
    }
    return data;
  }

  return convertUint8ArrayToBase64(convertInlineFileDataToUint8Array(data));
}

export function fileDataToDataUri(
  data: URL | Uint8Array | string,
  mediaType: string,
): string {
  if (data instanceof URL) {
    return data.toString();
  }

  if (typeof data === "string") {
    return data.startsWith("data:") ? data : `data:${mediaType};base64,${data}`;
  }

  return `data:${mediaType};base64,${fileDataToBase64String(data)}`;
}

export function extractOllamaFileData(
  data: SharedV4FileData,
): URL | Uint8Array | string {
  switch (data.type) {
    case "data":
      return data.data;
    case "url":
      return data.url instanceof URL ? data.url : new URL(data.url);
    case "text":
      return data.text;
    case "reference":
      throw new UnsupportedFunctionalityError({
        functionality: "file parts with provider references",
      });
    default: {
      const _exhaustiveCheck: never = data;
      throw new Error(`Unsupported file data type: ${_exhaustiveCheck}`);
    }
  }
}

export function formatOllamaToolResultOutput(
  output: LanguageModelV4ToolResultOutput,
): string {
  switch (output.type) {
    case "text":
    case "error-text":
      return output.value;
    case "content":
    case "json":
    case "error-json":
      return JSON.stringify(output.value);
    case "execution-denied":
      return output.reason ?? "Tool execution was denied";
    default: {
      const _exhaustiveCheck: never = output;
      throw new Error(`Unsupported tool result output type: ${_exhaustiveCheck}`);
    }
  }
}
