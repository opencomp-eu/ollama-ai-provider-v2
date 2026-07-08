import {
  LanguageModelV4,
  LanguageModelV4CallOptions,
  LanguageModelV4Content,
  LanguageModelV4FinishReason,
  LanguageModelV4ResponseMetadata,
  LanguageModelV4StreamPart,
  LanguageModelV4StreamResult,
  LanguageModelV4Usage,
  SharedV4Headers,
  SharedV4Warning,
} from "@ai-sdk/provider";
import {
  combineHeaders,
  createJsonResponseHandler,
  generateId,
  ParseResult,
  postJsonToApi,
} from "@ai-sdk/provider-utils";
import { z } from "zod/v4";
import { convertToOllamaCompletionPrompt } from "../adaptors/convert-to-ollama-completion-prompt";
import { resolveOllamaThink } from "../adaptors/ollama-v4-helpers";
import { ollamaThinkSchema } from "../common/ollama-think";
import { mapOllamaFinishReason } from "../adaptors/map-ollama-finish-reason";
import { getResponseMetadata } from "../common/get-response-metadata";
import { createNdjsonStreamResponseHandler } from "../common/ndjson-stream-handler";
import {
  OllamaCompletionModelId,
  OllamaCompletionSettings,
} from "./ollama-completion-settings";
import { ollamaFailedResponseHandler } from "./ollama-error";

// Completion-specific provider options schema
const ollamaCompletionProviderOptions = z.object({
  think: ollamaThinkSchema.optional(),
  user: z.string().optional(),
  suffix: z.string().optional(),
  echo: z.boolean().optional(),
});

type OllamaCompletionConfig = {
  provider: string;
  url: (options: { path: string; modelId: string }) => string;
  headers: () => Record<string, string | undefined>;
  fetch?: typeof fetch;
};

export type OllamaCompletionProviderOptions = z.infer<
  typeof ollamaCompletionProviderOptions
>;

export class OllamaCompletionLanguageModel implements LanguageModelV4 {
  readonly specificationVersion = "v4" as const;

  readonly modelId: OllamaCompletionModelId;
  readonly settings: OllamaCompletionSettings;
  readonly provider: string;

  private readonly config: OllamaCompletionConfig;

  constructor(
    modelId: OllamaCompletionModelId,
    settings: OllamaCompletionSettings,
    config: OllamaCompletionConfig,
  ) {
    this.modelId = modelId;
    this.settings = settings;
    this.config = config;
    this.provider = config.provider;
  }

  readonly supportedUrls: Record<string, RegExp[]> = {
    // No URLs are supported for completion models.
  };

  private getArgs({
    prompt,
    maxOutputTokens,
    temperature,
    topP,
    topK,
    frequencyPenalty,
    presencePenalty,
    stopSequences: userStopSequences,
    responseFormat,
    tools,
    toolChoice,
    seed,
    reasoning,
  }: LanguageModelV4CallOptions) {
    const warnings: SharedV4Warning[] = [];

    if (topK != null) {
      warnings.push({
        type: "unsupported",
        feature: "topK",
      });
    }

    if (tools?.length) {
      warnings.push({ type: "unsupported", feature: "tools" });
    }

    if (toolChoice != null) {
      warnings.push({ type: "unsupported", feature: "toolChoice" });
    }

    if (responseFormat != null && responseFormat.type !== "text") {
      warnings.push({
        type: "unsupported",
        feature: "responseFormat (JSON)",
      });
    }

    const { prompt: completionPrompt, stopSequences } =
      convertToOllamaCompletionPrompt({ prompt });

    const stop = [...(stopSequences ?? []), ...(userStopSequences ?? [])];

    return {
      args: {
        // model id:
        model: this.modelId,

        // Ollama-supported settings:
        user: this.settings.user,
        think: resolveOllamaThink({
          reasoning,
          ollamaThink: this.settings.think,
          warnings,
        }),

        // standardized settings:
        max_tokens: maxOutputTokens,
        temperature,
        top_p: topP,
        frequency_penalty: frequencyPenalty,
        presence_penalty: presencePenalty,
        stop,

        // prompt:
        prompt: completionPrompt,

        // other settings:
        suffix: this.settings.suffix,
        echo: this.settings.echo,
        stream: false, // always disabled for doGenerate
      },
      warnings,
    };
  }

