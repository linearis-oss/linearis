// tests/unit/services/label-service.test.ts
import { describe, expect, it, vi } from "vitest";
import type { GraphQLClient } from "../../../src/client/graphql-client.js";
import { listLabels } from "../../../src/services/label-service.js";

function mockGqlClient(response: Record<string, unknown>): GraphQLClient {
  return {
    request: vi.fn().mockResolvedValue(response),
  } as unknown as GraphQLClient;
}

describe("listLabels", () => {
  it("returns labels", async () => {
    const client = mockGqlClient({
      issueLabels: {
        nodes: [
          { id: "lbl-1", name: "Bug", color: "#ff0000", description: "A bug" },
        ],
        pageInfo: { hasNextPage: false, endCursor: "c1" },
      },
    });
    const result = await listLabels(client);
    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0].id).toBe("lbl-1");
    expect(result.nodes[0].name).toBe("Bug");
    expect(result.nodes[0].color).toBe("#ff0000");
    expect(result.pageInfo).toEqual({ hasNextPage: false, endCursor: "c1" });
  });

  it("returns empty result", async () => {
    const client = mockGqlClient({
      issueLabels: {
        nodes: [],
        pageInfo: { hasNextPage: false, endCursor: null },
      },
    });
    const result = await listLabels(client);
    expect(result.nodes).toEqual([]);
    expect(result.pageInfo.hasNextPage).toBe(false);
  });

  it("passes after cursor", async () => {
    const client = mockGqlClient({
      issueLabels: {
        nodes: [],
        pageInfo: { hasNextPage: false, endCursor: null },
      },
    });
    await listLabels(client, undefined, { after: "cur1" });
    expect(client.request).toHaveBeenCalledWith(expect.anything(), {
      first: 50,
      after: "cur1",
      filter: undefined,
    });
  });

  it("uses default limit of 50", async () => {
    const client = mockGqlClient({
      issueLabels: {
        nodes: [],
        pageInfo: { hasNextPage: false, endCursor: null },
      },
    });
    await listLabels(client);
    expect(client.request).toHaveBeenCalledWith(expect.anything(), {
      first: 50,
      after: undefined,
      filter: undefined,
    });
  });

  it("filters by team when teamId provided", async () => {
    const client = mockGqlClient({
      issueLabels: {
        nodes: [],
        pageInfo: { hasNextPage: false, endCursor: null },
      },
    });
    await listLabels(client, "team-1");
    expect(client.request).toHaveBeenCalledWith(expect.anything(), {
      first: 50,
      after: undefined,
      filter: { team: { id: { eq: "team-1" } } },
    });
  });

  it("converts null description to undefined", async () => {
    const client = mockGqlClient({
      issueLabels: {
        nodes: [
          { id: "lbl-2", name: "Feature", color: "#00ff00", description: null },
        ],
        pageInfo: { hasNextPage: false, endCursor: null },
      },
    });
    const result = await listLabels(client);
    expect(result.nodes[0].description).toBeUndefined();
  });
});
