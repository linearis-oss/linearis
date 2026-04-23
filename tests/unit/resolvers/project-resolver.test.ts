// tests/unit/resolvers/project-resolver.test.ts
import { describe, expect, it, vi } from "vitest";
import type { LinearSdkClient } from "../../../src/client/linear-client.js";
import {
  resolveProjectId,
  resolveProjectLabelId,
  resolveProjectLabelIds,
} from "../../../src/resolvers/project-resolver.js";

function mockSdkClient(nodes: Array<{ id: string }>) {
  return {
    sdk: {
      projects: vi.fn().mockResolvedValue({ nodes }),
    },
  } as unknown as LinearSdkClient;
}

function mockSdkClientWithLabels(nodes: Array<{ id: string }>) {
  return {
    sdk: {
      projectLabels: vi.fn().mockResolvedValue({ nodes }),
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

  it("includes archived projects when requested", async () => {
    const client = mockSdkClient([{ id: "archived-proj-uuid" }]);

    const result = await resolveProjectId(client, "Archived Project", {
      includeArchived: true,
    });

    expect(result).toBe("archived-proj-uuid");
    expect(client.sdk.projects).toHaveBeenCalledWith({
      filter: { name: { eqIgnoreCase: "Archived Project" } },
      first: 1,
      includeArchived: true,
    });
  });

  it("throws when project not found", async () => {
    const client = mockSdkClient([]);
    await expect(resolveProjectId(client, "Nonexistent")).rejects.toThrow(
      'Project "Nonexistent" not found',
    );
  });
});

describe("resolveProjectLabelId", () => {
  it("returns UUID as-is", async () => {
    const client = mockSdkClientWithLabels([]);
    const result = await resolveProjectLabelId(
      client,
      "550e8400-e29b-41d4-a716-446655440000",
    );
    expect(result).toBe("550e8400-e29b-41d4-a716-446655440000");
    expect(client.sdk.projectLabels).not.toHaveBeenCalled();
  });

  it("resolves label by name", async () => {
    const client = mockSdkClientWithLabels([{ id: "label-uuid" }]);
    const result = await resolveProjectLabelId(client, "Q1-2025");
    expect(result).toBe("label-uuid");
  });

  it("throws when label not found", async () => {
    const client = mockSdkClientWithLabels([]);
    await expect(resolveProjectLabelId(client, "Nonexistent")).rejects.toThrow(
      'Project label "Nonexistent" not found',
    );
  });
});

describe("resolveProjectLabelIds", () => {
  it("resolves mixed UUIDs and names", async () => {
    const client = mockSdkClientWithLabels([{ id: "label-uuid" }]);
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
