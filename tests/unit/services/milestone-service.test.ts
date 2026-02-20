// tests/unit/services/milestone-service.test.ts
import { describe, expect, it, vi } from "vitest";
import type { GraphQLClient } from "../../../src/client/graphql-client.js";
import {
  createMilestone,
  getMilestone,
  listMilestones,
  updateMilestone,
} from "../../../src/services/milestone-service.js";

function mockGqlClient(response: Record<string, unknown>): GraphQLClient {
  return {
    request: vi.fn().mockResolvedValue(response),
  } as unknown as GraphQLClient;
}

describe("listMilestones", () => {
  it("returns milestones", async () => {
    const client = mockGqlClient({
      project: {
        projectMilestones: {
          nodes: [
            {
              id: "ms-1",
              name: "v1.0",
              description: "First release",
              targetDate: "2025-06-01",
              sortOrder: 0,
            },
          ],
          pageInfo: { hasNextPage: false, endCursor: "c1" },
        },
      },
    });
    const result = await listMilestones(client, "proj-1");
    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0]).toEqual({
      id: "ms-1",
      name: "v1.0",
      description: "First release",
      targetDate: "2025-06-01",
      sortOrder: 0,
    });
    expect(result.pageInfo).toEqual({ hasNextPage: false, endCursor: "c1" });
  });

  it("returns empty when project is null", async () => {
    const client = mockGqlClient({ project: null });
    const result = await listMilestones(client, "missing-proj");
    expect(result.nodes).toEqual([]);
    expect(result.pageInfo).toEqual({ hasNextPage: false, endCursor: null });
  });

  it("passes after cursor", async () => {
    const client = mockGqlClient({
      project: {
        projectMilestones: {
          nodes: [],
          pageInfo: { hasNextPage: false, endCursor: null },
        },
      },
    });
    await listMilestones(client, "proj-1", { after: "cur1" });
    expect(client.request).toHaveBeenCalledWith(expect.anything(), {
      projectId: "proj-1",
      first: 50,
      after: "cur1",
    });
  });

  it("uses default limit of 50", async () => {
    const client = mockGqlClient({
      project: {
        projectMilestones: {
          nodes: [],
          pageInfo: { hasNextPage: false, endCursor: null },
        },
      },
    });
    await listMilestones(client, "proj-1");
    expect(client.request).toHaveBeenCalledWith(expect.anything(), {
      projectId: "proj-1",
      first: 50,
      after: undefined,
    });
  });
});

describe("getMilestone", () => {
  it("returns milestone detail", async () => {
    const client = mockGqlClient({
      projectMilestone: {
        id: "ms-1",
        name: "v1.0",
        description: "First release",
        targetDate: "2025-06-01",
        sortOrder: 0,
        project: { id: "proj-1", name: "Project Alpha" },
        issues: { nodes: [] },
      },
    });
    const result = await getMilestone(client, "ms-1");
    expect(result.id).toBe("ms-1");
    expect(result.name).toBe("v1.0");
  });

  it("throws when not found", async () => {
    const client = mockGqlClient({ projectMilestone: null });
    await expect(getMilestone(client, "missing-id")).rejects.toThrow(
      "not found",
    );
  });
});

describe("createMilestone", () => {
  it("creates milestone", async () => {
    const client = mockGqlClient({
      projectMilestoneCreate: {
        success: true,
        projectMilestone: {
          id: "ms-new",
          name: "v2.0",
          description: "Second release",
          targetDate: "2025-12-01",
          sortOrder: 1,
        },
      },
    });
    const result = await createMilestone(client, {
      projectId: "proj-1",
      name: "v2.0",
    });
    expect(result.id).toBe("ms-new");
    expect(result.name).toBe("v2.0");
  });

  it("throws on failure", async () => {
    const client = mockGqlClient({
      projectMilestoneCreate: {
        success: false,
        projectMilestone: null,
      },
    });
    await expect(
      createMilestone(client, { projectId: "proj-1", name: "Bad" }),
    ).rejects.toThrow("Failed to create milestone");
  });
});

describe("updateMilestone", () => {
  it("updates milestone", async () => {
    const client = mockGqlClient({
      projectMilestoneUpdate: {
        success: true,
        projectMilestone: {
          id: "ms-1",
          name: "v1.1",
          description: "Updated release",
          targetDate: "2025-07-01",
          sortOrder: 0,
        },
      },
    });
    const result = await updateMilestone(client, "ms-1", { name: "v1.1" });
    expect(result.id).toBe("ms-1");
    expect(result.name).toBe("v1.1");
  });

  it("throws on failure", async () => {
    const client = mockGqlClient({
      projectMilestoneUpdate: {
        success: false,
        projectMilestone: null,
      },
    });
    await expect(
      updateMilestone(client, "ms-1", { name: "Bad" }),
    ).rejects.toThrow("Failed to update milestone");
  });
});
