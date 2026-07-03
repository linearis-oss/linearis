import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GraphQLClient } from "../../../src/client/graphql-client.js";
import { resolveSearchFilterIds } from "../../../src/resolvers/issue-filter-resolver.js";

const { resolveStatusIdMock, resolveCycleIdMock } = vi.hoisted(() => ({
  resolveStatusIdMock: vi.fn(),
  resolveCycleIdMock: vi.fn(),
}));

vi.mock("../../../src/resolvers/status-resolver.js", () => ({
  resolveStatusId: resolveStatusIdMock,
}));

vi.mock("../../../src/resolvers/cycle-resolver.js", () => ({
  resolveCycleId: resolveCycleIdMock,
}));

type BatchNodes = {
  teams?: Array<{ id: string; key: string; name: string }>;
  assignees?: Array<{
    id: string;
    name: string;
    email: string;
    displayName: string;
  }>;
  creators?: Array<{
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

function mockGql(nodes: BatchNodes) {
  const request = vi.fn().mockResolvedValue({
    teams: { nodes: nodes.teams ?? [] },
    assignees: { nodes: nodes.assignees ?? [] },
    creators: { nodes: nodes.creators ?? [] },
    projects: {
      nodes: (nodes.projects ?? []).map((p) => ({
        ...p,
        projectMilestones: { nodes: p.projectMilestones ?? [] },
      })),
    },
    labels: { nodes: nodes.labels ?? [] },
    statuses: { nodes: nodes.statuses ?? [] },
    cycles: { nodes: nodes.cycles ?? [] },
    parentIssues: { nodes: nodes.parentIssues ?? [] },
  });
  return { client: { request } as unknown as GraphQLClient, request };
}

describe("resolveSearchFilterIds", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("resolves all filters in a single batch request", async () => {
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
      projects: [{ id: "project-uuid", name: "Q1" }],
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

    const result = await resolveSearchFilterIds(client, {
      team: "ENG",
      assignee: "John Doe",
      project: "Q1",
      // "bug" lower-case must still match "Bug" (case-insensitive).
      labelNames: ["bug"],
      statusNames: ["Todo"],
      cycle: "Sprint 1",
      parent: "ENG-1",
    });

    expect(request).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      teamId: "team-uuid",
      assigneeId: "user-uuid",
      projectId: "project-uuid",
      labelIds: ["label-uuid"],
      stateIds: ["state-uuid"],
      cycleId: "cycle-uuid",
      parentId: "parent-uuid",
    });
    // Status matched from the batch response — no per-status fallback call.
    expect(resolveStatusIdMock).not.toHaveBeenCalled();
  });

  it("falls back to global status resolution when a name is not team-scoped", async () => {
    const { client } = mockGql({}); // no statuses returned (e.g. no team)
    resolveStatusIdMock.mockResolvedValue("global-state-uuid");

    const result = await resolveSearchFilterIds(client, {
      statusNames: ["In Progress"],
    });

    expect(resolveStatusIdMock).toHaveBeenCalledWith(
      client,
      "In Progress",
      undefined,
    );
    expect(result).toEqual({ stateIds: ["global-state-uuid"] });
  });

  it("falls back to global cycle resolution when no cycles are team-scoped", async () => {
    const { client } = mockGql({}); // no cycles returned (e.g. no team)
    resolveCycleIdMock.mockResolvedValue("global-cycle-uuid");

    const result = await resolveSearchFilterIds(client, {
      cycle: "Sprint 1",
    });

    expect(resolveCycleIdMock).toHaveBeenCalledWith(
      client,
      "Sprint 1",
      undefined,
    );
    expect(result).toEqual({ cycleId: "global-cycle-uuid" });
  });

  it("throws when the team cannot be resolved", async () => {
    const { client } = mockGql({ teams: [] });

    await expect(
      resolveSearchFilterIds(client, { team: "Nope" }),
    ).rejects.toThrow('Team "Nope" not found');
  });

  it("passes UUID inputs through without matching against the response", async () => {
    const { client, request } = mockGql({});

    const result = await resolveSearchFilterIds(client, {
      assignee: "550e8400-e29b-41d4-a716-446655440000",
    });

    expect(request).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      assigneeId: "550e8400-e29b-41d4-a716-446655440000",
    });
  });
});
