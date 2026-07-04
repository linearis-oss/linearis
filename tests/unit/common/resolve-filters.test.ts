import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GraphQLClient } from "../../../src/client/graphql-client.js";
import type { CommandContext } from "../../../src/common/context.js";
import { resolveFilterOptions } from "../../../src/common/resolve-filters.js";
import { resolveSearchFilterIds } from "../../../src/resolvers/issue-filter-resolver.js";
import { resolveMilestoneId } from "../../../src/resolvers/milestone-resolver.js";

vi.mock("../../../src/resolvers/issue-filter-resolver.js", () => ({
  resolveSearchFilterIds: vi.fn().mockResolvedValue({
    teamId: "team-uuid",
    assigneeId: "user-uuid",
    creatorId: "user-uuid",
    projectId: "project-uuid",
    stateIds: ["status-uuid"],
    labelIds: ["label-uuid-1", "label-uuid-2"],
    cycleId: "cycle-uuid",
    parentId: "issue-uuid",
  }),
}));

vi.mock("../../../src/resolvers/milestone-resolver.js", () => ({
  resolveMilestoneId: vi.fn().mockResolvedValue("milestone-uuid"),
}));

function mockContext(): CommandContext {
  return {
    gql: {} as unknown as GraphQLClient,
  };
}

describe("resolveFilterOptions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns empty options when no flags provided", async () => {
    const result = await resolveFilterOptions(mockContext(), {});

    expect(resolveSearchFilterIds).not.toHaveBeenCalled();
    expect(result).toEqual({
      milestoneId: undefined,
      priority: undefined,
      estimate: undefined,
      dueBefore: undefined,
      dueAfter: undefined,
      createdAfter: undefined,
      createdBefore: undefined,
      completedAfter: undefined,
      completedBefore: undefined,
      updatedAfter: undefined,
      updatedBefore: undefined,
      hasBlockers: undefined,
      isBlocking: undefined,
    });
  });

  it("calls resolveSearchFilterIds once after validation", async () => {
    const result = await resolveFilterOptions(mockContext(), {
      team: "ENG",
      assignee: "alice",
      creator: "bob",
      project: "Backend",
      status: "Todo",
      label: "Bug,Critical",
      cycle: "Sprint 1",
      parent: "ENG-123",
      milestone: "v1.0",
      priority: "2",
      estimate: "5",
    });

    expect(resolveSearchFilterIds).toHaveBeenCalledTimes(1);
    expect(resolveSearchFilterIds).toHaveBeenCalledWith(expect.anything(), {
      team: "ENG",
      assignee: "alice",
      creator: "bob",
      project: "Backend",
      statusNames: ["Todo"],
      labelNames: ["Bug", "Critical"],
      cycle: "Sprint 1",
      parent: "ENG-123",
    });
    expect(resolveMilestoneId).toHaveBeenCalledWith(
      expect.anything(),
      "v1.0",
      "Backend",
    );
    expect(result.teamId).toBe("team-uuid");
    expect(result.stateIds).toEqual(["status-uuid"]);
    expect(result.priority).toBe(2);
    expect(result.estimate).toBe(5);
  });

  it("throws on invalid priority string before network call", async () => {
    await expect(
      resolveFilterOptions(mockContext(), { priority: "abc" }),
    ).rejects.toThrow("--priority");
    expect(resolveSearchFilterIds).not.toHaveBeenCalled();
  });

  it("throws on invalid estimate string before network call", async () => {
    await expect(
      resolveFilterOptions(mockContext(), { estimate: "2abc" }),
    ).rejects.toThrow("--estimate");
    expect(resolveSearchFilterIds).not.toHaveBeenCalled();
  });

  it("throws when --status used without --team", async () => {
    await expect(
      resolveFilterOptions(mockContext(), { status: "In Progress" }),
    ).rejects.toThrow("--team");
    expect(resolveSearchFilterIds).not.toHaveBeenCalled();
  });

  it("allows status UUID without --team", async () => {
    await resolveFilterOptions(mockContext(), {
      status: "550e8400-e29b-41d4-a716-446655440000",
    });

    expect(resolveSearchFilterIds).toHaveBeenCalledWith(expect.anything(), {
      team: undefined,
      assignee: undefined,
      creator: undefined,
      project: undefined,
      statusNames: ["550e8400-e29b-41d4-a716-446655440000"],
      labelNames: undefined,
      cycle: undefined,
      parent: undefined,
    });
  });

  it("throws on malformed status list before making resolver calls", async () => {
    await expect(
      resolveFilterOptions(mockContext(), {
        team: "ENG",
        status: "Todo,,Done",
      }),
    ).rejects.toThrow("empty");
    expect(resolveSearchFilterIds).not.toHaveBeenCalled();
  });

  it("throws on malformed label list before making resolver calls", async () => {
    await expect(
      resolveFilterOptions(mockContext(), { label: "bug, ,ux" }),
    ).rejects.toThrow("empty");
    expect(resolveSearchFilterIds).not.toHaveBeenCalled();
  });

  it("throws when --cycle used without --team", async () => {
    await expect(
      resolveFilterOptions(mockContext(), { cycle: "Sprint 1" }),
    ).rejects.toThrow("--team");
    expect(resolveSearchFilterIds).not.toHaveBeenCalled();
  });

  it("allows cycle UUID without --team", async () => {
    await resolveFilterOptions(mockContext(), {
      cycle: "550e8400-e29b-41d4-a716-446655440001",
    });

    expect(resolveSearchFilterIds).toHaveBeenCalledWith(expect.anything(), {
      team: undefined,
      assignee: undefined,
      creator: undefined,
      project: undefined,
      statusNames: undefined,
      labelNames: undefined,
      cycle: "550e8400-e29b-41d4-a716-446655440001",
      parent: undefined,
    });
  });

  it("throws when --milestone used without --project", async () => {
    await expect(
      resolveFilterOptions(mockContext(), { milestone: "v1.0" }),
    ).rejects.toThrow("--project");
    expect(resolveSearchFilterIds).not.toHaveBeenCalled();
  });

  it("allows milestone UUID without --project", async () => {
    await resolveFilterOptions(mockContext(), {
      milestone: "550e8400-e29b-41d4-a716-446655440002",
    });

    expect(resolveSearchFilterIds).not.toHaveBeenCalled();
    expect(resolveMilestoneId).toHaveBeenCalledWith(
      expect.anything(),
      "550e8400-e29b-41d4-a716-446655440002",
      undefined,
    );
  });

  it("throws on contradictory date range before network call", async () => {
    await expect(
      resolveFilterOptions(mockContext(), {
        dueAfter: "2025-12-31",
        dueBefore: "2025-01-01",
      }),
    ).rejects.toThrow("due date");
    expect(resolveSearchFilterIds).not.toHaveBeenCalled();
  });

  it("throws on invalid due date format with flag-specific message", async () => {
    await expect(
      resolveFilterOptions(mockContext(), { dueBefore: "not-a-date" }),
    ).rejects.toThrow("--due-before");
    expect(resolveSearchFilterIds).not.toHaveBeenCalled();
  });
});
