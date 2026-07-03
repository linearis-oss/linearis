// tests/unit/services/team-service.test.ts

import { describe, expect, it, vi } from "vitest";
import type { GraphQLClient } from "../../../src/client/graphql-client.js";
import { asUuid } from "../../../src/common/identifier.js";
import {
  getTeam,
  listTeams,
  type TeamDetail,
  type TeamEstimateOption,
  type TeamEstimationSource,
} from "../../../src/services/team-service.js";

const assertTeamDetailShape = (value: TeamDetail): TeamDetail => value;
const assertEstimateOption = (value: TeamEstimateOption): TeamEstimateOption =>
  value;
const assertEstimationSource = (
  value: TeamEstimationSource,
): TeamEstimationSource => value;

void assertTeamDetailShape;
void assertEstimateOption;
void assertEstimationSource;

function mockGqlClient(response: Record<string, unknown>): GraphQLClient {
  return {
    request: vi.fn().mockResolvedValue(response),
  } as unknown as GraphQLClient;
}

function mockGqlClientWithSequence(
  responses: Array<Record<string, unknown>>,
): GraphQLClient {
  const request = vi.fn();
  for (const response of responses) {
    request.mockResolvedValueOnce(response);
  }
  return { request } as unknown as GraphQLClient;
}

describe("listTeams", () => {
  it("returns teams", async () => {
    const client = mockGqlClient({
      teams: {
        nodes: [{ id: "team-1", key: "ENG", name: "Engineering" }],
        pageInfo: { hasNextPage: false, endCursor: "c1" },
      },
    });
    const result = await listTeams(client);
    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0]?.id).toBe("team-1");
    expect(result.nodes[0]?.key).toBe("ENG");
    expect(result.nodes[0]?.name).toBe("Engineering");
    expect(result.pageInfo).toEqual({ hasNextPage: false, endCursor: "c1" });
  });

  it("returns empty result", async () => {
    const client = mockGqlClient({
      teams: {
        nodes: [],
        pageInfo: { hasNextPage: false, endCursor: null },
      },
    });
    const result = await listTeams(client);
    expect(result.nodes).toEqual([]);
    expect(result.pageInfo.hasNextPage).toBe(false);
  });

  it("passes after cursor", async () => {
    const client = mockGqlClient({
      teams: {
        nodes: [],
        pageInfo: { hasNextPage: false, endCursor: null },
      },
    });
    await listTeams(client, { after: "cur1" });
    expect(client.request).toHaveBeenCalledWith(expect.anything(), {
      first: 50,
      after: "cur1",
    });
  });

  it("uses default limit of 50", async () => {
    const client = mockGqlClient({
      teams: {
        nodes: [],
        pageInfo: { hasNextPage: false, endCursor: null },
      },
    });
    await listTeams(client);
    expect(client.request).toHaveBeenCalledWith(expect.anything(), {
      first: 50,
      after: undefined,
    });
  });
});

