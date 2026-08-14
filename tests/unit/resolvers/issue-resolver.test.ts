// tests/unit/resolvers/issue-resolver.test.ts
import { describe, expect, it, vi } from "vitest";
import type { GraphQLClient } from "../../../src/client/graphql-client.js";
import {
  resolveIssueEstimateContext,
  resolveIssueId,
  resolveIssueRefs,
} from "../../../src/resolvers/issue-resolver.js";

type IssueNode = {
  id: string;
  team: { id: string; key: string };
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

// The estimate-context resolver issues two requests: FindIssues, then FindTeams
// (via resolveTeamEstimateContext). resolveIssueId only issues the first.
function mockGqlClient(issueNodes: IssueNode[], teamNodes: TeamNode[] = []) {
  const request = vi
    .fn()
    .mockResolvedValueOnce({ issues: { nodes: issueNodes } })
    .mockResolvedValueOnce({ teams: { nodes: teamNodes } });
  return { request } as unknown as GraphQLClient;
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

const engIssue: IssueNode = {
  id: "issue-uuid",
  team: { id: teamId, key: "ENG" },
};

describe("resolveIssueId", () => {
  it("returns UUID as-is", async () => {
    const client = mockGqlClient([]);
    const result = await resolveIssueId(
      client,
      "550e8400-e29b-41d4-a716-446655440000",
    );
    expect(result).toBe("550e8400-e29b-41d4-a716-446655440000");
    expect(client.request).not.toHaveBeenCalled();
  });

  it("resolves ABC-123 identifier", async () => {
    const client = mockGqlClient([engIssue]);
    const result = await resolveIssueId(client, "ENG-42");
    expect(result).toBe("issue-uuid");
    expect(client.request).toHaveBeenCalledWith(expect.anything(), {
      filter: { number: { eq: 42 }, team: { key: { eq: "ENG" } } },
      first: 1,
    });
  });

  it("throws when issue not found", async () => {
    const client = mockGqlClient([]);
    await expect(resolveIssueId(client, "ENG-999")).rejects.toThrow(
      'Issue "ENG-999" not found',
    );
  });
});

describe("resolveIssueEstimateContext", () => {
  it("resolves identifier, derives team from the issue, and returns issueId plus team context", async () => {
    const client = mockGqlClient([engIssue], [exponentialTeam]);

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

    expect(client.request).toHaveBeenNthCalledWith(1, expect.anything(), {
      filter: { number: { eq: 42 }, team: { key: { eq: "ENG" } } },
      first: 1,
    });
    expect(client.request).toHaveBeenNthCalledWith(2, expect.anything(), {
      filter: { id: { eq: teamId } },
      first: 1,
    });
  });

  it("resolves by UUID using an id eq filter", async () => {
    const client = mockGqlClient([engIssue], [exponentialTeam]);

    await resolveIssueEstimateContext(
      client,
      "550e8400-e29b-41d4-a716-446655440000",
    );

    expect(client.request).toHaveBeenNthCalledWith(1, expect.anything(), {
      filter: { id: { eq: "550e8400-e29b-41d4-a716-446655440000" } },
      first: 1,
    });
  });

  it("throws Issue not found", async () => {
    const client = mockGqlClient([]);

    await expect(
      resolveIssueEstimateContext(client, "ENG-999"),
    ).rejects.toThrow('Issue "ENG-999" not found');
  });
});

describe("resolveIssueRefs", () => {
  const nodes = [
    {
      id: "550e8400-e29b-41d4-a716-4466554400e1",
      number: 1,
      team: { id: teamId, key: "ENG" },
    },
    { id: "eng-2-uuid", number: 2, team: { id: teamId, key: "ENG" } },
    { id: "des-1-uuid", number: 1, team: { id: "des-team", key: "DES" } },
  ];

  function mockRefsClient() {
    const request = vi.fn().mockResolvedValue({ issues: { nodes } });
    return { request, client: { request } as unknown as GraphQLClient };
  }

  it("resolves every reference in a single request", async () => {
    const { request, client } = mockRefsClient();

    const resolved = await resolveIssueRefs(client, ["ENG-1", "DES-1"]);

    expect(resolved).toEqual([
      {
        ref: "ENG-1",
        id: "550e8400-e29b-41d4-a716-4466554400e1",
        teamId,
        teamKey: "ENG",
      },
      { ref: "DES-1", id: "des-1-uuid", teamId: "des-team", teamKey: "DES" },
    ]);
    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith(expect.anything(), {
      filter: {
        or: [
          { number: { eq: 1 }, team: { key: { eq: "ENG" } } },
          { number: { eq: 1 }, team: { key: { eq: "DES" } } },
        ],
      },
      first: 2,
    });
  });

  it("distinguishes the same issue number across teams", async () => {
    const { client } = mockRefsClient();

    const resolved = await resolveIssueRefs(client, ["DES-1"]);

    expect(resolved[0]?.id).toBe("des-1-uuid");
  });

  it("collapses duplicate references, preserving first-seen order", async () => {
    const { client } = mockRefsClient();

    const resolved = await resolveIssueRefs(client, [
      "ENG-2",
      "ENG-1",
      "ENG-2",
    ]);

    expect(resolved.map((entry) => entry.ref)).toEqual(["ENG-2", "ENG-1"]);
  });

  it("looks up UUID references too, since a UUID carries no team", async () => {
    const { client } = mockRefsClient();

    const resolved = await resolveIssueRefs(client, [
      "550e8400-e29b-41d4-a716-4466554400e1",
    ]);

    expect(resolved[0]?.teamKey).toBe("ENG");
  });

  it("throws for a reference with no match", async () => {
    const { client } = mockRefsClient();

    await expect(resolveIssueRefs(client, ["ENG-99"])).rejects.toThrow(
      'Issue "ENG-99" not found',
    );
  });

  it("makes no request for an empty list", async () => {
    const { request, client } = mockRefsClient();

    await expect(resolveIssueRefs(client, [])).resolves.toEqual([]);
    expect(request).not.toHaveBeenCalled();
  });
});
