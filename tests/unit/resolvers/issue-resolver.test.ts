// tests/unit/resolvers/issue-resolver.test.ts
import { describe, expect, it, vi } from "vitest";
import type { LinearSdkClient } from "../../../src/client/linear-client.js";
import { resolveIssueId } from "../../../src/resolvers/issue-resolver.js";

function mockSdkClient(nodes: Array<{ id: string }>) {
  return {
    sdk: {
      issues: vi.fn().mockResolvedValue({ nodes }),
    },
  } as unknown as LinearSdkClient;
}

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
