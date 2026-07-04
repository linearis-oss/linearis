// tests/unit/resolvers/project-resolver.test.ts
import { describe, expect, it, vi } from "vitest";
import type { GraphQLClient } from "../../../src/client/graphql-client.js";
import {
  resolveProjectId,
  resolveProjectLabelId,
  resolveProjectLabelIds,
} from "../../../src/resolvers/project-resolver.js";

function mockGqlClient(nodes: Array<{ id: string }>) {
  return {
    request: vi.fn().mockResolvedValue({ projects: { nodes } }),
  } as unknown as GraphQLClient;
}

function mockGqlClientWithLabels(nodes: Array<{ id: string }>) {
  return {
    request: vi.fn().mockResolvedValue({ projectLabels: { nodes } }),
  } as unknown as GraphQLClient;
}

describe("resolveProjectId", () => {
  it("returns UUID as-is", async () => {
    const client = mockGqlClient([]);
    const result = await resolveProjectId(
      client,
      "550e8400-e29b-41d4-a716-446655440000",
    );
    expect(result).toBe("550e8400-e29b-41d4-a716-446655440000");
    expect(client.request).not.toHaveBeenCalled();
  });

  it("resolves project by name", async () => {
    const client = mockGqlClient([{ id: "proj-uuid" }]);
    const result = await resolveProjectId(client, "Mobile App");
    expect(result).toBe("proj-uuid");
  });

  it("includes archived projects when requested", async () => {
    const client = mockGqlClient([{ id: "archived-proj-uuid" }]);

    const result = await resolveProjectId(client, "Archived Project", {
      includeArchived: true,
    });

    expect(result).toBe("archived-proj-uuid");
    expect(client.request).toHaveBeenCalledWith(expect.anything(), {
      name: "Archived Project",
      includeArchived: true,
    });
  });

  it("throws when project not found", async () => {
    const client = mockGqlClient([]);
    await expect(resolveProjectId(client, "Nonexistent")).rejects.toThrow(
      'Project "Nonexistent" not found',
    );
  });

  it("throws when multiple projects match same name", async () => {
    const client = mockGqlClient([
      { id: "proj-uuid-1" },
      { id: "proj-uuid-2" },
    ]);

    await expect(
      resolveProjectId(client, "Mobile App", { includeArchived: true }),
    ).rejects.toThrow(
      'Multiple Projects found matching "Mobile App". Candidates: proj-uuid-1, proj-uuid-2. Please provide project UUID.',
    );
  });
});

describe("resolveProjectLabelId", () => {
  it("returns UUID as-is", async () => {
    const client = mockGqlClientWithLabels([]);
    const result = await resolveProjectLabelId(
      client,
      "550e8400-e29b-41d4-a716-446655440000",
    );
    expect(result).toBe("550e8400-e29b-41d4-a716-446655440000");
    expect(client.request).not.toHaveBeenCalled();
  });

  it("resolves label by name", async () => {
    const client = mockGqlClientWithLabels([{ id: "label-uuid" }]);
    const result = await resolveProjectLabelId(client, "Q1-2025");
    expect(result).toBe("label-uuid");
  });

  it("throws when label not found", async () => {
    const client = mockGqlClientWithLabels([]);
    await expect(resolveProjectLabelId(client, "Nonexistent")).rejects.toThrow(
      'Project label "Nonexistent" not found',
    );
  });
});

describe("resolveProjectLabelIds", () => {
  it("resolves mixed UUIDs and names", async () => {
    const client = mockGqlClientWithLabels([{ id: "label-uuid" }]);
    const result = await resolveProjectLabelIds(client, [
      "550e8400-e29b-41d4-a716-446655440000",
      "Q1-2025",
    ]);
    expect(result).toEqual([
      "550e8400-e29b-41d4-a716-446655440000",
      "label-uuid",
    ]);
  });
});
