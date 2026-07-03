import { describe, expect, it, vi } from "vitest";
import type { GraphQLClient } from "../../../src/client/graphql-client.js";
import {
  resolveCreateIssueIds,
  resolveUpdateIssueIds,
} from "../../../src/resolvers/issue-mutation-resolver.js";

const UUID = "550e8400-e29b-41d4-a716-446655440000";

type Nodes = {
  teams?: Array<{
    id: string;
    key: string;
    name: string;
    issueEstimationType?: string;
    issueEstimationExtended?: boolean;
    issueEstimationAllowZero?: boolean;
  }>;
  assignees?: Array<{
    id: string;
    name: string;
    email: string;
    displayName: string;
  }>;
  projects?: Array<{
    id: string;
    name: string;
    projectMilestones?: Array<{ id: string; name: string }>;
  }>;
  labels?: Array<{ id: string; name: string }>;
  statuses?: Array<{
    id: string;
    name: string;
    team: { id: string; key: string };
  }>;
  cycles?: Array<{
    id: string;
    name: string | null;
    isActive: boolean;
    isNext: boolean;
    isPrevious: boolean;
    number: number;
    startsAt: string;
    team: { id: string; key: string };
  }>;
  parentIssues?: Array<{ id: string; identifier: string }>;
};

function buildResponse(nodes: Nodes) {
  return {
    teams: {
      nodes: (nodes.teams ?? []).map((t) => ({
        issueEstimationType: "fibonacci",
        issueEstimationExtended: false,
        issueEstimationAllowZero: false,
        ...t,
      })),
    },
    assignees: { nodes: nodes.assignees ?? [] },
    projects: {
      nodes: (nodes.projects ?? []).map((p) => ({
        id: p.id,
        name: p.name,
        projectMilestones: { nodes: p.projectMilestones ?? [] },
      })),
    },
    labels: { nodes: nodes.labels ?? [] },
    statuses: { nodes: nodes.statuses ?? [] },
    cycles: { nodes: nodes.cycles ?? [] },
    parentIssues: { nodes: nodes.parentIssues ?? [] },
  };
}

function mockGql(nodes: Nodes) {
  const request = vi.fn().mockResolvedValue(buildResponse(nodes));
  return { client: { request } as unknown as GraphQLClient, request };
}

