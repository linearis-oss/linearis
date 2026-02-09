// tests/unit/resolvers/cycle-resolver.test.ts
import { describe, expect, it, vi } from "vitest";
import type { LinearSdkClient } from "../../../src/client/linear-client.js";
import { resolveCycleId } from "../../../src/resolvers/cycle-resolver.js";

function mockSdkClient(
  cycleNodes: Array<{
    id: string;
    name?: string;
    isActive?: boolean;
    isNext?: boolean;
    isPrevious?: boolean;
    number?: number;
    startsAt?: string;
  }>,
) {
  const teams = vi.fn().mockResolvedValue({ nodes: [{ id: "team-uuid" }] });
  const cycles = vi.fn().mockResolvedValue({ nodes: cycleNodes });
  // Mock cycle.team as a resolved property
  cycleNodes.forEach((node) => {
    Object.defineProperty(node, "team", {
      value: Promise.resolve({
        id: "team-uuid",
        key: "ENG",
        name: "Engineering",
      }),
      enumerable: false,
    });
  });
  return { sdk: { teams, cycles } } as unknown as LinearSdkClient;
}

describe("resolveCycleId", () => {
  it("returns UUID as-is", async () => {
    const client = mockSdkClient([]);
    const result = await resolveCycleId(
      client,
      "550e8400-e29b-41d4-a716-446655440000",
    );
    expect(result).toBe("550e8400-e29b-41d4-a716-446655440000");
  });

  it("resolves single matching cycle by name", async () => {
    const client = mockSdkClient([{ id: "cycle-uuid", name: "Sprint 1" }]);
    const result = await resolveCycleId(client, "Sprint 1");
    expect(result).toBe("cycle-uuid");
  });

  it("throws when cycle not found", async () => {
    const client = mockSdkClient([]);
    await expect(resolveCycleId(client, "Nonexistent")).rejects.toThrow();
  });
});
