import { LanguageModelV4Prompt } from "@ai-sdk/provider";
import { createTestServer } from "../../test-utils/test-server";
import { OllamaCompletionModelId } from "../ollama-completion-settings";

export const TEST_PROMPT: LanguageModelV4Prompt = [
  { role: "user", content: [{ type: "text", text: "Hello" }] },
];

export const TEST_MODEL_ID: OllamaCompletionModelId = "codellama:code";

export const COMPLETION_API_URL = "http://127.0.0.1:11434/api/generate";

export const createMockServer = () =>
  createTestServer({
    [COMPLETION_API_URL]: {},
  });

export interface CompletionMockResponseOptions {
  response?: string;
  usage?: { prompt_eval_count?: number; eval_count?: number };
  headers?: Record<string, string>;
}

export const prepareJsonResponse = (
  server: ReturnType<typeof createMockServer>,
  {
    response = "Hello, how can I help you?",
    usage = { prompt_eval_count: 10, eval_count: 20 },
    headers,
  }: CompletionMockResponseOptions = {},
) => {
  server.urls[COMPLETION_API_URL].response = {
    type: "json-value",
    headers,
    body: {
      model: TEST_MODEL_ID,
      created_at: "2024-01-01T00:00:00.000Z",
      done: true,
      response,
      context: [],
      prompt_eval_count: usage.prompt_eval_count,
      eval_count: usage.eval_count,
    },
  };
};

export const prepareErrorResponse = (
  server: ReturnType<typeof createMockServer>,
  status: number = 500,
  body: { error: { message: string } } = {
    error: { message: "Internal server error" },
  },
) => {
  server.urls[COMPLETION_API_URL].response = {
    type: "error",
    status,
    body,
  };
};

export interface CompletionStreamOptions {
  chunks?: string[];
  headers?: Record<string, string>;
}

export const prepareTextStreamResponse = (
  server: ReturnType<typeof createMockServer>,
  {
    chunks = [
      `{"model":"${TEST_MODEL_ID}","created_at":"2024-01-01T00:00:00.000Z","done":false,"response":"Hello","context":[]}`,
      `\n{"model":"${TEST_MODEL_ID}","created_at":"2024-01-01T00:00:00.000Z","done":true,"response":" world","context":[],"eval_count":5,"prompt_eval_count":10}`,
    ],
    headers,
  }: CompletionStreamOptions = {},
) => {
  server.urls[COMPLETION_API_URL].response = {
    type: "stream-chunks",
    headers,
    chunks,
  };
};

export const prepareErrorStreamResponse = (
  server: ReturnType<typeof createMockServer>,
) => {
  server.urls[COMPLETION_API_URL].response = {
    type: "stream-chunks",
    chunks: [
      `{"model":"${TEST_MODEL_ID}","created_at":"2024-01-01T00:00:00.000Z","done":false,"response":"","context":[]}`,
      `\n{"model":"${TEST_MODEL_ID}","created_at":"2024-01-01T00:00:00.000Z","done":true,"response":"","context":[],"error":"model overloaded"}`,
    ],
  };
};
