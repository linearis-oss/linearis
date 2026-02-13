import { describe, expect, it, vi } from "vitest";
import type { GraphQLClient } from "../../../src/client/graphql-client.js";
import { validateToken } from "../../../src/services/auth-service.js";

function mockGqlClient(response: Record<string, unknown>): GraphQLClient {
  return {
    request: vi.fn().mockResolvedValue(response),
  } as unknown as GraphQLClient;
}

describe("validateToken", () => {
  it("returns viewer on successful validation", async () => {
    const client = mockGqlClient({
      viewer: { id: "user-1", name: "Test User", email: "test@example.com" },
    });

    const result = await validateToken(client);
    expect(result).toEqual({
      id: "user-1",
      name: "Test User",
      email: "test@example.com",
    });
  });

  it("propagates error on invalid token", async () => {
    const client = {
      request: vi.fn().mockRejectedValue(new Error("Authentication failed")),
    } as unknown as GraphQLClient;

    await expect(validateToken(client)).rejects.toThrow(
      "Authentication failed",
    );
  });
});
