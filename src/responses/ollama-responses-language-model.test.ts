import { convertReadableStreamToArray } from "../test-utils/test-server";
import { OllamaResponsesLanguageModel } from "./ollama-responses-language-model";
import {
  TEST_MODEL_ID,
  TEST_PROMPT,
  TEST_TOOLS,
  createMockServer,
  createTestConfig,
  prepareErrorResponse,
  prepareJsonResponse,
  prepareReasoningStreamResponse,
  prepareStreamResponse,
  prepareToolCallStreamResponse,
} from "./test-helpers/ollama-test-helpers";

describe("OllamaResponsesLanguageModel", () => {
  const testConfig = createTestConfig();
  const model = new OllamaResponsesLanguageModel(TEST_MODEL_ID, testConfig);
  const server = createMockServer();

  describe("Model Properties", () => {
    it("should have correct specification version", () => {
      expect(model.specificationVersion).toBe("v4");
    });

    it("should have correct model ID", () => {
      expect(model.modelId).toBe(TEST_MODEL_ID);
    });

    it("should have correct provider", () => {
      expect(model.provider).toBe("ollama.responses");
    });

    it("should support image URLs", () => {
      expect(model.supportedUrls["image/*"]).toEqual([/^https?:\/\/.*$/]);
    });
  });

  describe("doGenerate", () => {
    describe("Basic Generation", () => {
      it("should generate text response", async () => {
        prepareJsonResponse(server);

        const result = await model.doGenerate({
          prompt: TEST_PROMPT,
          maxOutputTokens: 100,
          temperature: 0.7,
        });

        expect(result.content).toEqual([
          { type: "text", text: "Hello, how can I help you?" },
        ]);
        expect(result.finishReason).toEqual({ raw: "stop", unified: "stop" });
        expect(result.usage).toEqual({
          inputTokens: {
            total: 10,
            noCache: undefined,
            cacheRead: undefined,
            cacheWrite: undefined,
          },
          outputTokens: {
            total: 20,
            text: undefined,
            reasoning: undefined,
          },
        });
      });

      it("should expose raw response data", async () => {
        prepareJsonResponse(server, {
          headers: { "x-custom-header": "test-value" },
        });

        const result = await model.doGenerate({
          prompt: TEST_PROMPT,
        });

        expect(result.response?.headers).toMatchObject({
          "x-custom-header": "test-value",
        });
        expect(result.request?.body).toBeDefined();
      });
    });

    describe("Tool Calls", () => {
      it("should handle tool calls", async () => {
        prepareJsonResponse(server, {
          content: "I need to check the weather for you.",
          toolCalls: [
            {
              id: "call_1",
              function: {
                name: "weather",
                arguments: { location: "San Francisco" },
              },
            },
          ],
        });

        const result = await model.doGenerate({
          prompt: TEST_PROMPT,
          tools: TEST_TOOLS,
        });

        expect(result.content).toEqual([
          { type: "text", text: "I need to check the weather for you." },
          {
            type: "tool-call",
            toolCallId: "call_1",
            toolName: "weather",
            input: '{"location":"San Francisco"}',
          },
        ]);
      });

      it("should generate tool call ID when missing", async () => {
        prepareJsonResponse(server, {
          content: "",
          toolCalls: [
            {
              function: {
                name: "weather",
                arguments: { location: "New York" },
              },
            },
          ],
        });

        const result = await model.doGenerate({
          prompt: TEST_PROMPT,
          tools: TEST_TOOLS,
        });

        expect(result.content[0]).toEqual({
          type: "tool-call",
          toolCallId: "mock-id-1",
          toolName: "weather",
          input: '{"location":"New York"}',
        });
      });
    });

    describe("Settings and Options", () => {
      it("should return warnings for unsupported settings", async () => {
        prepareJsonResponse(server);

        const result = await model.doGenerate({
          prompt: TEST_PROMPT,
          topK: 50,
          seed: 123,
          presencePenalty: 0.5,
          frequencyPenalty: 0.3,
          stopSequences: ["stop"],
        });

        expect(result.warnings).toEqual([
          { type: "unsupported", feature: "setting", details: "topK" },
          { type: "unsupported", feature: "setting", details: "seed" },
          {
            type: "unsupported",
            feature: "setting",
            details: "presencePenalty",
          },
          {
            type: "unsupported",
            feature: "setting",
            details: "frequencyPenalty",
          },
          { type: "unsupported", feature: "setting", details: "stopSequences" },
        ]);
      });

      it("should handle JSON response format", async () => {
        prepareJsonResponse(server, {
          content: '{"result": "success"}',
        });

        const result = await model.doGenerate({
          prompt: TEST_PROMPT,
          responseFormat: {
            type: "json",
            schema: {
              type: "object",
              properties: { result: { type: "string" } },
            },
          },
        });

        expect(result.content[0]).toEqual({
          type: "text",
          text: '{"result": "success"}',
        });
      });

      it("should handle provider options", async () => {
        prepareJsonResponse(server);

        const result = await model.doGenerate({
          prompt: TEST_PROMPT,
          providerOptions: {
            ollama: {
              user: "test-user",
              metadata: { session: "test" },
              think: true,
            },
          },
        });

        expect(result.warnings).toEqual([]);
      });

      it("should map reasoning none to think false", async () => {
        prepareJsonResponse(server);

        await model.doGenerate({
          prompt: TEST_PROMPT,
          reasoning: "none",
        });

        expect(await server.calls[0].requestBodyJson).toMatchObject({
          think: false,
        });
      });

      it("should map reasoning high to think true with warning", async () => {
        prepareJsonResponse(server);

        const result = await model.doGenerate({
          prompt: TEST_PROMPT,
          reasoning: "high",
        });

        expect(await server.calls[0].requestBodyJson).toMatchObject({
          think: true,
        });
        expect(result.warnings).toEqual([
          {
            type: "other",
            message:
              'Ollama only supports on/off thinking; reasoning effort "high" was mapped to think=true',
          },
        ]);
      });
    });

    describe("Error Handling", () => {
      it("should handle API errors", async () => {
        prepareErrorResponse(server);

        await expect(
          model.doGenerate({
            prompt: TEST_PROMPT,
          }),
        ).rejects.toThrow();
      });
    });
  });

  describe("doStream", () => {
    it("should stream text parts", async () => {
      prepareStreamResponse(server);

      const result = await model.doStream({
        prompt: TEST_PROMPT,
      });

      const parts = await convertReadableStreamToArray(result.stream);

      expect(parts[0]).toMatchObject({
        type: "stream-start",
        warnings: [],
      });
      expect(parts[1]).toMatchObject({
        type: "response-metadata",
        modelId: TEST_MODEL_ID,
        timestamp: new Date("2024-01-01T00:00:00.000Z"),
      });
      expect(parts).toEqual(
        expect.arrayContaining([
          { type: "text-start", id: expect.any(String) },
          { type: "text-delta", id: expect.any(String), delta: "Hello" },
          { type: "text-delta", id: expect.any(String), delta: " world" },
          { type: "text-end", id: expect.any(String) },
          {
            type: "finish",
            finishReason: { raw: "stop", unified: "stop" },
            usage: {
              inputTokens: {
                total: 10,
                noCache: undefined,
                cacheRead: undefined,
                cacheWrite: undefined,
              },
              outputTokens: {
                total: 5,
                text: undefined,
                reasoning: undefined,
              },
            },
            providerMetadata: { ollama: { responseId: null } },
          },
        ]),
      );
      expect(result.response?.headers).toBeDefined();
      expect(result.request?.body).toBeDefined();
    });

    it("should stream reasoning parts", async () => {
      prepareReasoningStreamResponse(server);

      const result = await model.doStream({
        prompt: TEST_PROMPT,
      });

      const parts = await convertReadableStreamToArray(result.stream);

      expect(parts).toEqual(
        expect.arrayContaining([
          { type: "reasoning-start", id: expect.any(String) },
          {
            type: "reasoning-delta",
            id: expect.any(String),
            delta: "Let me think",
          },
          {
            type: "reasoning-delta",
            id: expect.any(String),
            delta: " about this",
          },
          { type: "reasoning-end", id: expect.any(String) },
          { type: "text-start", id: expect.any(String) },
          {
            type: "text-delta",
            id: expect.any(String),
            delta: "The answer is 42",
          },
          { type: "text-end", id: expect.any(String) },
        ]),
      );
    });

    it("should stream tool call parts", async () => {
      prepareToolCallStreamResponse(server);

      const result = await model.doStream({
        prompt: TEST_PROMPT,
        tools: TEST_TOOLS,
      });

      const parts = await convertReadableStreamToArray(result.stream);

      expect(parts).toEqual(
        expect.arrayContaining([
          {
            type: "tool-input-start",
            id: "call_1",
            toolName: "weather",
          },
          {
            type: "tool-input-delta",
            id: "call_1",
            delta: '{"location":"SF"}',
          },
          { type: "tool-input-end", id: "call_1" },
          {
            type: "tool-call",
            toolCallId: "call_1",
            toolName: "weather",
            input: '{"location":"SF"}',
          },
          {
            type: "finish",
            finishReason: { raw: "tool_calls", unified: "tool-calls" },
            usage: expect.any(Object),
            providerMetadata: expect.any(Object),
          },
        ]),
      );
    });

    it("should include raw chunks when requested", async () => {
      prepareStreamResponse(server);

      const result = await model.doStream({
        prompt: TEST_PROMPT,
        includeRawChunks: true,
      });

      const parts = await convertReadableStreamToArray(result.stream);

      expect(parts.some((part) => part.type === "raw")).toBe(true);
    });

    it("should return warnings for unsupported settings", async () => {
      prepareStreamResponse(server);

      const result = await model.doStream({
        prompt: TEST_PROMPT,
        topK: 50,
        seed: 123,
      });

      expect(result.warnings).toEqual([
        { type: "unsupported", feature: "setting", details: "topK" },
        { type: "unsupported", feature: "setting", details: "seed" },
      ]);
    });
  });
});
