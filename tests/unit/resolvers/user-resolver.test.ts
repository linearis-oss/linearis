// tests/unit/resolvers/user-resolver.test.ts
import { describe, expect, it, vi } from "vitest";
import type { GraphQLClient } from "../../../src/client/graphql-client.js";
import { resolveUserId } from "../../../src/resolvers/user-resolver.js";

interface MockUser {
  id: string;
  name?: string;
  email?: string;
}

function mockGqlClient(...callResults: Array<{ nodes: MockUser[] }>) {
  const request = vi.fn();
  for (const result of callResults) {
    request.mockResolvedValueOnce({ users: result });
  }
  return { request } as unknown as GraphQLClient;
}

describe("resolveUserId", () => {
  it("returns UUID as-is without querying", async () => {
    const client = mockGqlClient();
    const result = await resolveUserId(
      client,
      "550e8400-e29b-41d4-a716-446655440000",
    );
    expect(result).toBe("550e8400-e29b-41d4-a716-446655440000");
    expect(client.request).not.toHaveBeenCalled();
  });

  it("resolves user by display name", async () => {
    const client = mockGqlClient({
      nodes: [
        { id: "user-uuid-1", name: "John Doe", email: "john@example.com" },
      ],
    });
    const result = await resolveUserId(client, "John Doe");
    expect(result).toBe("user-uuid-1");
    expect(client.request).toHaveBeenCalledWith(expect.anything(), {
      filter: { displayName: { eqIgnoreCase: "John Doe" } },
      first: 10,
    });
  });

  it("falls back to email when name not found", async () => {
    const client = mockGqlClient(
      { nodes: [] },
      {
        nodes: [{ id: "user-uuid-2", name: "Jane", email: "jane@example.com" }],
      },
    );
    const result = await resolveUserId(client, "jane@example.com");
    expect(result).toBe("user-uuid-2");
    expect(client.request).toHaveBeenCalledTimes(2);
    expect(client.request).toHaveBeenNthCalledWith(2, expect.anything(), {
      filter: { email: { eqIgnoreCase: "jane@example.com" } },
      first: 1,
    });
  });

  it("throws when user not found by name or email", async () => {
    const client = mockGqlClient({ nodes: [] }, { nodes: [] });
    await expect(resolveUserId(client, "Nobody")).rejects.toThrow(
      'User "Nobody" not found',
    );
  });

  it("throws when multiple users match by name", async () => {
    const client = mockGqlClient({
      nodes: [
        { id: "user-1", name: "Alex Smith", email: "alex1@example.com" },
        { id: "user-2", name: "Alex Smith", email: "alex2@example.com" },
      ],
    });
    await expect(resolveUserId(client, "Alex Smith")).rejects.toThrow(
      'Multiple Users found matching "Alex Smith"',
    );
  });
});
