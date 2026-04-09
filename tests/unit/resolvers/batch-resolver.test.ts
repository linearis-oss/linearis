// tests/unit/resolvers/batch-resolver.test.ts
import { describe, expect, it, vi } from "vitest";
import type { GraphQLClient } from "../../../src/client/graphql-client.js";
import {
  batchResolveForCreate,
  batchResolveForUpdate,
} from "../../../src/resolvers/batch-resolver.js";

// Helper: make a mock that returns different responses per call (in order)
function mockGqlClient(
  ...responses: Array<Record<string, unknown>>
): GraphQLClient {
  const request = vi.fn();
  for (const r of responses) request.mockResolvedValueOnce(r);
  return { request } as unknown as GraphQLClient;
}

// label nodes for fetchLabelsByName (LabelsByNameDocument → { issueLabels: ... })
function labelResponse(
  nodes: Array<{
    id: string;
    name: string;
    isGroup: boolean;
    children: { nodes: { id: string; name: string }[] };
  }>,
) {
  return { issueLabels: { nodes } };
}

// --- extractLabelIds (tested via batchResolve* since it's not exported) ---

describe("extractLabelIds via batchResolveForCreate", () => {
  it("resolves a regular label by name (case-insensitive)", async () => {
    const gql = mockGqlClient(
      labelResponse([
        { id: "lbl-1", name: "Bug", isGroup: false, children: { nodes: [] } },
      ]),
    );
    const result = await batchResolveForCreate(gql, { labelNames: ["bug"] });
    expect(result.labelIds).toEqual(["lbl-1"]);
  });

  it("expands group label to its children", async () => {
    const gql = mockGqlClient(
      labelResponse([
        {
          id: "grp-1",
          name: "Type",
          isGroup: true,
          children: {
            nodes: [
              { id: "child-1", name: "Bug" },
              { id: "child-2", name: "Feature" },
            ],
          },
        },
      ]),
    );
    const result = await batchResolveForCreate(gql, { labelNames: ["Type"] });
    expect(result.labelIds).toEqual(["child-1", "child-2"]);
  });

  it("throws when label not found", async () => {
    const gql = mockGqlClient(labelResponse([]));
    await expect(
      batchResolveForCreate(gql, { labelNames: ["Nonexistent"] }),
    ).rejects.toThrow('Label "Nonexistent" not found');
  });
});

// --- batchResolveForCreate ---

describe("batchResolveForCreate", () => {
  it("returns empty result when all identifiers are UUIDs and no labels/parent", async () => {
    const gql = mockGqlClient();
    const result = await batchResolveForCreate(gql, {
      team: "550e8400-e29b-41d4-a716-446655440000",
      project: "660e8400-e29b-41d4-a716-446655440000",
    });
    expect(gql.request).not.toHaveBeenCalled();
    expect(result).toEqual({ projectMilestones: [] });
  });

  it("short-circuits when nothing to resolve", async () => {
    const gql = mockGqlClient();
    const result = await batchResolveForCreate(gql, {});
    expect(gql.request).not.toHaveBeenCalled();
    expect(result).toEqual({ projectMilestones: [] });
  });

  it("resolves team by name", async () => {
    const gql = mockGqlClient({ teams: { nodes: [{ id: "team-uuid" }] } });
    const result = await batchResolveForCreate(gql, { team: "Engineering" });
    expect(result.teamId).toBe("team-uuid");
  });

  it("throws when team not found", async () => {
    const gql = mockGqlClient({ teams: { nodes: [] } });
    await expect(batchResolveForCreate(gql, { team: "Ghost" })).rejects.toThrow(
      'Team "Ghost" not found',
    );
  });

  it("resolves project by name and includes milestones", async () => {
    const gql = mockGqlClient({
      projects: {
        nodes: [
          {
            id: "proj-1",
            projectMilestones: { nodes: [{ id: "ms-1", name: "v1.0" }] },
          },
        ],
      },
    });
    const result = await batchResolveForCreate(gql, { project: "MyProject" });
    expect(result.projectId).toBe("proj-1");
    expect(result.projectMilestones).toEqual([{ id: "ms-1", name: "v1.0" }]);
  });

  it("resolves parent issue by identifier", async () => {
    const gql = mockGqlClient({
      parentIssues: { nodes: [{ id: "issue-uuid" }] },
    });
    const result = await batchResolveForCreate(gql, { parentTicket: "ENG-42" });
    expect(result.parentId).toBe("issue-uuid");
  });

  it("throws when parent issue not found", async () => {
    const gql = mockGqlClient({ parentIssues: { nodes: [] } });
    await expect(
      batchResolveForCreate(gql, { parentTicket: "ENG-999" }),
    ).rejects.toThrow('Issue "ENG-999" not found');
  });
});

// --- batchResolveForUpdate ---

describe("batchResolveForUpdate", () => {
  it("returns empty result when nothing to resolve", async () => {
    const gql = mockGqlClient();
    const result = await batchResolveForUpdate(gql, {});
    expect(gql.request).not.toHaveBeenCalled();
    expect(result).toEqual({});
  });

  it("resolves labels for update", async () => {
    const gql = mockGqlClient(
      labelResponse([
        {
          id: "lbl-2",
          name: "Feature",
          isGroup: false,
          children: { nodes: [] },
        },
      ]),
    );
    const result = await batchResolveForUpdate(gql, {
      labelNames: ["Feature"],
    });
    expect(result.labelIds).toEqual(["lbl-2"]);
  });

  it("resolves project for update", async () => {
    const gql = mockGqlClient({
      projects: { nodes: [{ id: "proj-2", projectMilestones: { nodes: [] } }] },
    });
    const result = await batchResolveForUpdate(gql, { project: "Alpha" });
    expect(result.projectId).toBe("proj-2");
  });

  it("resolves milestone from project milestones first", async () => {
    const gql = mockGqlClient({
      projects: {
        nodes: [
          {
            id: "proj-3",
            projectMilestones: { nodes: [{ id: "ms-project", name: "Q1" }] },
          },
        ],
      },
      milestones: { nodes: [{ id: "ms-global", name: "Q1" }] },
    });
    const result = await batchResolveForUpdate(gql, {
      milestoneName: "Q1",
      project: "Alpha",
    });
    // project milestone takes priority
    expect(result.milestoneId).toBe("ms-project");
  });

  it("falls back to global milestone when project has none", async () => {
    const gql = mockGqlClient({
      milestones: { nodes: [{ id: "ms-global-2", name: "Q2" }] },
    });
    const result = await batchResolveForUpdate(gql, { milestoneName: "Q2" });
    expect(result.milestoneId).toBe("ms-global-2");
  });

  it("throws when milestone not found", async () => {
    const gql = mockGqlClient({ milestones: { nodes: [] } });
    await expect(
      batchResolveForUpdate(gql, { milestoneName: "Ghost" }),
    ).rejects.toThrow('Milestone "Ghost" not found');
  });

  it("populates issueContext when issue is found", async () => {
    const gql = mockGqlClient({
      issues: {
        nodes: [
          {
            id: "iss-1",
            labels: { nodes: [] },
            team: { id: "t-1", key: "ENG", name: "Engineering" },
            project: null,
          },
        ],
      },
    });
    const result = await batchResolveForUpdate(gql, {
      issueIdentifier: "ENG-5",
    });
    expect(result.issueContext?.id).toBe("iss-1");
    expect(result.issueContext?.team.key).toBe("ENG");
  });
});
