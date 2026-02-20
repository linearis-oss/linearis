// tests/unit/services/team-service.test.ts
import { describe, expect, it, vi } from "vitest";
import type { GraphQLClient } from "../../../src/client/graphql-client.js";
import { listTeams } from "../../../src/services/team-service.js";

function mockGqlClient(response: Record<string, unknown>): GraphQLClient {
  return {
    request: vi.fn().mockResolvedValue(response),
  } as unknown as GraphQLClient;
}

describe("listTeams", () => {
  it("returns teams", async () => {
    const client = mockGqlClient({
      teams: {
        nodes: [{ id: "team-1", key: "ENG", name: "Engineering" }],
        pageInfo: { hasNextPage: false, endCursor: "c1" },
      },
    });
    const result = await listTeams(client);
    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0].id).toBe("team-1");
    expect(result.nodes[0].key).toBe("ENG");
    expect(result.nodes[0].name).toBe("Engineering");
    expect(result.pageInfo).toEqual({ hasNextPage: false, endCursor: "c1" });
  });

  it("returns empty result", async () => {
    const client = mockGqlClient({
      teams: {
        nodes: [],
        pageInfo: { hasNextPage: false, endCursor: null },
      },
    });
    const result = await listTeams(client);
    expect(result.nodes).toEqual([]);
    expect(result.pageInfo.hasNextPage).toBe(false);
  });

  it("passes after cursor", async () => {
    const client = mockGqlClient({
      teams: {
        nodes: [],
        pageInfo: { hasNextPage: false, endCursor: null },
      },
    });
    await listTeams(client, { after: "cur1" });
    expect(client.request).toHaveBeenCalledWith(expect.anything(), {
      first: 50,
      after: "cur1",
    });
  });

  it("uses default limit of 50", async () => {
    const client = mockGqlClient({
      teams: {
        nodes: [],
        pageInfo: { hasNextPage: false, endCursor: null },
      },
    });
    await listTeams(client);
    expect(client.request).toHaveBeenCalledWith(expect.anything(), {
      first: 50,
      after: undefined,
    });
  });
});