describe("resolveCreateIssueIds", () => {
  it("resolves every reference in a single batch request", async () => {
    const { client, request } = mockGql({
      teams: [{ id: "team-uuid", key: "ENG", name: "Engineering" }],
      assignees: [
        {
          id: "user-uuid",
          name: "John",
          email: "john@example.com",
          displayName: "John Doe",
        },
      ],
      projects: [
        {
          id: "project-uuid",
          name: "Q1",
          projectMilestones: [{ id: "ms-uuid", name: "M1" }],
        },
      ],
      labels: [{ id: "label-uuid", name: "Bug" }],
      statuses: [
        {
          id: "state-uuid",
          name: "Todo",
          team: { id: "team-uuid", key: "ENG" },
        },
      ],
      cycles: [
        {
          id: "cycle-uuid",
          name: "Sprint 1",
          isActive: true,
          isNext: false,
          isPrevious: false,
          number: 1,
          startsAt: "2026-01-01T00:00:00.000Z",
          team: { id: "team-uuid", key: "ENG" },
        },
      ],
      parentIssues: [{ id: "parent-uuid", identifier: "ENG-1" }],
    });

    const result = await resolveCreateIssueIds(client, {
      team: "ENG",
      assignee: "John Doe",
      project: "Q1",
      labels: ["bug"], // lower-case must match "Bug"
      projectMilestone: "M1",
      cycle: "Sprint 1",
      status: "Todo",
      parentTicket: "ENG-1",
    });

    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        teamKey: "ENG",
        teamName: "ENG",
        assigneeQuery: "John Doe",
        labelFilter: { or: [{ name: { eqIgnoreCase: "bug" } }] },
        statusName: "Todo",
        cycleName: "Sprint 1",
        milestoneName: "M1",
        parentTeamKey: "ENG",
        parentIssueNumber: 1,
      }),
    );
    expect(result).toEqual({
      teamId: "team-uuid",
      assigneeId: "user-uuid",
      projectId: "project-uuid",
      labelIds: ["label-uuid"],
      projectMilestoneId: "ms-uuid",
      cycleId: "cycle-uuid",
      stateId: "state-uuid",
      parentId: "parent-uuid",
    });
  });

  it("passes UUID inputs through without name lookups", async () => {
    const { client, request } = mockGql({});

    const result = await resolveCreateIssueIds(client, {
      team: UUID,
      assignee: UUID,
      project: UUID,
      status: UUID,
      parentTicket: UUID,
    });

    expect(request).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        teamKey: null,
        teamName: null,
        teamId: UUID,
        assigneeQuery: null,
        projectName: null,
        projectId: UUID,
        statusName: null,
        parentTeamKey: null,
        parentIssueNumber: null,
      }),
    );
    expect(result).toEqual({
      teamId: UUID,
      assigneeId: UUID,
      projectId: UUID,
      stateId: UUID,
      parentId: UUID,
    });
  });

  it("prefers a display-name match over an email match", async () => {
    const { client } = mockGql({
      teams: [{ id: "team-uuid", key: "ENG", name: "Engineering" }],
      assignees: [
        {
          id: "by-name",
          name: "John",
          email: "someone@else.com",
          displayName: "John Doe",
        },
        {
          id: "by-email",
          name: "Other",
          email: "john doe",
          displayName: "Other Person",
        },
      ],
    });

    const result = await resolveCreateIssueIds(client, {
      team: "ENG",
      assignee: "John Doe",
    });

    expect(result.assigneeId).toBe("by-name");
  });

  it("throws when multiple users match by display name", async () => {
    const { client } = mockGql({
      teams: [{ id: "team-uuid", key: "ENG", name: "Engineering" }],
      assignees: [
        {
          id: "u1",
          name: "Alex A",
          email: "a1@example.com",
          displayName: "Alex",
        },
        {
          id: "u2",
          name: "Alex B",
          email: "a2@example.com",
          displayName: "Alex",
        },
      ],
    });

    await expect(
      resolveCreateIssueIds(client, { team: "ENG", assignee: "Alex" }),
    ).rejects.toThrow('Multiple Users found matching "Alex"');
  });

  it("falls back to email when no display name matches", async () => {
    const { client } = mockGql({
      teams: [{ id: "team-uuid", key: "ENG", name: "Engineering" }],
      assignees: [
        {
          id: "u2",
          name: "Jane",
          email: "jane@example.com",
          displayName: "Jane Roe",
        },
      ],
    });

    const result = await resolveCreateIssueIds(client, {
      team: "ENG",
      assignee: "jane@example.com",
    });

    expect(result.assigneeId).toBe("u2");
  });

  it("throws when an assignee cannot be found", async () => {
    const { client } = mockGql({
      teams: [{ id: "team-uuid", key: "ENG", name: "Engineering" }],
    });

    await expect(
      resolveCreateIssueIds(client, { team: "ENG", assignee: "ghost" }),
    ).rejects.toThrow('User "ghost" not found');
  });

  it("throws when the team cannot be resolved", async () => {
    const { client } = mockGql({ teams: [] });

    await expect(
      resolveCreateIssueIds(client, { team: "NOPE" }),
    ).rejects.toThrow('Team "NOPE" not found');
  });

  it("returns estimate context from the same request when requested", async () => {
    const { client, request } = mockGql({
      teams: [
        {
          id: "team-uuid",
          key: "ENG",
          name: "Engineering",
          issueEstimationType: "fibonacci",
          issueEstimationExtended: true,
          issueEstimationAllowZero: true,
        },
      ],
    });

    const result = await resolveCreateIssueIds(client, {
      team: "ENG",
      withEstimateContext: true,
    });

    expect(request).toHaveBeenCalledTimes(1);
    expect(result.estimateContext).toEqual({
      teamId: "team-uuid",
      teamKey: "ENG",
      teamName: "Engineering",
      issueEstimationType: "fibonacci",
      issueEstimationExtended: true,
      issueEstimationAllowZero: true,
    });
  });

  it("throws when a project is not found", async () => {
    const { client } = mockGql({
      teams: [{ id: "team-uuid", key: "ENG", name: "Engineering" }],
      projects: [],
    });

    await expect(
      resolveCreateIssueIds(client, { team: "ENG", project: "Ghost" }),
    ).rejects.toThrow('Project "Ghost" not found');
  });

  it("scopes milestone resolution to the matched project", async () => {
    const { client } = mockGql({
      teams: [{ id: "team-uuid", key: "ENG", name: "Engineering" }],
      projects: [{ id: "project-uuid", name: "Q1", projectMilestones: [] }],
    });

    await expect(
      resolveCreateIssueIds(client, {
        team: "ENG",
        project: "Q1",
        projectMilestone: "Ghost",
      }),
    ).rejects.toThrow('Milestone "Ghost" not found');
  });
});

describe("resolveUpdateIssueIds", () => {
  it("resolves references in a single request scoped by issue context", async () => {
    const { client, request } = mockGql({
      assignees: [
        {
          id: "user-uuid",
          name: "Jane",
          email: "jane@example.com",
          displayName: "Jane Roe",
        },
      ],
      statuses: [
        {
          id: "state-uuid",
          name: "Done",
          team: { id: "team-uuid", key: "ENG" },
        },
      ],
    });

    const result = await resolveUpdateIssueIds(
      client,
      { assignee: "Jane Roe", status: "Done" },
      { teamId: "team-uuid" as never, teamKey: "ENG" },
    );

    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        assigneeQuery: "Jane Roe",
        statusName: "Done",
        teamKey: "ENG",
        teamId: "team-uuid",
      }),
    );
    expect(result).toEqual({
      assigneeId: "user-uuid",
      stateId: "state-uuid",
    });
  });

  it("parses a parent identifier into filter variables", async () => {
    const { client, request } = mockGql({
      parentIssues: [{ id: "parent-uuid", identifier: "ENG-7" }],
    });

    const result = await resolveUpdateIssueIds(
      client,
      { parentTicket: "ENG-7" },
      {},
    );

    expect(request).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        parentTeamKey: "ENG",
        parentIssueNumber: 7,
      }),
    );
    expect(result.parentId).toBe("parent-uuid");
  });

  it("passes UUID inputs through", async () => {
    const { client } = mockGql({});

    const result = await resolveUpdateIssueIds(
      client,
      { assignee: UUID, project: UUID },
      {},
    );

    expect(result).toEqual({ assigneeId: UUID, projectId: UUID });
  });
});
