// tests/unit/resolvers/milestone-resolver.test.ts
import { describe, expect, it, vi } from "vitest";
import type { GraphQLClient } from "../../../src/client/graphql-client.js";
import { resolveMilestoneId } from "../../../src/resolvers/milestone-resolver.js";

function mockGqlClient(...responses: Array<Record<string, unknown>>) {
  const request = vi.fn();
  for (const r of responses) {
    request.mockResolvedValueOnce(r);
  }
  return { request } as unknown as GraphQLClient;
}

describe("resolveMilestoneId", () => {
  it("returns UUID as-is", async () => {
    const gql = mockGqlClient();
    const result = await resolveMilestoneId(
      gql,
      "550e8400-e29b-41d4-a716-446655440000",
    );
    expect(result).toBe("550e8400-e29b-41d4-a716-446655440000");
    expect(gql.request).not.toHaveBeenCalled();
  });

  it("resolves a project-scoped milestone by name", async () => {
    const gql = mockGqlClient(
      { projects: { nodes: [{ id: "proj-uuid" }] } },
      {
        project: {
          projectMilestones: { nodes: [{ id: "ms-uuid", name: "M1" }] },
        },
      },
    );
    const result = await resolveMilestoneId(gql, "M1", "My Project");
    expect(result).toBe("ms-uuid");
  });

  it("throws when milestone not found", async () => {
    const gql = mockGqlClient(
      { projects: { nodes: [{ id: "proj-uuid" }] } },
      { project: { projectMilestones: { nodes: [] } } },
    );
    await expect(
      resolveMilestoneId(gql, "Nonexistent", "My Project"),
    ).rejects.toThrow(
      'Milestone "Nonexistent" in project "My Project" not found',
    );
  });

  it("does not fall back to the workspace when scoped to a project", async () => {
    const gql = mockGqlClient(
      { projects: { nodes: [{ id: "proj-uuid" }] } },
      { project: { projectMilestones: { nodes: [] } } },
      { projectMilestones: { nodes: [{ id: "other-uuid", name: "Launch" }] } },
    );
    await expect(
      resolveMilestoneId(gql, "Launch", "My Project"),
    ).rejects.toThrow('Milestone "Launch" in project "My Project" not found');
    expect(gql.request).toHaveBeenCalledTimes(2);
  });

  it("searches the workspace when no project scope is given", async () => {
    const gql = mockGqlClient({
      projectMilestones: { nodes: [{ id: "ms-uuid", name: "Launch" }] },
    });
    expect(await resolveMilestoneId(gql, "Launch")).toBe("ms-uuid");
  });
});
