import { describe, expect, it, vi } from "vitest";
import type { GraphQLClient } from "../../../src/client/graphql-client.js";
import {
  resolveIssueCreateRefs,
  resolveIssueUpdateRefs,
} from "../../../src/resolvers/issue-batch-resolver.js";

function makeClient(response: unknown): GraphQLClient {
  return {
    request: vi.fn().mockResolvedValue(response),
  } as unknown as GraphQLClient;
}

describe("resolveIssueCreateRefs", () => {
  it("resolves team, project, labels, parent, and milestone in one batch", async () => {
    const client = makeClient({
      teams: { nodes: [{ id: "team-1", key: "ENG", name: "Engineering" }] },
      projects: {
        nodes: [
          {
            id: "project-1",
            name: "Platform",
            projectMilestones: { nodes: [{ id: "ms-1", name: "Q2" }] },
          },
        ],
      },
      labels: {
        nodes: [
          {
            id: "label-1",
            name: "bug",
            isGroup: false,
            parent: null,
            children: { nodes: [] },
          },
          {
            id: "label-2",
            name: "backend",
            isGroup: false,
            parent: null,
            children: { nodes: [] },
          },
        ],
      },
      parentIssues: { nodes: [{ id: "issue-1", identifier: "ENG-42" }] },
    });

    const result = await resolveIssueCreateRefs(client, {
      team: "ENG",
      project: "Platform",
      labels: ["bug", "backend"],
      parentTicket: "ENG-42",
      projectMilestone: "Q2",
    });

    expect(result).toEqual({
      teamId: "team-1",
      projectId: "project-1",
      labelIds: ["label-1", "label-2"],
      parentId: "issue-1",
      projectMilestoneId: "ms-1",
    });
    expect(client.request).toHaveBeenCalledTimes(1);
  });

  it("passes UUID inputs through without lookup-dependent failures", async () => {
    const client = makeClient({
      teams: { nodes: [] },
      projects: { nodes: [] },
      labels: { nodes: [] },
      parentIssues: { nodes: [] },
    });

    const result = await resolveIssueCreateRefs(client, {
      team: "123e4567-e89b-12d3-a456-426614174000",
      project: "123e4567-e89b-12d3-a456-426614174001",
      labels: ["123e4567-e89b-12d3-a456-426614174002"],
      parentTicket: "123e4567-e89b-12d3-a456-426614174003",
      projectMilestone: "123e4567-e89b-12d3-a456-426614174004",
    });

    expect(result).toEqual({
      teamId: "123e4567-e89b-12d3-a456-426614174000",
      projectId: "123e4567-e89b-12d3-a456-426614174001",
      labelIds: ["123e4567-e89b-12d3-a456-426614174002"],
      parentId: "123e4567-e89b-12d3-a456-426614174003",
      projectMilestoneId: "123e4567-e89b-12d3-a456-426614174004",
    });
  });

  it("throws notFoundError-style error when team missing", async () => {
    const client = makeClient({
      teams: { nodes: [] },
      projects: { nodes: [] },
      labels: { nodes: [] },
      parentIssues: { nodes: [] },
    });

    await expect(
      resolveIssueCreateRefs(client, { team: "NOPE" }),
    ).rejects.toThrow('Team "NOPE" not found');
  });
});

describe("resolveIssueUpdateRefs", () => {
  it("resolves project, labels, parent, milestone, and current labels for add mode", async () => {
    const client = makeClient({
      labels: {
        nodes: [
          {
            id: "label-2",
            name: "backend",
            isGroup: false,
            parent: null,
            children: { nodes: [] },
          },
        ],
      },
      projects: {
        nodes: [
          {
            id: "project-2",
            name: "Platform",
            projectMilestones: { nodes: [{ id: "ms-2", name: "Q3" }] },
          },
        ],
      },
      milestones: { nodes: [] },
      issues: {
        nodes: [
          {
            id: "issue-2",
            identifier: "ENG-99",
            labels: { nodes: [{ id: "label-1", name: "bug" }] },
            team: { id: "team-1", key: "ENG", name: "Engineering" },
            project: {
              id: "project-1",
              projectMilestones: { nodes: [{ id: "ms-old", name: "Q1" }] },
            },
          },
        ],
      },
    });

    const result = await resolveIssueUpdateRefs(client, {
      project: "Platform",
      labels: ["backend"],
      labelMode: "add",
      parentTicket: "ENG-99",
      projectMilestone: "Q3",
      issueContext: {
        team: { id: "team-1", key: "ENG", name: "Engineering" },
        project: { id: "project-1", name: "Legacy" },
        labels: { nodes: [{ id: "label-1", name: "bug" }] },
      },
    });

    expect(result).toEqual({
      projectId: "project-2",
      labelIds: ["label-2"],
      currentLabelIds: ["label-1"],
      parentId: "issue-2",
      projectMilestoneId: "ms-2",
    });
  });

  it("prefers new project when resolving update milestone", async () => {
    const client = makeClient({
      labels: { nodes: [] },
      projects: {
        nodes: [
          {
            id: "project-2",
            name: "Platform",
            projectMilestones: { nodes: [{ id: "ms-2", name: "Q3" }] },
          },
        ],
      },
      milestones: { nodes: [{ id: "ms-global", name: "Q3" }] },
      issues: { nodes: [] },
    });

    const result = await resolveIssueUpdateRefs(client, {
      project: "Platform",
      projectMilestone: "Q3",
      issueContext: {
        team: { id: "team-1", key: "ENG", name: "Engineering" },
        project: { id: "project-1", name: "Legacy" },
        labels: { nodes: [] },
      },
    });

    expect(result.projectMilestoneId).toBe("ms-2");
  });

  it("throws clear error when milestone has no project context on update", async () => {
    const client = makeClient({
      labels: { nodes: [] },
      projects: { nodes: [] },
      milestones: { nodes: [] },
      issues: { nodes: [] },
    });

    await expect(
      resolveIssueUpdateRefs(client, { projectMilestone: "Q3" }),
    ).rejects.toThrow("--project-milestone requires project context");
  });
});
