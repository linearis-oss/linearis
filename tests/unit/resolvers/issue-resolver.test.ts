// tests/unit/resolvers/issue-resolver.test.ts
import { describe, expect, it, vi } from "vitest";
import type { LinearSdkClient } from "../../../src/client/linear-client.js";
import {
  resolveIssueEstimateContext,
  resolveIssueId,
} from "../../../src/resolvers/issue-resolver.js";

type IssueNode = {
  id: string;
  team?: {
    id: string;
    key: string;
    name: string;
    issueEstimationType:
      | "notUsed"
      | "exponential"
      | "fibonacci"
      | "linear"
      | "tShirt";
    issueEstimationExtended: boolean;
    issueEstimationAllowZero: boolean;
  };
};

function mockSdkClient(nodes: IssueNode[]) {
  return {
    sdk: {
      issues: vi.fn().mockResolvedValue({ nodes }),
    },
  } as unknown as LinearSdkClient;
}

describe("resolveIssueId", () => {
  it("returns UUID as-is", async () => {
    const client = mockSdkClient([]);
    const result = await resolveIssueId(
      client,
      "550e8400-e29b-41d4-a716-446655440000",
    );
    expect(result).toBe("550e8400-e29b-41d4-a716-446655440000");
  });

  it("resolves ABC-123 identifier", async () => {
    const client = mockSdkClient([{ id: "issue-uuid" }]);
    const result = await resolveIssueId(client, "ENG-42");
    expect(result).toBe("issue-uuid");
  });

  it("throws when issue not found", async () => {
    const client = mockSdkClient([]);
    await expect(resolveIssueId(client, "ENG-999")).rejects.toThrow(
      'Issue "ENG-999" not found',
    );
  });
});

describe("resolveIssueEstimateContext", () => {
  it("resolves by identifier with issueId + nested team estimate context fields", async () => {
    const client = mockSdkClient([
      {
        id: "issue-uuid",
        team: {
          id: "team-uuid",
          key: "ENG",
          name: "Engineering",
          issueEstimationType: "exponential",
          issueEstimationExtended: false,
          issueEstimationAllowZero: false,
        },
      },
    ]);

    await expect(
      resolveIssueEstimateContext(client, "ENG-42"),
    ).resolves.toEqual({
      issueId: "issue-uuid",
      team: {
        teamId: "team-uuid",
        teamKey: "ENG",
        teamName: "Engineering",
        issueEstimationType: "exponential",
        issueEstimationExtended: false,
        issueEstimationAllowZero: false,
      },
    });
  });

  it("resolves by UUID and verifies sdk issues filter id eq", async () => {
    const issues = vi.fn().mockResolvedValue({
      nodes: [
        {
          id: "issue-uuid",
          team: {
            id: "team-uuid",
            key: "OPS",
            name: "Operations",
            issueEstimationType: "linear",
            issueEstimationExtended: true,
            issueEstimationAllowZero: true,
          },
        },
      ],
    });

    const client = { sdk: { issues } } as unknown as LinearSdkClient;

    await resolveIssueEstimateContext(
      client,
      "550e8400-e29b-41d4-a716-446655440000",
    );

    expect(issues).toHaveBeenCalledWith({
      filter: { id: { eq: "550e8400-e29b-41d4-a716-446655440000" } },
      first: 1,
    });
  });

  it("throws Issue not found", async () => {
    const client = mockSdkClient([]);

    await expect(
      resolveIssueEstimateContext(client, "ENG-999"),
    ).rejects.toThrow('Issue "ENG-999" not found');
  });

  it("throws when issue team estimation context is missing", async () => {
    const issues = vi.fn().mockResolvedValue({
      nodes: [
        {
          id: "issue-uuid",
        },
      ],
    });

    const client = { sdk: { issues } } as unknown as LinearSdkClient;

    await expect(resolveIssueEstimateContext(client, "ENG-42")).rejects.toThrow(
      'Issue "ENG-42" is missing required team estimation context',
    );
  });
});
