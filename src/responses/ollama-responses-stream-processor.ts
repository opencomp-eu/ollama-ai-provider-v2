import {
  InvalidResponseDataError,
  LanguageModelV4CallOptions,
  LanguageModelV4FinishReason,
  LanguageModelV4StreamPart,
  LanguageModelV4Usage,
  SharedV4Warning,
} from "@ai-sdk/provider";
import { generateId, ParseResult } from "@ai-sdk/provider-utils";
import { z } from "zod/v4";
import { mapOllamaFinishReason } from "../adaptors/map-ollama-finish-reason";
import { getResponseMetadata } from "../common/get-response-metadata";
import { OllamaConfig } from "../common/ollama-config";
import {
  baseOllamaResponseSchema,
  extractOllamaResponseObjectsFromChunk,
  OllamaResponse,
} from "./ollama-responses-processor";

interface StreamState {
  finishReason: LanguageModelV4FinishReason;
  usage: LanguageModelV4Usage;
  responseId: string | null;
  ongoingToolCalls: Record<
    number,
    { toolName: string; toolCallId: string } | undefined
  >;
  hasToolCalls: boolean;
  isFirstChunk: boolean;
  hasStreamStarted: boolean;
  hasTextStarted: boolean;
  hasReasoningStarted: boolean;
  textEnded: boolean;
  reasoningEnded: boolean;
  textId: string;
  reasoningId: string;
}

export class OllamaStreamProcessor {
  private state: StreamState;
  private warnings: SharedV4Warning[] = [];

  constructor(private config: OllamaConfig) {
    this.state = this.initializeState();
  }

  createTransformStream(
    warnings: SharedV4Warning[],
    options: LanguageModelV4CallOptions,
  ): TransformStream<
    ParseResult<z.infer<typeof baseOllamaResponseSchema>>,
    LanguageModelV4StreamPart
  > {
    this.warnings = warnings;

    return new TransformStream({
      transform: (chunk, controller) => {
        this.processChunk(chunk, controller, options);
      },

      flush: (controller) => {
        this.finalizeStream(controller);
      },
    });
  }

  private initializeState(): StreamState {
    return {
      finishReason: {
        unified: "other",
        raw: undefined,
      },
      usage: {
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
      },
      responseId: null,
      ongoingToolCalls: {},
      hasToolCalls: false,
      isFirstChunk: true,
      hasStreamStarted: false,
      hasTextStarted: false,
      hasReasoningStarted: false,
      textEnded: false,
      reasoningEnded: false,
      textId: generateId(),
      reasoningId: generateId(),
    };
  }

  private processChunk(
    chunk: ParseResult<z.infer<typeof baseOllamaResponseSchema>>,
    controller: TransformStreamDefaultController<LanguageModelV4StreamPart>,
    options: LanguageModelV4CallOptions,
  ) {
    if (options?.includeRawChunks) {
      controller.enqueue({ type: "raw", rawValue: chunk.rawValue });
    }

    const values = extractOllamaResponseObjectsFromChunk(chunk);

    if (values.length === 0) {
      if (!chunk.success) {
        this.state.finishReason = { unified: "error", raw: undefined };
        controller.enqueue({ type: "error", error: chunk.error });
      }
      return;
    }

    for (const value of values) {
      this.processResponseValue(value, controller);
    }
  }

  private processResponseValue(
    value: OllamaResponse,
    controller: TransformStreamDefaultController<LanguageModelV4StreamPart>,
  ) {
    // Handle error-like chunks
    if (
      value &&
      typeof value === "object" &&
      "error" in value
    ) {
      this.state.finishReason = { unified: "error", raw: undefined };
      controller.enqueue({ type: "error", error: value.error });
      return;
    }

    if (this.state.isFirstChunk) {
      this.state.isFirstChunk = false;

      if (!this.state.hasStreamStarted) {
        this.state.hasStreamStarted = true;
        controller.enqueue({ type: "stream-start", warnings: this.warnings });
      }

      controller.enqueue({
        type: "response-metadata",
        ...getResponseMetadata(value),
      });
    }

    if (value.done) {
      this.handleDoneChunk(value, controller);
    }

    const delta = value?.message;
    if (delta) {
      this.processDelta(delta, controller);
    }
  }

