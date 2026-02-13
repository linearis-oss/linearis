// tests/unit/resolvers/project-resolver.test.ts
import { describe, expect, it, vi } from "vitest";
import type { LinearSdkClient } from "../../../src/client/linear-client.js";
import { resolveProjectId } from "../../../src/resolvers/project-resolver.js";

function mockSdkClient(nodes: Array<{ id: string }>) {
  return {
    sdk: {
      projects: vi.fn().mockResolvedValue({ nodes }),
    },
  } as unknown as LinearSdkClient;
}

describe("resolveProjectId", () => {
  it("returns UUID as-is", async () => {
    const client = mockSdkClient([]);
    const result = await resolveProjectId(
      client,
      "550e8400-e29b-41d4-a716-446655440000",
    );
    expect(result).toBe("550e8400-e29b-41d4-a716-446655440000");
    expect(client.sdk.projects).not.toHaveBeenCalled();
  });

  it("resolves project by name", async () => {
    const client = mockSdkClient([{ id: "proj-uuid" }]);
    const result = await resolveProjectId(client, "Mobile App");
    expect(result).toBe("proj-uuid");
  });

  it("throws when project not found", async () => {
    const client = mockSdkClient([]);
    await expect(resolveProjectId(client, "Nonexistent")).rejects.toThrow(
      'Project "Nonexistent" not found',
    );
  });
});
