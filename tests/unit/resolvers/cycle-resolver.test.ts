// tests/unit/resolvers/cycle-resolver.test.ts
import { describe, expect, it, vi } from "vitest";
import type { GraphQLClient } from "../../../src/client/graphql-client.js";
import { resolveCycleId } from "../../../src/resolvers/cycle-resolver.js";

type CycleNode = {
  id: string;
  name?: string;
  number?: number;
  startsAt?: string;
  isActive?: boolean;
  isNext?: boolean;
  isPrevious?: boolean;
  team?: { id: string; key: string };
};

function cycle(node: CycleNode): CycleNode {
  return {
    name: "Sprint",
    number: 1,
    isActive: false,
    isNext: false,
    isPrevious: false,
    team: { id: "team-uuid", key: "ENG" },
    ...node,
  };
}

// Unscoped lookups issue a single FindCycleGlobal request.
function mockGlobalClient(cycleNodes: CycleNode[]) {
  return {
    request: vi.fn().mockResolvedValue({ cycles: { nodes: cycleNodes } }),
  } as unknown as GraphQLClient;
}

// Team-scoped lookups first resolve the team (FindTeams), then FindCycleScoped.
function mockScopedClient(cycleNodes: CycleNode[]) {
  const request = vi
    .fn()
    .mockResolvedValueOnce({ teams: { nodes: [{ id: "team-uuid" }] } })
    .mockResolvedValueOnce({ cycles: { nodes: cycleNodes } });
  return { request } as unknown as GraphQLClient;
}

describe("resolveCycleId", () => {
  it("returns UUID as-is", async () => {
    const client = mockGlobalClient([]);
    const result = await resolveCycleId(
      client,
      "550e8400-e29b-41d4-a716-446655440000",
    );
    expect(result).toBe("550e8400-e29b-41d4-a716-446655440000");
    expect(client.request).not.toHaveBeenCalled();
  });

  it("resolves single matching cycle by name", async () => {
    const client = mockGlobalClient([cycle({ id: "cycle-uuid" })]);
    const result = await resolveCycleId(client, "Sprint 1");
    expect(result).toBe("cycle-uuid");
    expect(client.request).toHaveBeenCalledWith(expect.anything(), {
      name: "Sprint 1",
    });
  });

  it("prefers the active cycle when multiple match", async () => {
    const client = mockGlobalClient([
      cycle({ id: "prev", isPrevious: true }),
      cycle({ id: "active", isActive: true }),
      cycle({ id: "next", isNext: true }),
    ]);
    const result = await resolveCycleId(client, "Sprint");
    expect(result).toBe("active");
  });

  it("scopes to a team by resolving the team first", async () => {
    const client = mockScopedClient([cycle({ id: "cycle-uuid" })]);
    const result = await resolveCycleId(client, "Sprint 1", "ENG");
    expect(result).toBe("cycle-uuid");
    expect(client.request).toHaveBeenNthCalledWith(2, expect.anything(), {
      name: "Sprint 1",
      teamId: "team-uuid",
    });
  });

  it("throws when cycle not found", async () => {
    const client = mockGlobalClient([]);
    await expect(resolveCycleId(client, "Nonexistent")).rejects.toThrow();
  });

  it("throws when multiple cycles match without a clear preference", async () => {
    const client = mockGlobalClient([
      cycle({ id: "a", team: { id: "t1", key: "ENG" } }),
      cycle({ id: "b", team: { id: "t2", key: "OPS" } }),
    ]);
    await expect(resolveCycleId(client, "Sprint")).rejects.toThrow(/Multiple/i);
  });
});