  private handleDoneChunk(
    value: OllamaResponse,
    controller: TransformStreamDefaultController<LanguageModelV4StreamPart>,
  ) {
    this.state.finishReason = mapOllamaFinishReason(value.done_reason);
    this.state.usage = {
      inputTokens: {
        total: value.prompt_eval_count || 0,
        noCache: undefined,
        cacheRead: undefined,
        cacheWrite: undefined,
      },
      outputTokens: {
        total: value.eval_count || 0,
        text: undefined,
        reasoning: undefined,
      },
    };

    // Close any started streams
    if (this.state.hasTextStarted && !this.state.textEnded) {
      controller.enqueue({ type: "text-end", id: this.state.textId });
      this.state.textEnded = true;
    }
    if (this.state.hasReasoningStarted && !this.state.reasoningEnded) {
      controller.enqueue({ type: "reasoning-end", id: this.state.reasoningId });
      this.state.reasoningEnded = true;
    }
  }

  private processDelta(
    delta: OllamaResponse["message"],
    controller: TransformStreamDefaultController<LanguageModelV4StreamPart>,
  ) {
    this.processTextContent(delta, controller);
    this.processThinking(delta, controller);
    this.processToolCalls(delta, controller);
  }

  private processTextContent(
    delta: OllamaResponse["message"],
    controller: TransformStreamDefaultController<LanguageModelV4StreamPart>,
  ) {
    if (delta?.content != null) {
      if (!this.state.hasTextStarted) {
        controller.enqueue({ type: "text-start", id: this.state.textId });
        this.state.hasTextStarted = true;
      }
      controller.enqueue({
        type: "text-delta",
        id: this.state.textId,
        delta: delta.content,
      });
    }
  }

  private processThinking(
    delta: OllamaResponse["message"],
    controller: TransformStreamDefaultController<LanguageModelV4StreamPart>,
  ) {
    if (delta?.thinking) {
      if (!this.state.hasReasoningStarted) {
        controller.enqueue({
          type: "reasoning-start",
          id: this.state.reasoningId,
        });
        this.state.hasReasoningStarted = true;
      }
      controller.enqueue({
        type: "reasoning-delta",
        id: this.state.reasoningId,
        delta: delta.thinking,
      });
    }
  }

  private processToolCalls(
    delta: OllamaResponse["message"],
    controller: TransformStreamDefaultController<LanguageModelV4StreamPart>,
  ) {
    for (const toolCall of delta.tool_calls ?? []) {
      if (toolCall.function?.name == null) {
        throw new InvalidResponseDataError({
          data: toolCall,
          message: `Expected 'function.name' to be a string.`,
        });
      }

      if (
        toolCall.function?.name != null &&
        toolCall.function?.arguments != null
      ) {
        this.emitToolCall(toolCall, controller);
      }
    }
  }

  private emitToolCall(
    toolCall: NonNullable<OllamaResponse["message"]["tool_calls"]>[0],
    controller: TransformStreamDefaultController<LanguageModelV4StreamPart>,
  ) {
    const id = toolCall.id ?? this.config.generateId?.() ?? generateId();

    controller.enqueue({
      type: "tool-input-start",
      id: id,
      toolName: toolCall.function.name,
    });

    controller.enqueue({
      type: "tool-input-delta",
      id: id,
      delta: JSON.stringify(toolCall.function.arguments),
    });

    controller.enqueue({
      type: "tool-input-end",
      id: id,
    });

    controller.enqueue({
      type: "tool-call",
      toolCallId: id,
      toolName: toolCall.function.name,
      input: JSON.stringify(toolCall.function.arguments),
    });

    this.state.hasToolCalls = true;
  }

  private finalizeStream(
    controller: TransformStreamDefaultController<LanguageModelV4StreamPart>,
  ) {
    // Ensure any started segments are properly closed
    if (this.state.hasTextStarted && !this.state.textEnded) {
      controller.enqueue({ type: "text-end", id: this.state.textId });
    }
    if (this.state.hasReasoningStarted && !this.state.reasoningEnded) {
      controller.enqueue({ type: "reasoning-end", id: this.state.reasoningId });
    }

    const correctedFinishReason: LanguageModelV4FinishReason =
      this.state.hasToolCalls &&
      this.state.finishReason.unified !== "tool-calls"
        ? { unified: "tool-calls", raw: "tool_calls" }
        : this.state.finishReason;

    controller.enqueue({
      type: "finish",
      finishReason: correctedFinishReason,
      usage: this.state.usage,
      providerMetadata: {
        ollama: {
          responseId: this.state.responseId,
        },
      },
    });
  }
}
