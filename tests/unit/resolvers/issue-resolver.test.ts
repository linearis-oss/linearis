// tests/unit/resolvers/issue-resolver.test.ts
import { describe, expect, it, vi } from "vitest";
import type { LinearSdkClient } from "../../../src/client/linear-client.js";
import {
  resolveIssueEstimateContext,
  resolveIssueId,
} from "../../../src/resolvers/issue-resolver.js";

type IssueNode = {
  id?: string;
  teamId?: string;
  team?:
    | {
        id?: string;
        key?: string;
      }
    | Promise<{
        id?: string;
        key?: string;
      }>;
};

type TeamNode = {
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

function mockSdkClient(issueNodes: IssueNode[], teamNodes: TeamNode[] = []) {
  return {
    sdk: {
      issues: vi.fn().mockResolvedValue({ nodes: issueNodes }),
      teams: vi.fn().mockResolvedValue({ nodes: teamNodes }),
    },
  } as unknown as LinearSdkClient;
}

const teamId = "550e8400-e29b-41d4-a716-446655440001";

const exponentialTeam: TeamNode = {
  id: teamId,
  key: "ENG",
  name: "Engineering",
  issueEstimationType: "exponential",
  issueEstimationExtended: false,
  issueEstimationAllowZero: false,
};

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
  it("resolves identifier, extracts teamId, delegates to team estimate resolver, and returns issueId plus team context", async () => {
    const client = mockSdkClient(
      [{ id: "issue-uuid", teamId }],
      [exponentialTeam],
    );

    await expect(
      resolveIssueEstimateContext(client, "ENG-42"),
    ).resolves.toEqual({
      issueId: "issue-uuid",
      team: {
        teamId,
        teamKey: "ENG",
        teamName: "Engineering",
        issueEstimationType: "exponential",
        issueEstimationExtended: false,
        issueEstimationAllowZero: false,
      },
    });

    expect(client.sdk.issues).toHaveBeenCalledWith({
      filter: {
        number: { eq: 42 },
        team: { key: { eq: "ENG" } },
      },
      first: 1,
    });
    expect(client.sdk.teams).toHaveBeenCalledWith({
      filter: { id: { eq: teamId } },
      first: 1,
    });
  });

  it("resolves by UUID and uses sdk issues filter id eq", async () => {
    const client = mockSdkClient(
      [{ id: "issue-uuid", teamId }],
      [exponentialTeam],
    );

    await resolveIssueEstimateContext(
      client,
      "550e8400-e29b-41d4-a716-446655440000",
    );

    expect(client.sdk.issues).toHaveBeenCalledWith({
      filter: { id: { eq: "550e8400-e29b-41d4-a716-446655440000" } },
      first: 1,
    });
  });

  it("resolves identifier and uses sdk issues filter number plus team key", async () => {
    const client = mockSdkClient(
      [{ id: "issue-uuid", teamId }],
      [exponentialTeam],
    );

    await resolveIssueEstimateContext(client, "ENG-42");

    expect(client.sdk.issues).toHaveBeenCalledWith({
      filter: {
        number: { eq: 42 },
        team: { key: { eq: "ENG" } },
      },
      first: 1,
    });
  });

  it("succeeds when issue node has no nested team estimation fields", async () => {
    const client = mockSdkClient(
      [
        {
          id: "issue-uuid",
          team: {
            id: teamId,
            key: "ENG",
          },
        },
      ],
      [exponentialTeam],
    );

    await expect(
      resolveIssueEstimateContext(client, "ENG-42"),
    ).resolves.toMatchObject({
      issueId: "issue-uuid",
      team: {
        teamId,
        teamKey: "ENG",
      },
    });
  });

  it("falls back to async team relation id when teamId is absent", async () => {
    const client = mockSdkClient(
      [
        {
          id: "issue-uuid",
          team: Promise.resolve({ id: teamId, key: "ENG" }),
        },
      ],
      [exponentialTeam],
    );

    await expect(
      resolveIssueEstimateContext(client, "ENG-42"),
    ).resolves.toMatchObject({
      issueId: "issue-uuid",
      team: {
        teamId,
        teamKey: "ENG",
      },
    });

    expect(client.sdk.teams).toHaveBeenCalledWith({
      filter: { id: { eq: teamId } },
      first: 1,
    });
  });

  it("falls back to async team relation key when relation id is absent", async () => {
    const client = mockSdkClient(
      [
        {
          id: "issue-uuid",
          team: Promise.resolve({ key: "ENG" }),
        },
      ],
      [exponentialTeam],
    );

    await resolveIssueEstimateContext(client, "ENG-42");

    expect(client.sdk.teams).toHaveBeenCalledWith({
      filter: { key: { eq: "ENG" } },
      first: 1,
    });
  });

  it("throws Issue not found", async () => {
    const client = mockSdkClient([]);

    await expect(
      resolveIssueEstimateContext(client, "ENG-999"),
    ).rejects.toThrow('Issue "ENG-999" not found');
  });

  it("throws when issue team context is missing", async () => {
    const client = mockSdkClient([{ id: "issue-uuid" }]);

    await expect(resolveIssueEstimateContext(client, "ENG-42")).rejects.toThrow(
      'Issue "ENG-42" is missing required team context',
    );
  });

  it("preserves team-context error when issue projection is missing id", async () => {
    const client = mockSdkClient([{ teamId }]);

    await expect(resolveIssueEstimateContext(client, "ENG-42")).rejects.toThrow(
      'Issue "ENG-42" is missing required team context',
    );
  });
});
