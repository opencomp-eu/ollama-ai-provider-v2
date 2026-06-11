import { getResponseMetadata } from "./get-response-metadata";

describe("getResponseMetadata", () => {
  it("should map model and timestamp", () => {
    const result = getResponseMetadata({
      model: "llama2",
      created_at: "2024-01-01T00:00:00.000Z",
    });

    expect(result).toEqual({
      id: undefined,
      modelId: "llama2",
      timestamp: new Date("2024-01-01T00:00:00.000Z"),
    });
  });

  it("should handle missing fields", () => {
    expect(getResponseMetadata({})).toEqual({
      id: undefined,
      modelId: undefined,
      timestamp: undefined,
    });
  });
});