  async doGenerate(options: LanguageModelV4CallOptions): Promise<{
    content: Array<LanguageModelV4Content>;
    finishReason: LanguageModelV4FinishReason;
    usage: LanguageModelV4Usage;
    warnings: Array<SharedV4Warning>;
    request?: { body?: unknown };
    response?: LanguageModelV4ResponseMetadata & {
      headers?: SharedV4Headers;
      body?: unknown;
    };
  }> {
    const { args: body, warnings } = this.getArgs(options);

    const {
      responseHeaders,
      value: response,
      rawValue: rawResponse,
    } = await postJsonToApi({
      url: this.config.url({
        path: "/generate",
        modelId: this.modelId,
      }),
      headers: combineHeaders(this.config.headers(), options.headers),
      body: { ...body, stream: false },
      failedResponseHandler: ollamaFailedResponseHandler as any,
      successfulResponseHandler: createJsonResponseHandler(
        baseOllamaResponseSchema,
      ),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });

    const { prompt: rawPrompt, ...rawSettings } = body;

    const typedResponse = response as z.infer<typeof baseOllamaResponseSchema>;

    return {
      content: [
        {
          type: "text",
          text: typedResponse.response,
        },
      ],
      usage: {
        inputTokens: {
          total: typedResponse.prompt_eval_count ?? 0,
          noCache: undefined,
          cacheRead: undefined,
          cacheWrite: undefined,
        },
        outputTokens: {
          total: typedResponse.eval_count ?? 0,
          text: undefined,
          reasoning: undefined,
        },
      },
      finishReason: mapOllamaFinishReason("stop"),
      request: { body: JSON.stringify(body) },
      response: {
        ...getResponseMetadata(typedResponse),
        headers: responseHeaders,
        body: rawResponse,
      },
      warnings,
    };
  }

  async doStream(
    options: LanguageModelV4CallOptions,
  ): Promise<
    LanguageModelV4StreamResult & { warnings: Array<SharedV4Warning> }
  > {
    const { args, warnings } = this.getArgs(options);

    const body = {
      ...args,
      stream: true,
    };

    const { responseHeaders, value: response } = await postJsonToApi({
      url: this.config.url({
        path: "/generate",
        modelId: this.modelId,
      }),
      headers: combineHeaders(this.config.headers(), options.headers),
      body,
      failedResponseHandler: ollamaFailedResponseHandler as any,
      successfulResponseHandler: createNdjsonStreamResponseHandler(
        baseOllamaResponseSchema,
      ),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });

    const { prompt: rawPrompt, ...rawSettings } = args;

    let finishReason = "other";
    const usage: LanguageModelV4Usage = {
      inputTokens: {
        total: undefined,
        noCache: undefined,
        cacheRead: undefined,
        cacheWrite: undefined,
      },
      outputTokens: {
        total: undefined,
        text: undefined,
        reasoning: undefined,
      },
    };
    let isFirstChunk = true;
    let hasStreamStarted = false;
    let textStarted = false;
    const textId = generateId();

    return {
      stream: response.pipeThrough(
        new TransformStream<
          ParseResult<z.infer<typeof baseOllamaResponseSchema>>,
          LanguageModelV4StreamPart
        >({
          transform(chunk, controller) {
            if (!chunk.success) {
              controller.enqueue({ type: "error", error: chunk.rawValue });
              return;
            }

            const value = chunk.value;

            // handle error chunks:
            if ("error" in value) {
              finishReason = "error";
              controller.enqueue({ type: "error", error: value.error });
              return;
            }

            if (isFirstChunk) {
              isFirstChunk = false;

              if (!hasStreamStarted) {
                hasStreamStarted = true;
                controller.enqueue({ type: "stream-start", warnings });
              }

              controller.enqueue({
                type: "response-metadata",
                ...getResponseMetadata(value),
              });
            }

            if (value.done) {
              finishReason = "stop";
            }

            if (value.response != null) {
              if (!textStarted) {
                controller.enqueue({
                  type: "text-start",
                  id: textId,
                });
                textStarted = true;
              }
              controller.enqueue({
                type: "text-delta",
                id: textId,
                delta: value.response,
              });
            }
          },

          flush(controller) {
            if (textStarted) {
              controller.enqueue({
                type: "text-end",
                id: textId,
              });
            }
            controller.enqueue({
              type: "finish",
              finishReason: mapOllamaFinishReason(finishReason),
              usage,
            });
          },
        }),
      ),
      request: { body: JSON.stringify(body) },
      response: { headers: responseHeaders },
      warnings: warnings,
    };
  }
}

const baseOllamaResponseSchema = z.object({
  model: z.string(),
  created_at: z.string(),
  response: z.string(),
  done: z.boolean(),
  context: z.array(z.number()),
  error: z.unknown().optional(),

  eval_count: z.number().optional(),
  eval_duration: z.number().optional(),

  load_duration: z.number().optional(),
  total_duration: z.number().optional(),

  prompt_eval_count: z.number().optional(),
  prompt_eval_duration: z.number().optional(),
});
