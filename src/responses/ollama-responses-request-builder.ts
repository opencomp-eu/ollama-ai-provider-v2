import { LanguageModelV4CallOptions, SharedV4Warning } from "@ai-sdk/provider";
import { parseProviderOptions } from "@ai-sdk/provider-utils";
import { z } from "zod/v4";
import { resolveOllamaThink } from "../adaptors/ollama-v4-helpers";
import { OllamaThink } from "../common/ollama-think";
import { convertToOllamaChatMessages } from "../adaptors/convert-to-ollama-chat-messages";
import {
  OllamaChatModelId,
  ollamaProviderOptions,
} from "../ollama-chat-settings";
import { convertToOllamaResponsesMessages } from "./convert-to-ollama-responses-messages";
import { prepareResponsesTools } from "./ollama-responses-prepare-tools";
import { OllamaChatPrompt } from "../adaptors/ollama-chat-prompt";

export type OllamaResponsesProviderOptions = z.infer<
  typeof ollamaProviderOptions
>;

interface RequestBuilderOptions {
  modelId: OllamaChatModelId;
  maxOutputTokens?: number;
  temperature?: number;
  stopSequences?: string[];
  topP?: number;
  topK?: number;
  presencePenalty?: number;
  frequencyPenalty?: number;
  seed?: number;
  reasoning?: LanguageModelV4CallOptions["reasoning"];
  prompt: LanguageModelV4CallOptions["prompt"];
  providerOptions?: LanguageModelV4CallOptions["providerOptions"];
  tools?: LanguageModelV4CallOptions["tools"];
  toolChoice?: LanguageModelV4CallOptions["toolChoice"];
  responseFormat?: LanguageModelV4CallOptions["responseFormat"];
}

interface RequestBuilderResult {
  args: {
    model: OllamaChatModelId;
    messages: OllamaChatPrompt;
    temperature?: number;
    top_p?: number;
    max_output_tokens?: number;
    format?: unknown;
    user?: string;
    think?: OllamaThink;
    tools?: unknown;
    tool_choice?: unknown;
  };
  warnings: SharedV4Warning[];
}

export class OllamaRequestBuilder {
  async buildRequest({
    modelId,
    maxOutputTokens,
    temperature,
    stopSequences,
    topP,
    topK,
    presencePenalty,
    frequencyPenalty,
    seed,
    reasoning,
    prompt,
    providerOptions,
    tools,
    toolChoice,
    responseFormat,
  }: RequestBuilderOptions): Promise<RequestBuilderResult> {
    const warnings = this.collectUnsupportedSettingsWarnings({
      topK,
      seed,
      presencePenalty,
      frequencyPenalty,
      stopSequences,
    });

    const { warnings: messageWarnings } = convertToOllamaResponsesMessages({
      prompt,
      systemMessageMode: "system",
    });

    warnings.push(...messageWarnings);

    const ollamaOptions = await this.parseProviderOptions(providerOptions);

    const baseArgs = this.buildBaseArgs({
      modelId,
      prompt,
      temperature,
      topP,
      maxOutputTokens,
      responseFormat,
      reasoning,
      ollamaOptions,
      warnings,
    });

    const {
      tools: ollamaTools,
      toolChoice: ollamaToolChoice,
      toolWarnings,
    } = prepareResponsesTools({
      tools,
      toolChoice,
    });

    return {
      args: {
        ...baseArgs,
        tools: ollamaTools,
        tool_choice: ollamaToolChoice,
      },
      warnings: [...warnings, ...toolWarnings],
    };
  }

  private collectUnsupportedSettingsWarnings({
    topK,
    seed,
    presencePenalty,
    frequencyPenalty,
    stopSequences,
  }: {
    topK?: number;
    seed?: number;
    presencePenalty?: number;
    frequencyPenalty?: number;
    stopSequences?: string[];
  }): SharedV4Warning[] {
    const warnings: SharedV4Warning[] = [];

    const unsupportedSettings = [
      { value: topK, name: "topK" },
      { value: seed, name: "seed" },
      { value: presencePenalty, name: "presencePenalty" },
      { value: frequencyPenalty, name: "frequencyPenalty" },
      { value: stopSequences, name: "stopSequences" },
    ] as const;

    for (const { value, name } of unsupportedSettings) {
      if (value != null) {
        warnings.push({
          type: "unsupported",
          feature: "setting",
          details: name,
        });
      }
    }

    return warnings;
  }

  private async parseProviderOptions(
    providerOptions: LanguageModelV4CallOptions["providerOptions"],
  ): Promise<OllamaResponsesProviderOptions | null> {
    const result = await parseProviderOptions({
      provider: "ollama",
      providerOptions,
      schema: ollamaProviderOptions,
    });
    return result ?? null;
  }

  private buildBaseArgs({
    modelId,
    prompt,
    temperature,
    topP,
    maxOutputTokens,
    responseFormat,
    reasoning,
    ollamaOptions,
    warnings,
  }: {
    modelId: OllamaChatModelId;
    prompt: LanguageModelV4CallOptions["prompt"];
    temperature?: number;
    topP?: number;
    maxOutputTokens?: number;
    responseFormat?: LanguageModelV4CallOptions["responseFormat"];
    reasoning?: LanguageModelV4CallOptions["reasoning"];
    ollamaOptions: OllamaResponsesProviderOptions | null;
    warnings: SharedV4Warning[];
  }) {
    return {
      model: modelId,
      messages: convertToOllamaChatMessages({
        prompt,
        systemMessageMode: "system",
        warnings,
      }),
      temperature,
      top_p: topP,
      max_output_tokens: maxOutputTokens,

      ...(responseFormat?.type === "json" && {
        format: responseFormat.schema != null ? responseFormat.schema : "json",
      }),

      think: resolveOllamaThink({
        reasoning,
        ollamaThink: ollamaOptions?.think,
        warnings,
      }),
      options: ollamaOptions?.options ?? undefined,
    };
  }
}
