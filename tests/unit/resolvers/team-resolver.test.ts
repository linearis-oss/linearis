// tests/unit/resolvers/team-resolver.test.ts
import { describe, expect, it, vi } from "vitest";
import type { LinearSdkClient } from "../../../src/client/linear-client.js";
import {
  resolveTeamEstimateContext,
  resolveTeamId,
} from "../../../src/resolvers/team-resolver.js";

function mockSdkClient(
  ...callResults: Array<{
    nodes: Array<{
      id: string;
      key?: string;
      name?: string;
      issueEstimationType?:
        | "notUsed"
        | "exponential"
        | "fibonacci"
        | "linear"
        | "tShirt";
      issueEstimationExtended?: boolean;
      issueEstimationAllowZero?: boolean;
    }>;
  }>
) {
  const teams = vi.fn();
  for (const result of callResults) {
    teams.mockResolvedValueOnce(result);
  }
  return { sdk: { teams } } as unknown as LinearSdkClient;
}

describe("resolveTeamId", () => {
  it("returns UUID as-is without calling SDK", async () => {
    const client = mockSdkClient();
    const result = await resolveTeamId(
      client,
      "550e8400-e29b-41d4-a716-446655440000",
    );
    expect(result).toBe("550e8400-e29b-41d4-a716-446655440000");
    expect(client.sdk.teams).not.toHaveBeenCalled();
  });

  it("resolves team by key", async () => {
    const client = mockSdkClient({ nodes: [{ id: "uuid-1", key: "ENG" }] });
    const result = await resolveTeamId(client, "ENG");
    expect(result).toBe("uuid-1");
  });

  it("falls back to name when key not found", async () => {
    const client = mockSdkClient(
      { nodes: [] },
      { nodes: [{ id: "uuid-2", name: "Engineering" }] },
    );
    const result = await resolveTeamId(client, "Engineering");
    expect(result).toBe("uuid-2");
  });

  it("throws when team not found by key or name", async () => {
    const client = mockSdkClient({ nodes: [] }, { nodes: [] });
    await expect(resolveTeamId(client, "NOPE")).rejects.toThrow(
      'Team "NOPE" not found',
    );
  });
});

describe("resolveTeamEstimateContext", () => {
  it("resolves by key with full context fields", async () => {
    const client = mockSdkClient({
      nodes: [
        {
          id: "uuid-1",
          key: "ENG",
          name: "Engineering",
          issueEstimationType: "fibonacci",
          issueEstimationExtended: true,
          issueEstimationAllowZero: false,
        },
      ],
    });

    await expect(resolveTeamEstimateContext(client, "ENG")).resolves.toEqual({
      teamId: "uuid-1",
      teamKey: "ENG",
      teamName: "Engineering",
      issueEstimationType: "fibonacci",
      issueEstimationExtended: true,
      issueEstimationAllowZero: false,
    });
  });

  it("resolves by UUID and queries sdk with id eq filter", async () => {
    const client = mockSdkClient({
      nodes: [
        {
          id: "team-uuid",
          key: "OPS",
          name: "Operations",
          issueEstimationType: "linear",
          issueEstimationExtended: false,
          issueEstimationAllowZero: true,
        },
      ],
    });

    const result = await resolveTeamEstimateContext(
      client,
      "550e8400-e29b-41d4-a716-446655440000",
    );

    expect(result.teamId).toBe("team-uuid");
    expect(client.sdk.teams).toHaveBeenCalledWith({
      filter: { id: { eq: "550e8400-e29b-41d4-a716-446655440000" } },
      first: 1,
    });
  });

  it("falls back to name when key lookup misses", async () => {
    const client = mockSdkClient(
      { nodes: [] },
      {
        nodes: [
          {
            id: "uuid-2",
            key: "ENG",
            name: "Engineering",
            issueEstimationType: "linear",
            issueEstimationExtended: false,
            issueEstimationAllowZero: true,
          },
        ],
      },
    );

    await expect(
      resolveTeamEstimateContext(client, "Engineering"),
    ).resolves.toEqual({
      teamId: "uuid-2",
      teamKey: "ENG",
      teamName: "Engineering",
      issueEstimationType: "linear",
      issueEstimationExtended: false,
      issueEstimationAllowZero: true,
    });

    expect(client.sdk.teams).toHaveBeenNthCalledWith(1, {
      filter: { key: { eq: "Engineering" } },
      first: 1,
    });
    expect(client.sdk.teams).toHaveBeenNthCalledWith(2, {
      filter: { name: { eq: "Engineering" } },
      first: 1,
    });
  });

  it("throws not found for UUID when id lookup has no nodes and does not fallback", async () => {
    const teamId = "550e8400-e29b-41d4-a716-446655440000";
    const client = mockSdkClient({ nodes: [] });

    await expect(resolveTeamEstimateContext(client, teamId)).rejects.toThrow(
      `Team "${teamId}" not found`,
    );

    expect(client.sdk.teams).toHaveBeenCalledTimes(1);
    expect(client.sdk.teams).toHaveBeenCalledWith({
      filter: { id: { eq: teamId } },
      first: 1,
    });
  });

  it("throws not found when no nodes", async () => {
    const client = mockSdkClient({ nodes: [] }, { nodes: [] });
    await expect(resolveTeamEstimateContext(client, "NOPE")).rejects.toThrow(
      'Team "NOPE" not found',
    );
  });
});
