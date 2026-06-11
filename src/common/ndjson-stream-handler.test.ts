import { z } from "zod";
import { createNdjsonStreamResponseHandler } from "./ndjson-stream-handler";

const schema = z.object({
  value: z.string(),
});

describe("createNdjsonStreamResponseHandler", () => {
  it("should parse multiple NDJSON lines", async () => {
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(
          new TextEncoder().encode('{"value":"first"}\n{"value":"second"}'),
        );
        controller.close();
      },
    });

    const handler = createNdjsonStreamResponseHandler(schema);
    const { value: stream } = await handler({
      response: new Response(body),
      url: "http://test",
      requestBodyValues: {},
    });

    const results = [];
    const reader = stream.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      results.push(value);
    }

    expect(results).toEqual([
      { success: true, value: { value: "first" }, rawValue: { value: "first" } },
      {
        success: true,
        value: { value: "second" },
        rawValue: { value: "second" },
      },
    ]);
  });

  it("should handle partial lines across chunks", async () => {
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('{"value":"hel'));
        controller.enqueue(new TextEncoder().encode('lo"}\n'));
        controller.close();
      },
    });

    const handler = createNdjsonStreamResponseHandler(schema);
    const { value: stream } = await handler({
      response: new Response(body),
      url: "http://test",
      requestBodyValues: {},
    });

    const results = [];
    const reader = stream.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      results.push(value);
    }

    expect(results).toEqual([
      { success: true, value: { value: "hello" }, rawValue: { value: "hello" } },
    ]);
  });

  it("should skip invalid lines", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(
          new TextEncoder().encode('invalid\n{"value":"ok"}\n'),
        );
        controller.close();
      },
    });

    const handler = createNdjsonStreamResponseHandler(schema);
    const { value: stream } = await handler({
      response: new Response(body),
      url: "http://test",
      requestBodyValues: {},
    });

    const results = [];
    const reader = stream.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      results.push(value);
    }

    expect(results).toHaveLength(1);
    expect(results[0].value).toEqual({ value: "ok" });
    expect(warnSpy).toHaveBeenCalled();

    warnSpy.mockRestore();
  });

  it("should throw when response body is null", async () => {
    const handler = createNdjsonStreamResponseHandler(schema);

    await expect(
      handler({
        response: new Response(null),
        url: "http://test",
        requestBodyValues: {},
      }),
    ).rejects.toThrow("Response body is null");
  });
});
