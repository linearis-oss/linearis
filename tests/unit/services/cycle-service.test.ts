// tests/unit/services/cycle-service.test.ts
import { describe, expect, it, vi } from "vitest";
import type { GraphQLClient } from "../../../src/client/graphql-client.js";
import { getCycle, listCycles } from "../../../src/services/cycle-service.js";

function mockGqlClient(response: Record<string, unknown>): GraphQLClient {
  return {
    request: vi.fn().mockResolvedValue(response),
  } as unknown as GraphQLClient;
}

describe("listCycles", () => {
  it("returns cycles", async () => {
    const client = mockGqlClient({
      cycles: {
        nodes: [
          {
            id: "cyc-1",
            number: 1,
            name: "Sprint 1",
            startsAt: "2025-01-01",
            endsAt: "2025-01-14",
            isActive: true,
            isNext: false,
            isPrevious: false,
          },
        ],
        pageInfo: { hasNextPage: false, endCursor: "c1" },
      },
    });
    const result = await listCycles(client);
    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0].id).toBe("cyc-1");
    expect(result.nodes[0].number).toBe(1);
    expect(result.nodes[0].name).toBe("Sprint 1");
    expect(result.nodes[0].startsAt).toBe("2025-01-01");
    expect(result.nodes[0].endsAt).toBe("2025-01-14");
    expect(result.nodes[0].isActive).toBe(true);
    expect(result.pageInfo).toEqual({ hasNextPage: false, endCursor: "c1" });
  });

  it("returns empty result", async () => {
    const client = mockGqlClient({
      cycles: {
        nodes: [],
        pageInfo: { hasNextPage: false, endCursor: null },
      },
    });
    const result = await listCycles(client);
    expect(result.nodes).toEqual([]);
    expect(result.pageInfo.hasNextPage).toBe(false);
  });

  it("passes after cursor", async () => {
    const client = mockGqlClient({
      cycles: {
        nodes: [],
        pageInfo: { hasNextPage: false, endCursor: null },
      },
    });
    await listCycles(client, undefined, false, { after: "cur1" });
    expect(client.request).toHaveBeenCalledWith(expect.anything(), {
      first: 50,
      after: "cur1",
      filter: {},
    });
  });

  it("uses default limit of 50", async () => {
    const client = mockGqlClient({
      cycles: {
        nodes: [],
        pageInfo: { hasNextPage: false, endCursor: null },
      },
    });
    await listCycles(client);
    expect(client.request).toHaveBeenCalledWith(expect.anything(), {
      first: 50,
      after: undefined,
      filter: {},
    });
  });

  it("filters by team", async () => {
    const client = mockGqlClient({
      cycles: {
        nodes: [],
        pageInfo: { hasNextPage: false, endCursor: null },
      },
    });
    await listCycles(client, "team-1");
    expect(client.request).toHaveBeenCalledWith(expect.anything(), {
      first: 50,
      after: undefined,
      filter: { team: { id: { eq: "team-1" } } },
    });
  });

  it("filters active only", async () => {
    const client = mockGqlClient({
      cycles: {
        nodes: [],
        pageInfo: { hasNextPage: false, endCursor: null },
      },
    });
    await listCycles(client, undefined, true);
    expect(client.request).toHaveBeenCalledWith(expect.anything(), {
      first: 50,
      after: undefined,
      filter: { isActive: { eq: true } },
    });
  });

  it("uses fallback name for null name", async () => {
    const client = mockGqlClient({
      cycles: {
        nodes: [
          {
            id: "cyc-2",
            number: 3,
            name: null,
            startsAt: "2025-02-01",
            endsAt: "2025-02-14",
            isActive: false,
            isNext: false,
            isPrevious: false,
          },
        ],
        pageInfo: { hasNextPage: false, endCursor: null },
      },
    });
    const result = await listCycles(client);
    expect(result.nodes[0].name).toBe("Cycle 3");
  });
});

describe("getCycle", () => {
  it("returns cycle with issues", async () => {
    const client = mockGqlClient({
      cycle: {
        id: "cyc-1",
        number: 1,
        name: "Sprint 1",
        startsAt: "2025-01-01",
        endsAt: "2025-01-14",
        isActive: true,
        isNext: false,
        isPrevious: false,
        issues: {
          nodes: [
            {
              id: "issue-1",
              identifier: "ENG-1",
              title: "Fix bug",
              state: { name: "In Progress" },
            },
          ],
        },
      },
    });
    const result = await getCycle(client, "cyc-1");
    expect(result.id).toBe("cyc-1");
    expect(result.name).toBe("Sprint 1");
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].identifier).toBe("ENG-1");
    expect(result.issues[0].state.name).toBe("In Progress");
  });

  it("throws when cycle not found", async () => {
    const client = mockGqlClient({ cycle: null });
    await expect(getCycle(client, "missing-id")).rejects.toThrow("not found");
  });
});
