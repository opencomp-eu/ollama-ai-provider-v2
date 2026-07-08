import { convertReadableStreamToArray } from "../test-utils/test-server";
import { OllamaCompletionLanguageModel } from "./ollama-completion-language-model";
import {
  TEST_MODEL_ID,
  TEST_PROMPT,
  createMockServer,
  prepareErrorResponse,
  prepareErrorStreamResponse,
  prepareJsonResponse,
  prepareTextStreamResponse,
} from "./test-helpers/ollama-completion-test-helpers";

describe("OllamaCompletionLanguageModel", () => {
  const server = createMockServer();
  const model = new OllamaCompletionLanguageModel(
    TEST_MODEL_ID,
    { think: true, echo: false, suffix: "END", user: "test-user" },
    {
      provider: "ollama.completion",
      url: ({ path }) => `http://127.0.0.1:11434/api${path}`,
      headers: () => ({ "Content-Type": "application/json" }),
    },
  );

  describe("Model Properties", () => {
    it("should have correct specification version", () => {
      expect(model.specificationVersion).toBe("v4");
    });

    it("should have correct model ID", () => {
      expect(model.modelId).toBe(TEST_MODEL_ID);
    });

    it("should have correct provider", () => {
      expect(model.provider).toBe("ollama.completion");
    });

    it("should not support image URLs", () => {
      expect(model.supportedUrls).toEqual({});
    });
  });

  describe("doGenerate", () => {
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

    it("should pass model and prompt in request body", async () => {
      prepareJsonResponse(server);

      await model.doGenerate({
        prompt: TEST_PROMPT,
        temperature: 0.5,
        maxOutputTokens: 50,
        stopSequences: ["STOP"],
      });

      expect(await server.calls[0].requestBodyJson).toMatchObject({
        model: TEST_MODEL_ID,
        stream: false,
        temperature: 0.5,
        max_tokens: 50,
        stop: ["\nuser:", "STOP"],
        think: true,
        echo: false,
        suffix: "END",
        user: "test-user",
      });
      expect(
        (await server.calls[0].requestBodyJson) as { prompt: string },
      ).toHaveProperty("prompt");
    });

    it("should return warnings for unsupported settings", async () => {
      prepareJsonResponse(server);

      const result = await model.doGenerate({
        prompt: TEST_PROMPT,
        topK: 50,
        tools: [
          {
            type: "function",
            name: "weather",
            inputSchema: { type: "object", properties: {} },
          },
        ],
        toolChoice: { type: "auto" },
        responseFormat: { type: "json", schema: { type: "object" } },
      });

      expect(result.warnings).toEqual([
        { type: "unsupported", feature: "topK" },
        { type: "unsupported", feature: "tools" },
        { type: "unsupported", feature: "toolChoice" },
        { type: "unsupported", feature: "responseFormat (JSON)" },
      ]);
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

    it("should handle API errors", async () => {
      prepareErrorResponse(server);

      await expect(
        model.doGenerate({
          prompt: TEST_PROMPT,
        }),
      ).rejects.toThrow();
    });
  });

  describe("doStream", () => {
    it("should stream text parts", async () => {
      prepareTextStreamResponse(server);

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
            usage: expect.any(Object),
          },
        ]),
      );
      expect(result.request?.body).toBeDefined();
    });

    it("should pass stream: true in request body", async () => {
      prepareTextStreamResponse(server);

      await model.doStream({
        prompt: TEST_PROMPT,
      });

      expect(await server.calls[0].requestBodyJson).toMatchObject({
        model: TEST_MODEL_ID,
        stream: true,
      });
    });

    it("should return warnings for unsupported settings", async () => {
      prepareTextStreamResponse(server);

      const result = await model.doStream({
        prompt: TEST_PROMPT,
        topK: 50,
      });

      expect(result.warnings).toEqual([
        { type: "unsupported", feature: "topK" },
      ]);
    });

    it("should handle error chunks in stream", async () => {
      prepareErrorStreamResponse(server);

      const result = await model.doStream({
        prompt: TEST_PROMPT,
      });

      const parts = await convertReadableStreamToArray(result.stream);

      expect(parts).toEqual(
        expect.arrayContaining([{ type: "error", error: "model overloaded" }]),
      );
    });
  });
});
