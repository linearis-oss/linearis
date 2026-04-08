import { describe, expect, it, vi } from "vitest";
import type { GraphQLClient } from "../../../src/client/graphql-client.js";
import { resolveProjectStatusId } from "../../../src/resolvers/project-status-resolver.js";

function mockGqlClient(nodes: Array<{ id: string; name: string }>) {
  return {
    request: vi.fn().mockResolvedValue({
      projectStatuses: { nodes },
    }),
  } as unknown as GraphQLClient;
}

describe("resolveProjectStatusId", () => {
  it("returns UUID as-is", async () => {
    const client = mockGqlClient([]);
    const result = await resolveProjectStatusId(
      client,
      "550e8400-e29b-41d4-a716-446655440000",
    );
    expect(result).toBe("550e8400-e29b-41d4-a716-446655440000");
    expect(client.request).not.toHaveBeenCalled();
  });

  it("resolves status by name", async () => {
    const client = mockGqlClient([{ id: "status-uuid", name: "Started" }]);
    const result = await resolveProjectStatusId(client, "Started");
    expect(result).toBe("status-uuid");
  });

  it("resolves status by name case-insensitively", async () => {
    const client = mockGqlClient([{ id: "status-uuid", name: "Started" }]);
    const result = await resolveProjectStatusId(client, "started");
    expect(result).toBe("status-uuid");
  });

  it("throws when status not found", async () => {
    const client = mockGqlClient([]);
    await expect(resolveProjectStatusId(client, "Nonexistent")).rejects.toThrow(
      'Project status "Nonexistent" not found',
    );
  });
});
