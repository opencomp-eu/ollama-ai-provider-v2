import { NoSuchModelError } from "@ai-sdk/provider";
import { createTestServer } from "./test-utils/test-server";
import { createOllama } from "./ollama-provider";

const server = createTestServer({
  "https://custom.example.com/api/embed": {},
  "http://127.0.0.1:11434/api/embed": {},
});

describe("createOllama", () => {
  it("should return a callable provider", () => {
    const provider = createOllama();

    expect(provider.specificationVersion).toBe("v3");
    expect(provider("llama3.2").provider).toBe("ollama.responses");
    expect(provider.chat("llama3.2").provider).toBe("ollama.responses");
    expect(provider.languageModel("llama3.2").provider).toBe("ollama.responses");
  });

  it("should create completion and embedding models", () => {
    const provider = createOllama();

    expect(provider.completion("codellama:code").provider).toBe(
      "ollama.completion",
    );
    expect(provider.embedding("nomic-embed-text").provider).toBe(
      "ollama.embedding",
    );
    expect(provider.textEmbeddingModel("nomic-embed-text").provider).toBe(
      "ollama.embedding",
    );
  });

  it("should use custom baseURL", async () => {
    server.urls["https://custom.example.com/api/embed"].response = {
      type: "json-value",
      body: {
        model: "test-embed",
        embeddings: [[0.1]],
        total_duration: 1,
        load_duration: 1,
        prompt_eval_count: 1,
      },
    };

    const provider = createOllama({
      baseURL: "https://custom.example.com/api",
    });

    await provider.embedding("test-embed").doEmbed({
      values: ["hello"],
    });

    expect(server.calls).toHaveLength(1);
  });

  it("should merge custom headers into requests", async () => {
    server.urls["http://127.0.0.1:11434/api/embed"].response = {
      type: "json-value",
      body: {
        model: "test-embed",
        embeddings: [[0.1]],
        total_duration: 1,
        load_duration: 1,
        prompt_eval_count: 1,
      },
    };

    const provider = createOllama({
      headers: { "Custom-Provider-Header": "provider-value" },
    });

    await provider.embedding("test-embed").doEmbed({
      values: ["hello"],
      headers: { "Custom-Request-Header": "request-value" },
    });

    expect(server.calls[0].requestHeaders).toMatchObject({
      "custom-provider-header": "provider-value",
      "custom-request-header": "request-value",
    });
  });

  it("should throw for imageModel", () => {
    const provider = createOllama();

    expect(() => provider.imageModel("llava")).toThrow(NoSuchModelError);
  });

  it("should throw when languageModel is called with new keyword", () => {
    const provider = createOllama();

    expect(() =>
      new (provider.languageModel as unknown as new (
        modelId: string,
      ) => unknown)("llama3.2"),
    ).toThrow(
      "The Ollama model function cannot be called with the new keyword.",
    );
  });
});
