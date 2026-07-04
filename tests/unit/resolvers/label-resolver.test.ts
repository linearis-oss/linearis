// tests/unit/resolvers/label-resolver.test.ts
import { describe, expect, it, vi } from "vitest";
import type { GraphQLClient } from "../../../src/client/graphql-client.js";
import {
  resolveLabelId,
  resolveLabelIds,
} from "../../../src/resolvers/label-resolver.js";

function mockGqlClient(nodes: Array<{ id: string; name?: string }>) {
  return {
    request: vi.fn().mockResolvedValue({ issueLabels: { nodes } }),
  } as unknown as GraphQLClient;
}

describe("resolveLabelId", () => {
  it("returns UUID as-is", async () => {
    const client = mockGqlClient([]);
    const result = await resolveLabelId(
      client,
      "550e8400-e29b-41d4-a716-446655440000",
    );
    expect(result).toBe("550e8400-e29b-41d4-a716-446655440000");
  });

  it("resolves label by name", async () => {
    const client = mockGqlClient([{ id: "label-uuid" }]);
    const result = await resolveLabelId(client, "Bug");
    expect(result).toBe("label-uuid");
    expect(client.request).toHaveBeenCalledWith(expect.anything(), {
      filter: { name: { eqIgnoreCase: "Bug" } },
      first: 1,
    });
  });

  it("resolves workspace label by name", async () => {
    const client = mockGqlClient([{ id: "label-uuid" }]);

    await resolveLabelId(client, "Bug", { scope: "workspace" });

    expect(client.request).toHaveBeenCalledWith(expect.anything(), {
      filter: {
        name: { eqIgnoreCase: "Bug" },
        team: { null: true },
      },
      first: 1,
    });
  });

  it("resolves team-scoped label by name", async () => {
    const client = mockGqlClient([{ id: "label-uuid" }]);

    await resolveLabelId(client, "Bug", {
      teamId: "team-uuid",
      scope: "team",
    });

    expect(client.request).toHaveBeenCalledWith(expect.anything(), {
      filter: {
        name: { eqIgnoreCase: "Bug" },
        team: { id: { eq: "team-uuid" }, null: false },
      },
      first: 1,
    });
  });

  it("filters by team when teamId is provided without explicit scope", async () => {
    const client = mockGqlClient([{ id: "label-uuid" }]);

    await resolveLabelId(client, "Bug", { teamId: "team-uuid" });

    expect(client.request).toHaveBeenCalledWith(expect.anything(), {
      filter: {
        name: { eqIgnoreCase: "Bug" },
        team: { id: { eq: "team-uuid" } },
      },
      first: 1,
    });
  });

  it("throws when label not found", async () => {
    const client = mockGqlClient([]);
    await expect(resolveLabelId(client, "Nonexistent")).rejects.toThrow(
      'Label "Nonexistent" not found',
    );
  });
});

describe("resolveLabelIds", () => {
  it("resolves mixed UUIDs and names", async () => {
    const client = mockGqlClient([{ id: "label-uuid" }]);
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
