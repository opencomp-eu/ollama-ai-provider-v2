import {
  extractResponseHeaders,
  ParseResult,
  ResponseHandler,
} from "@ai-sdk/provider-utils";
import { z } from "zod";

const ollamaStreamErrorSchema = z.object({ error: z.string() });

export type OllamaStreamResponse<T> =
  T | z.infer<typeof ollamaStreamErrorSchema>;

/**
 * Creates a response handler for NDJSON (Newline-delimited JSON) streams.
 * This replaces the removed createJsonStreamResponseHandler from @ai-sdk/provider-utils.
 */
export function createNdjsonStreamResponseHandler<T>(
  schema: z.ZodSchema<T>,
): ResponseHandler<ReadableStream<ParseResult<OllamaStreamResponse<T>>>> {
  const streamSchema = z.union([schema, ollamaStreamErrorSchema]);

  return async ({ response }) => {
    const responseHeaders = extractResponseHeaders(response);

    if (response.body == null) {
      throw new Error("Response body is null");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    const stream = new ReadableStream<ParseResult<OllamaStreamResponse<T>>>({
      async pull(controller) {
        while (true) {
          const { done, value } = await reader.read();

          if (done) {
            // Process any remaining data in buffer
            if (buffer.trim()) {
              try {
                const parsed = JSON.parse(buffer.trim());
                const validated = streamSchema.parse(parsed);
                controller.enqueue({
                  success: true,
                  value: validated,
                  rawValue: validated,
                });
              } catch {
                // Ignore parse errors for incomplete data at end
              }
            }
            controller.close();
            return;
          }

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            const trimmedLine = line.trim();
            if (trimmedLine) {
              try {
                const parsed = JSON.parse(trimmedLine);
                const validated = streamSchema.parse(parsed);
                controller.enqueue({
                  success: true,
                  value: validated,
                  rawValue: validated,
                });
              } catch (error) {
                // Skip invalid JSON lines
                console.warn("Failed to parse NDJSON line:", error);
              }
            }
          }
        }
      },
      cancel() {
        reader.cancel();
      },
    });

    return {
      responseHeaders,
      value: stream,
    };
  };
}
