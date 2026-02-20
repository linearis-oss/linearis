// tests/unit/services/project-service.test.ts
import { describe, expect, it, vi } from "vitest";
import type { GraphQLClient } from "../../../src/client/graphql-client.js";
import { listProjects } from "../../../src/services/project-service.js";

function mockGqlClient(response: Record<string, unknown>): GraphQLClient {
  return {
    request: vi.fn().mockResolvedValue(response),
  } as unknown as GraphQLClient;
}

describe("listProjects", () => {
  it("returns projects", async () => {
    const client = mockGqlClient({
      projects: {
        nodes: [
          {
            id: "proj-1",
            name: "Project Alpha",
            description: "A test project",
            state: "started",
            targetDate: "2025-12-31",
            slugId: "alpha",
          },
        ],
        pageInfo: { hasNextPage: false, endCursor: "c1" },
      },
    });
    const result = await listProjects(client);
    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0].id).toBe("proj-1");
    expect(result.nodes[0].name).toBe("Project Alpha");
    expect(result.nodes[0].state).toBe("started");
    expect(result.nodes[0].slugId).toBe("alpha");
    expect(result.pageInfo).toEqual({ hasNextPage: false, endCursor: "c1" });
  });

  it("returns empty result", async () => {
    const client = mockGqlClient({
      projects: {
        nodes: [],
        pageInfo: { hasNextPage: false, endCursor: null },
      },
    });
    const result = await listProjects(client);
    expect(result.nodes).toEqual([]);
    expect(result.pageInfo.hasNextPage).toBe(false);
  });

  it("passes after cursor", async () => {
    const client = mockGqlClient({
      projects: {
        nodes: [],
        pageInfo: { hasNextPage: false, endCursor: null },
      },
    });
    await listProjects(client, { after: "cur1" });
    expect(client.request).toHaveBeenCalledWith(expect.anything(), {
      first: 50,
      after: "cur1",
    });
  });

  it("uses default limit of 50", async () => {
    const client = mockGqlClient({
      projects: {
        nodes: [],
        pageInfo: { hasNextPage: false, endCursor: null },
      },
    });
    await listProjects(client);
    expect(client.request).toHaveBeenCalledWith(expect.anything(), {
      first: 50,
      after: undefined,
    });
  });

  it("converts null targetDate to undefined", async () => {
    const client = mockGqlClient({
      projects: {
        nodes: [
          {
            id: "proj-2",
            name: "No Date",
            description: "",
            state: "planned",
            targetDate: null,
            slugId: "no-date",
          },
        ],
        pageInfo: { hasNextPage: false, endCursor: null },
      },
    });
    const result = await listProjects(client);
    expect(result.nodes[0].targetDate).toBeUndefined();
  });
});
