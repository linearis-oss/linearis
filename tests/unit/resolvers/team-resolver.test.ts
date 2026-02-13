// tests/unit/resolvers/team-resolver.test.ts
import { describe, expect, it, vi } from "vitest";
import type { LinearSdkClient } from "../../../src/client/linear-client.js";
import { resolveTeamId } from "../../../src/resolvers/team-resolver.js";

function mockSdkClient(
  ...callResults: Array<{
    nodes: Array<{ id: string; key?: string; name?: string }>;
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
