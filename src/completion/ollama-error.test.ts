import { APICallError } from "@ai-sdk/provider";
import { safeParseJSON } from "@ai-sdk/provider-utils";
import { ollamaErrorDataSchema, ollamaFailedResponseHandler } from "./ollama-error";

describe("ollamaErrorDataSchema", () => {
  it("should parse OpenRouter resource exhausted error", async () => {
    const error = `
{"error":{"message":"{\\n  \\"error\\": {\\n    \\"code\\": 429,\\n    \\"message\\": \\"Resource has been exhausted (e.g. check quota).\\",\\n    \\"status\\": \\"RESOURCE_EXHAUSTED\\"\\n  }\\n}\\n","code":429}}
`;

    const result = await safeParseJSON({
      text: error,
      schema: ollamaErrorDataSchema,
    });

    expect(result).toStrictEqual({
      success: true,
      value: {
        error: {
          message:
            '{\n  "error": {\n    "code": 429,\n    "message": "Resource has been exhausted (e.g. check quota).",\n    "status": "RESOURCE_EXHAUSTED"\n  }\n}\n',
          code: 429,
        },
      },
      rawValue: {
        error: {
          message:
            '{\n  "error": {\n    "code": 429,\n    "message": "Resource has been exhausted (e.g. check quota).",\n    "status": "RESOURCE_EXHAUSTED"\n  }\n}\n',
          code: 429,
        },
      },
    });
  });
});

describe("ollamaFailedResponseHandler", () => {
  it("should create APICallError from Ollama error response", async () => {
    const response = new Response(
      JSON.stringify({
        error: {
          message: "model not found",
          code: 404,
        },
      }),
      { status: 404 },
    );

    const { value: error } = await ollamaFailedResponseHandler({
      response,
      url: "http://127.0.0.1:11434/api/chat",
      requestBodyValues: {},
    });

    expect(error).toBeInstanceOf(APICallError);
    expect(error.message).toBe("model not found");
    expect(error.statusCode).toBe(404);
  });
});
