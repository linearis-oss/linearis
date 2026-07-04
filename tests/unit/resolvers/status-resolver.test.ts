// tests/unit/resolvers/status-resolver.test.ts

import { describe, expect, it, vi } from "vitest";
import type { GraphQLClient } from "../../../src/client/graphql-client.js";
import { asUuid } from "../../../src/common/identifier.js";
import { resolveStatusId } from "../../../src/resolvers/status-resolver.js";

function mockGqlClient(nodes: Array<{ id: string }>) {
  return {
    request: vi.fn().mockResolvedValue({ workflowStates: { nodes } }),
  } as unknown as GraphQLClient;
}

describe("resolveStatusId", () => {
  it("returns UUID as-is", async () => {
    const client = mockGqlClient([]);
    const result = await resolveStatusId(
      client,
      "550e8400-e29b-41d4-a716-446655440000",
    );
    expect(result).toBe("550e8400-e29b-41d4-a716-446655440000");
  });

  it("resolves status by name", async () => {
    const client = mockGqlClient([{ id: "status-uuid" }]);
    const result = await resolveStatusId(client, "In Progress");
    expect(result).toBe("status-uuid");
  });

  it("resolves status by name with team context", async () => {
    const client = mockGqlClient([{ id: "status-uuid" }]);
    await resolveStatusId(client, "In Progress", asUuid("team-uuid"));
    expect(client.request).toHaveBeenCalledWith(expect.anything(), {
      filter: {
        name: { eqIgnoreCase: "In Progress" },
        team: { id: { eq: "team-uuid" } },
      },
      first: 1,
    });
  });

  it("throws when status not found", async () => {
    const client = mockGqlClient([]);
    await expect(resolveStatusId(client, "Nonexistent")).rejects.toThrow(
      'Status "Nonexistent" not found',
    );
  });
});
