// tests/unit/resolvers/status-resolver.test.ts
import { describe, expect, it, vi } from "vitest";
import type { LinearSdkClient } from "../../../src/client/linear-client.js";
import { resolveStatusId } from "../../../src/resolvers/status-resolver.js";

function mockSdkClient(nodes: Array<{ id: string }>) {
  return {
    sdk: {
      workflowStates: vi.fn().mockResolvedValue({ nodes }),
    },
  } as unknown as LinearSdkClient;
}

describe("resolveStatusId", () => {
  it("returns UUID as-is", async () => {
    const client = mockSdkClient([]);
    const result = await resolveStatusId(
      client,
      "550e8400-e29b-41d4-a716-446655440000",
    );
    expect(result).toBe("550e8400-e29b-41d4-a716-446655440000");
  });

  it("resolves status by name", async () => {
    const client = mockSdkClient([{ id: "status-uuid" }]);
    const result = await resolveStatusId(client, "In Progress");
    expect(result).toBe("status-uuid");
  });

  it("resolves status by name with team context", async () => {
    const client = mockSdkClient([{ id: "status-uuid" }]);
    await resolveStatusId(client, "In Progress", "team-uuid");
    expect(client.sdk.workflowStates).toHaveBeenCalledWith({
      filter: {
        name: { eqIgnoreCase: "In Progress" },
        team: { id: { eq: "team-uuid" } },
      },
      first: 1,
    });
  });

  it("throws when status not found", async () => {
    const client = mockSdkClient([]);
    await expect(resolveStatusId(client, "Nonexistent")).rejects.toThrow(
      'Status "Nonexistent" not found',
    );
  });
});