describe("getTeam", () => {
  it("returns detailed team with fibonacci estimates from self config", async () => {
    const client = mockGqlClientWithSequence([
      {
        team: {
          id: "team-1",
          key: "ENG",
          name: "Engineering",
          description: null,
          private: false,
          timezone: "UTC",
          color: "#fff",
          icon: "rocket",
          issueCount: 10,
          parent: null,
          issueEstimationType: "fibonacci",
          issueEstimationExtended: false,
          issueEstimationAllowZero: false,
          defaultIssueEstimate: null,
          inheritIssueEstimation: false,
          cyclesEnabled: true,
          cycleDuration: 2,
          cycleCooldownTime: 0,
          cycleStartDay: 1,
          upcomingCycleCount: 1,
          triageEnabled: false,
          requirePriorityToLeaveTriage: false,
          autoClosePeriod: null,
          autoArchivePeriod: null,
          autoCloseChildIssues: false,
          autoCloseParentIssues: false,
        },
      },
    ]);

    const result = assertTeamDetailShape(
      await getTeam(client, { id: asUuid("team-1") }),
    );

    expect(assertEstimationSource(result.estimationSource)).toBe("self");
    expect(result.validEstimates).toEqual([
      assertEstimateOption({ value: 1, label: "1" }),
      assertEstimateOption({ value: 2, label: "2" }),
      assertEstimateOption({ value: 3, label: "3" }),
      assertEstimateOption({ value: 5, label: "5" }),
      assertEstimateOption({ value: 8, label: "8" }),
    ]);
  });

  it("uses parent config when inheritIssueEstimation=true", async () => {
    const client = mockGqlClientWithSequence([
      {
        team: {
          id: "team-child",
          key: "CHILD",
          name: "Child Team",
          description: null,
          private: false,
          timezone: "UTC",
          color: "#fff",
          icon: "child",
          issueCount: 5,
          parent: { id: "team-parent", key: "PARENT", name: "Parent" },
          issueEstimationType: "linear",
          issueEstimationExtended: false,
          issueEstimationAllowZero: false,
          defaultIssueEstimate: null,
          inheritIssueEstimation: true,
          cyclesEnabled: false,
          cycleDuration: null,
          cycleCooldownTime: null,
          cycleStartDay: null,
          upcomingCycleCount: null,
          triageEnabled: false,
          requirePriorityToLeaveTriage: false,
          autoClosePeriod: null,
          autoArchivePeriod: null,
          autoCloseChildIssues: false,
          autoCloseParentIssues: false,
        },
      },
      {
        team: {
          id: "team-parent",
          key: "PARENT",
          name: "Parent",
          description: null,
          private: false,
          timezone: "UTC",
          color: "#000",
          icon: "parent",
          issueCount: 99,
          parent: null,
          issueEstimationType: "exponential",
          issueEstimationExtended: true,
          issueEstimationAllowZero: true,
          defaultIssueEstimate: null,
          inheritIssueEstimation: false,
          cyclesEnabled: false,
          cycleDuration: null,
          cycleCooldownTime: null,
          cycleStartDay: null,
          upcomingCycleCount: null,
          triageEnabled: false,
          requirePriorityToLeaveTriage: false,
          autoClosePeriod: null,
          autoArchivePeriod: null,
          autoCloseChildIssues: false,
          autoCloseParentIssues: false,
        },
      },
    ]);

    const result = assertTeamDetailShape(
      await getTeam(client, { id: asUuid("team-child") }),
    );

    expect(assertEstimationSource(result.estimationSource)).toBe("parent");
    expect(result.validEstimates).toEqual([
      assertEstimateOption({ value: 0, label: "0" }),
      assertEstimateOption({ value: 1, label: "1" }),
      assertEstimateOption({ value: 2, label: "2" }),
      assertEstimateOption({ value: 4, label: "4" }),
      assertEstimateOption({ value: 8, label: "8" }),
      assertEstimateOption({ value: 16, label: "16" }),
      assertEstimateOption({ value: 32, label: "32" }),
      assertEstimateOption({ value: 64, label: "64" }),
    ]);
  });

  it("returns empty estimates when estimation type is notUsed", async () => {
    const client = mockGqlClientWithSequence([
      {
        team: {
          id: "team-2",
          key: "OPS",
          name: "Operations",
          description: null,
          private: false,
          timezone: "UTC",
          color: "#ccc",
          icon: "ops",
          issueCount: 1,
          parent: null,
          issueEstimationType: "notUsed",
          issueEstimationExtended: false,
          issueEstimationAllowZero: true,
          defaultIssueEstimate: null,
          inheritIssueEstimation: false,
          cyclesEnabled: false,
          cycleDuration: null,
          cycleCooldownTime: null,
          cycleStartDay: null,
          upcomingCycleCount: null,
          triageEnabled: false,
          requirePriorityToLeaveTriage: false,
          autoClosePeriod: null,
          autoArchivePeriod: null,
          autoCloseChildIssues: false,
          autoCloseParentIssues: false,
        },
      },
    ]);

    const result = await getTeam(client, { id: asUuid("team-2") });
    expect(result.validEstimates).toEqual([]);
    expect(result.estimationSource).toBe("self");
  });

  it("returns empty estimates for unknown estimation type even when allowZero is true", async () => {
    const client = mockGqlClientWithSequence([
      {
        team: {
          id: "team-unknown",
          key: "QA",
          name: "Quality",
          description: null,
          private: false,
          timezone: "UTC",
          color: "#abc",
          icon: "bug",
          issueCount: 3,
          parent: null,
          issueEstimationType: "mystery",
          issueEstimationExtended: false,
          issueEstimationAllowZero: true,
          defaultIssueEstimate: null,
          inheritIssueEstimation: false,
          cyclesEnabled: false,
          cycleDuration: null,
          cycleCooldownTime: null,
          cycleStartDay: null,
          upcomingCycleCount: null,
          triageEnabled: false,
          requirePriorityToLeaveTriage: false,
          autoClosePeriod: null,
          autoArchivePeriod: null,
          autoCloseChildIssues: false,
          autoCloseParentIssues: false,
        },
      },
    ]);

    const result = await getTeam(client, { id: asUuid("team-unknown") });
    expect(result.validEstimates).toEqual([]);
    expect(result.estimationSource).toBe("self");
  });

  it("maps tShirt labels correctly", async () => {
    const client = mockGqlClientWithSequence([
      {
        team: {
          id: "team-3",
          key: "DES",
          name: "Design",
          description: null,
          private: false,
          timezone: "UTC",
          color: "#ddd",
          icon: "palette",
          issueCount: 2,
          parent: null,
          issueEstimationType: "tShirt",
          issueEstimationExtended: true,
          issueEstimationAllowZero: false,
          defaultIssueEstimate: null,
          inheritIssueEstimation: false,
          cyclesEnabled: false,
          cycleDuration: null,
          cycleCooldownTime: null,
          cycleStartDay: null,
          upcomingCycleCount: null,
          triageEnabled: false,
          requirePriorityToLeaveTriage: false,
          autoClosePeriod: null,
          autoArchivePeriod: null,
          autoCloseChildIssues: false,
          autoCloseParentIssues: false,
        },
      },
    ]);

    const result = await getTeam(client, { id: asUuid("team-3") });
    expect(result.validEstimates).toEqual([
      { value: 1, label: "XS" },
      { value: 2, label: "S" },
      { value: 3, label: "M" },
      { value: 5, label: "L" },
      { value: 8, label: "XL" },
      { value: 13, label: "XXL" },
      { value: 21, label: "XXXL" },
    ]);
  });

  it("falls back to self config when parent fetch fails", async () => {
    const client = {
      request: vi
        .fn()
        .mockResolvedValueOnce({
          team: {
            id: "team-child",
            key: "CHILD",
            name: "Child Team",
            description: null,
            private: false,
            timezone: "UTC",
            color: "#fff",
            icon: "child",
            issueCount: 5,
            parent: { id: "team-parent", key: "PARENT", name: "Parent" },
            issueEstimationType: "linear",
            issueEstimationExtended: true,
            issueEstimationAllowZero: false,
            defaultIssueEstimate: null,
            inheritIssueEstimation: true,
            cyclesEnabled: false,
            cycleDuration: null,
            cycleCooldownTime: null,
            cycleStartDay: null,
            upcomingCycleCount: null,
            triageEnabled: false,
            requirePriorityToLeaveTriage: false,
            autoClosePeriod: null,
            autoArchivePeriod: null,
            autoCloseChildIssues: false,
            autoCloseParentIssues: false,
          },
        })
        .mockRejectedValueOnce(new Error("parent lookup failed")),
    } as unknown as GraphQLClient;

    const result = await getTeam(client, { id: asUuid("team-child") });

    expect(result.estimationSource).toBe("self_fallback");
    expect(result.validEstimates).toEqual([
      { value: 1, label: "1" },
      { value: 2, label: "2" },
      { value: 3, label: "3" },
      { value: 4, label: "4" },
      { value: 5, label: "5" },
      { value: 6, label: "6" },
      { value: 7, label: "7" },
    ]);
  });
});
