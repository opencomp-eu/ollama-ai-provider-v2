import {
  EmbeddingModelV4,
  LanguageModelV4,
  ProviderV4,
  NoSuchModelError,
} from "@ai-sdk/provider";
import { FetchFunction, withoutTrailingSlash } from "@ai-sdk/provider-utils";
import {
  OllamaChatModelId,
  OllamaProviderOptions,
  ollamaProviderOptions,
} from "./ollama-chat-settings";
import { OllamaCompletionLanguageModel } from "./completion/ollama-completion-language-model";
import {
  OllamaCompletionModelId,
  OllamaCompletionSettings,
} from "./completion/ollama-completion-settings";
import { OllamaEmbeddingModel } from "./embedding/ollama-embedding-model";
import {
  OllamaEmbeddingModelId,
  OllamaEmbeddingSettings,
} from "./embedding/ollama-embedding-settings";
import { OllamaResponsesLanguageModel } from "./responses/ollama-responses-language-model";

export interface OllamaProvider extends ProviderV4 {
  (modelId: OllamaChatModelId): LanguageModelV4;

  /**
Creates an Ollama model for text generation.
   */
  languageModel(modelId: OllamaChatModelId): LanguageModelV4;

  /**
Creates an Ollama chat model for text generation.
   */
  chat(
    modelId: OllamaChatModelId,
    settings?: OllamaProviderOptions,
  ): LanguageModelV4;

  /**
Creates an Ollama completion model for text generation.
   */
  completion(
    modelId: OllamaCompletionModelId,
    settings?: OllamaCompletionSettings,
  ): LanguageModelV4;

  /**
Creates a model for text embeddings.
   */
  embedding(
    modelId: OllamaEmbeddingModelId,
    settings?: OllamaEmbeddingSettings,
  ): EmbeddingModelV4;

  /**
Creates a model for text embeddings.

@deprecated Use `textEmbeddingModel` instead.
   */
  textEmbedding(
    modelId: OllamaEmbeddingModelId,
    settings?: OllamaEmbeddingSettings,
  ): EmbeddingModelV4;

  /**
Creates a model for text embeddings.
   */
  textEmbeddingModel(
    modelId: OllamaEmbeddingModelId,
    settings?: OllamaEmbeddingSettings,
  ): EmbeddingModelV4;
}

export interface OllamaProviderSettings {
  /**
Base URL for the Ollama API calls.
     */
  baseURL?: string;

  /**
Ollama Organization.
     */
  organization?: string;

  /**
Ollama project.
     */
  project?: string;

  /**
Custom headers to include in the requests.
     */
  headers?: Record<string, string>;

  /**
Ollama compatibility mode. Should be set to `strict` when using the Ollama API,
and `compatible` when using 3rd party providers. In `compatible` mode, newer
information such as streamOptions are not being sent. Defaults to 'compatible'.
   */
  compatibility?: "strict" | "compatible";

  /**
Provider name. Overrides the `ollama` default name for 3rd party providers.
   */
  name?: string;

  /**
Custom fetch implementation. You can use it as a middleware to intercept requests,
or to provide a custom fetch implementation for e.g. testing.
    */
  fetch?: FetchFunction;
}

/**
Create an Ollama provider instance.
 */
export function createOllama(
  options: OllamaProviderSettings = {},
): OllamaProvider {
  const baseURL =
    withoutTrailingSlash(options.baseURL) ?? "http://127.0.0.1:11434/api";

  const providerName = options.name ?? "ollama";

  const getHeaders = () => ({
    "Ollama-Organization": options.organization,
    "Ollama-Project": options.project,
    ...options.headers,
  });

  const createCompletionModel = (
    modelId: OllamaCompletionModelId,
    settings: OllamaCompletionSettings = {},
  ) =>
    new OllamaCompletionLanguageModel(modelId, settings, {
      provider: `${providerName}.completion`,
      url: ({ path }) => `${baseURL}${path}`,
      headers: getHeaders,
      fetch: options.fetch,
    });

  const createEmbeddingModel = (
    modelId: OllamaEmbeddingModelId,
    settings: OllamaEmbeddingSettings = {},
  ) =>
    new OllamaEmbeddingModel(modelId, settings, {
      provider: `${providerName}.embedding`,
      url: ({ path }) => `${baseURL}${path}`,
      headers: getHeaders,
      fetch: options.fetch,
    });

  function createLanguageModel(modelId: OllamaChatModelId) {
    if (new.target) {
      throw new Error(
        "The Ollama model function cannot be called with the new keyword.",
      );
    }

    return createResponsesModel(modelId);
  }

  const createResponsesModel = (modelId: OllamaChatModelId) => {
    return new OllamaResponsesLanguageModel(modelId, {
      provider: `${providerName}.responses`,
      url: ({ path }) => `${baseURL}${path}`,
      headers: getHeaders,
      fetch: options.fetch,
    });
  };

  const provider = function (modelId: OllamaChatModelId) {
    if (new.target) {
      throw new Error(
        "The Ollama model function cannot be called with the new keyword.",
      );
    }

    return createLanguageModel(modelId);
  };

  provider.specificationVersion = "v4" as const;
  provider.languageModel = createLanguageModel;
  provider.chat = createLanguageModel;
  provider.completion = createCompletionModel;
  provider.embedding = createEmbeddingModel;
  provider.textEmbedding = createEmbeddingModel;
  provider.textEmbeddingModel = createEmbeddingModel;
  provider.embeddingModel = createEmbeddingModel;
  provider.imageModel = (modelId: string) => {
    throw new NoSuchModelError({
      modelId,
      modelType: "imageModel",
      message: "Image generation is unsupported with Ollama",
    });
  };

  return provider as OllamaProvider;
}

/**
Default Ollama provider instance.
 */
export const ollama = createOllama();
