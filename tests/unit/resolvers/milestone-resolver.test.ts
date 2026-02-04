// tests/unit/resolvers/milestone-resolver.test.ts
import { describe, it, expect, vi } from "vitest";
import { resolveMilestoneId } from "../../../src/resolvers/milestone-resolver.js";
import type { GraphQLClient } from "../../../src/client/graphql-client.js";
import type { LinearSdkClient } from "../../../src/client/linear-client.js";

function mockGqlClient(
  ...responses: Array<Record<string, unknown>>
) {
  const request = vi.fn();
  responses.forEach((r) => request.mockResolvedValueOnce(r));
  return { request } as unknown as GraphQLClient;
}

function mockSdkClient() {
  return {
    sdk: {
      projects: vi.fn().mockResolvedValue({ nodes: [{ id: "proj-uuid" }] }),
    },
  } as unknown as LinearSdkClient;
}

describe("resolveMilestoneId", () => {
  it("returns UUID as-is", async () => {
    const gql = mockGqlClient();
    const sdk = mockSdkClient();
    const result = await resolveMilestoneId(gql, sdk, "550e8400-e29b-41d4-a716-446655440000");
    expect(result).toBe("550e8400-e29b-41d4-a716-446655440000");
  });

  it("throws when milestone not found", async () => {
    const gql = mockGqlClient(
      { project: { projectMilestones: { nodes: [] } } },
      { projectMilestones: { nodes: [] } },
    );
    const sdk = mockSdkClient();
    await expect(
      resolveMilestoneId(gql, sdk, "Nonexistent", "My Project"),
    ).rejects.toThrow('Milestone "Nonexistent" not found');
  });
});
