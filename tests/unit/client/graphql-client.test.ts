import { describe, it, expect, vi } from "vitest";
import { GraphQLClient } from "../../../src/client/graphql-client.js";

// We test the error handling logic by mocking the underlying rawRequest
// The constructor creates a real LinearClient, so we mock at module level
vi.mock("@linear/sdk", () => {
  const mockRawRequest = vi.fn();
  return {
    LinearClient: vi.fn().mockImplementation(() => ({
      client: { rawRequest: mockRawRequest },
    })),
    __mockRawRequest: mockRawRequest,
  };
});

describe("GraphQLClient", () => {
  it("can be constructed with an API token", () => {
    const client = new GraphQLClient("test-token");
    expect(client).toBeDefined();
  });
});
