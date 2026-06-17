// tests/unit/resolvers/label-resolver.test.ts
import { describe, expect, it, vi } from "vitest";
import type { LinearSdkClient } from "../../../src/client/linear-client.js";
import {
  resolveLabelId,
  resolveLabelIds,
} from "../../../src/resolvers/label-resolver.js";

function mockSdkClient(nodes: Array<{ id: string; name?: string }>) {
  return {
    sdk: {
      issueLabels: vi.fn().mockResolvedValue({ nodes }),
    },
  } as unknown as LinearSdkClient;
}

describe("resolveLabelId", () => {
  it("returns UUID as-is", async () => {
    const client = mockSdkClient([]);
    const result = await resolveLabelId(
      client,
      "550e8400-e29b-41d4-a716-446655440000",
    );
    expect(result).toBe("550e8400-e29b-41d4-a716-446655440000");
  });

  it("resolves label by name", async () => {
    const client = mockSdkClient([{ id: "label-uuid" }]);
    const result = await resolveLabelId(client, "Bug");
    expect(result).toBe("label-uuid");
    expect(client.sdk.issueLabels).toHaveBeenCalledWith({
      filter: { name: { eqIgnoreCase: "Bug" } },
      first: 1,
    });
  });

  it("resolves workspace label by name", async () => {
    const client = mockSdkClient([{ id: "label-uuid" }]);

    await resolveLabelId(client, "Bug", { scope: "workspace" });

    expect(client.sdk.issueLabels).toHaveBeenCalledWith({
      filter: {
        name: { eqIgnoreCase: "Bug" },
        team: { null: true },
      },
      first: 1,
    });
  });

  it("resolves team-scoped label by name", async () => {
    const client = mockSdkClient([{ id: "label-uuid" }]);

    await resolveLabelId(client, "Bug", {
      teamId: "team-uuid",
      scope: "team",
    });

    expect(client.sdk.issueLabels).toHaveBeenCalledWith({
      filter: {
        name: { eqIgnoreCase: "Bug" },
        team: { id: { eq: "team-uuid" }, null: false },
      },
      first: 1,
    });
  });

  it("filters by team when teamId is provided without explicit scope", async () => {
    const client = mockSdkClient([{ id: "label-uuid" }]);

    await resolveLabelId(client, "Bug", { teamId: "team-uuid" });

    expect(client.sdk.issueLabels).toHaveBeenCalledWith({
      filter: {
        name: { eqIgnoreCase: "Bug" },
        team: { id: { eq: "team-uuid" } },
      },
      first: 1,
    });
  });

  it("throws when label not found", async () => {
    const client = mockSdkClient([]);
    await expect(resolveLabelId(client, "Nonexistent")).rejects.toThrow(
      'Label "Nonexistent" not found',
    );
  });
});

describe("resolveLabelIds", () => {
  it("resolves mixed UUIDs and names", async () => {
    const client = mockSdkClient([{ id: "label-uuid" }]);
    const result = await resolveLabelIds(client, [
      "550e8400-e29b-41d4-a716-446655440000",
      "Bug",
    ]);
    expect(result).toEqual([
      "550e8400-e29b-41d4-a716-446655440000",
      "label-uuid",
    ]);
  });
});
