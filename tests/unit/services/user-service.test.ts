// tests/unit/services/user-service.test.ts
import { describe, expect, it, vi } from "vitest";
import type { GraphQLClient } from "../../../src/client/graphql-client.js";
import { listUsers } from "../../../src/services/user-service.js";

function mockGqlClient(response: Record<string, unknown>): GraphQLClient {
  return {
    request: vi.fn().mockResolvedValue(response),
  } as unknown as GraphQLClient;
}

describe("listUsers", () => {
  it("returns users sorted by name", async () => {
    const client = mockGqlClient({
      users: {
        nodes: [
          { id: "u-2", name: "Zoe", email: "zoe@test.com", active: true },
          { id: "u-1", name: "Alice", email: "alice@test.com", active: true },
        ],
        pageInfo: { hasNextPage: false, endCursor: "c1" },
      },
    });
    const result = await listUsers(client);
    expect(result.nodes[0].name).toBe("Alice");
    expect(result.nodes[1].name).toBe("Zoe");
  });

  it("returns empty result", async () => {
    const client = mockGqlClient({
      users: {
        nodes: [],
        pageInfo: { hasNextPage: false, endCursor: null },
      },
    });
    const result = await listUsers(client);
    expect(result.nodes).toEqual([]);
    expect(result.pageInfo.hasNextPage).toBe(false);
  });

  it("passes after cursor", async () => {
    const client = mockGqlClient({
      users: {
        nodes: [],
        pageInfo: { hasNextPage: false, endCursor: null },
      },
    });
    await listUsers(client, false, { after: "cur1" });
    expect(client.request).toHaveBeenCalledWith(expect.anything(), {
      first: 50,
      after: "cur1",
      filter: undefined,
    });
  });

  it("uses default limit of 50", async () => {
    const client = mockGqlClient({
      users: {
        nodes: [],
        pageInfo: { hasNextPage: false, endCursor: null },
      },
    });
    await listUsers(client);
    expect(client.request).toHaveBeenCalledWith(expect.anything(), {
      first: 50,
      after: undefined,
      filter: undefined,
    });
  });

  it("filters active users when activeOnly is true", async () => {
    const client = mockGqlClient({
      users: {
        nodes: [],
        pageInfo: { hasNextPage: false, endCursor: null },
      },
    });
    await listUsers(client, true);
    expect(client.request).toHaveBeenCalledWith(expect.anything(), {
      first: 50,
      after: undefined,
      filter: { active: { eq: true } },
    });
  });
});
