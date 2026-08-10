import { describe, expect, it } from "vitest";
import { buildIssueFilter } from "../../../src/services/issue-filter.js";

describe("buildIssueFilter", () => {
  it("returns undefined when no options provided", () => {
    expect(buildIssueFilter({})).toBeUndefined();
  });

  it("builds team filter", () => {
    const result = buildIssueFilter({ teamId: "team-uuid" });
    expect(result).toEqual({
      and: [{ team: { id: { eq: "team-uuid" } } }],
    });
  });

  it("builds assignee filter", () => {
    const result = buildIssueFilter({ assigneeId: "user-uuid" });
    expect(result).toEqual({
      and: [{ assignee: { id: { eq: "user-uuid" } } }],
    });
  });

  it("builds creator filter", () => {
    const result = buildIssueFilter({ creatorId: "user-uuid" });
    expect(result).toEqual({
      and: [{ creator: { id: { eq: "user-uuid" } } }],
    });
  });

  it("builds project filter", () => {
    const result = buildIssueFilter({ projectId: "proj-uuid" });
    expect(result).toEqual({
      and: [{ project: { id: { eq: "proj-uuid" } } }],
    });
  });

  it("builds state filter with multiple IDs", () => {
    const result = buildIssueFilter({ stateIds: ["s1", "s2"] });
    expect(result).toEqual({
      and: [{ state: { id: { in: ["s1", "s2"] } } }],
    });
  });

  it("builds label filter with multiple IDs", () => {
    const result = buildIssueFilter({ labelIds: ["l1", "l2"] });
    expect(result).toEqual({
      and: [{ labels: { some: { id: { in: ["l1", "l2"] } } } }],
    });
  });

  it("builds cycle filter", () => {
    const result = buildIssueFilter({ cycleId: "cycle-uuid" });
    expect(result).toEqual({
      and: [{ cycle: { id: { eq: "cycle-uuid" } } }],
    });
  });

  it("builds parent filter", () => {
    const result = buildIssueFilter({ parentId: "parent-uuid" });
    expect(result).toEqual({
      and: [{ parent: { id: { eq: "parent-uuid" } } }],
    });
  });

  it("builds milestone filter", () => {
    const result = buildIssueFilter({ milestoneId: "ms-uuid" });
    expect(result).toEqual({
      and: [{ projectMilestone: { id: { eq: "ms-uuid" } } }],
    });
  });

  it("builds priority filter", () => {
    const result = buildIssueFilter({ priority: 2 });
    expect(result).toEqual({
      and: [{ priority: { eq: 2 } }],
    });
  });

  it("builds estimate filter", () => {
    const result = buildIssueFilter({ estimate: 5 });
    expect(result).toEqual({
      and: [{ estimate: { eq: 5 } }],
    });
  });

  it("builds due date before filter", () => {
    const result = buildIssueFilter({ dueBefore: "2025-12-31" });
    expect(result).toEqual({
      and: [{ dueDate: { lt: "2025-12-31" } }],
    });
  });

  it("builds due date after filter", () => {
    const result = buildIssueFilter({ dueAfter: "2025-01-01" });
    expect(result).toEqual({
      and: [{ dueDate: { gt: "2025-01-01" } }],
    });
  });

  it("builds combined due date range filter", () => {
    const result = buildIssueFilter({
      dueAfter: "2025-01-01",
      dueBefore: "2025-12-31",
    });
    expect(result).toEqual({
      and: [
        { dueDate: { gt: "2025-01-01" } },
        { dueDate: { lt: "2025-12-31" } },
      ],
    });
  });

  it("builds created date filters", () => {
    const result = buildIssueFilter({ createdAfter: "2025-01-01" });
    expect(result).toEqual({
      and: [{ createdAt: { gt: "2025-01-01" } }],
    });
  });

  it("builds completed date filters", () => {
    const result = buildIssueFilter({ completedBefore: "2025-06-01" });
    expect(result).toEqual({
      and: [{ completedAt: { lt: "2025-06-01" } }],
    });
  });

  it("builds updated date filters", () => {
    const result = buildIssueFilter({ updatedAfter: "2025-03-01" });
    expect(result).toEqual({
      and: [{ updatedAt: { gt: "2025-03-01" } }],
    });
  });

  it("builds has-blockers filter", () => {
    const result = buildIssueFilter({ hasBlockers: true });
    expect(result).toEqual({
      and: [{ hasBlockedByRelations: { eq: true } }],
    });
  });

  it("builds is-blocking filter", () => {
    const result = buildIssueFilter({ isBlocking: true });
    expect(result).toEqual({
      and: [{ hasBlockingRelations: { eq: true } }],
    });
  });

  it("builds has-blockers false filter", () => {
    const result = buildIssueFilter({ hasBlockers: false });
    expect(result).toEqual({
      and: [{ hasBlockedByRelations: { eq: false } }],
    });
  });

  it("builds is-blocking false filter", () => {
    const result = buildIssueFilter({ isBlocking: false });
    expect(result).toEqual({
      and: [{ hasBlockingRelations: { eq: false } }],
    });
  });

  it("ignores empty stateIds array", () => {
    const result = buildIssueFilter({ stateIds: [] });
    expect(result).toBeUndefined();
  });

  it("ignores empty labelIds array", () => {
    const result = buildIssueFilter({ labelIds: [] });
    expect(result).toBeUndefined();
  });

  it("combines multiple filters with and", () => {
    const result = buildIssueFilter({
      teamId: "team-uuid",
      priority: 1,
      hasBlockers: true,
    });
    expect(result).toEqual({
      and: [
        { team: { id: { eq: "team-uuid" } } },
        { priority: { eq: 1 } },
        { hasBlockedByRelations: { eq: true } },
      ],
    });
  });
});

describe("buildIssueFilter state, assignee and subscriber scoping", () => {
  it("maps --unassigned to a null assignee", () => {
    expect(buildIssueFilter({ unassigned: true })).toEqual({
      and: [{ assignee: { null: true } }],
    });
  });

  it("maps --state-type to the state category", () => {
    expect(buildIssueFilter({ stateType: "started" })).toEqual({
      and: [{ state: { type: { eq: "started" } } }],
    });
  });

  it("maps --subscriber to a subscribers.some clause", () => {
    expect(buildIssueFilter({ subscriberId: "user-1" })).toEqual({
      and: [{ subscribers: { some: { id: { eq: "user-1" } } } }],
    });
  });
});
