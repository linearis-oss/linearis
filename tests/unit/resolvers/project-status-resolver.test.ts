import { describe, expect, it, vi } from "vitest";
import type { GraphQLClient } from "../../../src/client/graphql-client.js";
import { resolveProjectStatusId } from "../../../src/resolvers/project-status-resolver.js";

function mockGqlClient(
  nodes: Array<{ id: string; name: string; archivedAt?: string | null }>,
  hasNextPage = false,
) {
  return {
    request: vi.fn().mockResolvedValue({
      projectStatuses: { nodes, pageInfo: { hasNextPage } },
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

  it("excludes archived statuses unless asked", async () => {
    const client = mockGqlClient([{ id: "status-uuid", name: "Started" }]);
    await resolveProjectStatusId(client, "Started");

    expect(client.request).toHaveBeenCalledWith(expect.anything(), {
      includeArchived: false,
      first: 250,
    });
  });

  it("searches archived statuses when asked", async () => {
    const client = mockGqlClient([{ id: "status-uuid", name: "Retired" }]);
    const result = await resolveProjectStatusId(client, "Retired", {
      includeArchived: true,
    });

    expect(result).toBe("status-uuid");
    expect(client.request).toHaveBeenCalledWith(expect.anything(), {
      includeArchived: true,
      first: 250,
    });
  });

  it("refuses to choose between an archived and a live status of the same name", async () => {
    const client = mockGqlClient([
      { id: "old-uuid", name: "In Review", archivedAt: "2026-01-01T00:00:00Z" },
      { id: "new-uuid", name: "In Review", archivedAt: null },
    ]);

    const error = await resolveProjectStatusId(client, "In Review", {
      includeArchived: true,
    }).catch((caught: unknown) => caught as Error);

    expect(error.message).toContain(
      'Multiple project statuses found matching "In Review"',
    );
    expect(error.message).toContain("In Review (archived) (old-uuid)");
    expect(error.message).toContain("In Review (new-uuid)");
    expect(error.message).toContain("address the status by UUID");
  });

  it("throws when status not found", async () => {
    const client = mockGqlClient([]);
    await expect(resolveProjectStatusId(client, "Nonexistent")).rejects.toThrow(
      'Project status "Nonexistent" not found',
    );
  });

  it("refuses a miss past the page bound instead of reporting it missing", async () => {
    const client = mockGqlClient([{ id: "other-uuid", name: "Started" }], true);

    await expect(resolveProjectStatusId(client, "Retired")).rejects.toThrow(
      "more than 250 project statuses",
    );
  });

  it("refuses a lone match past the page bound", async () => {
    const client = mockGqlClient(
      [{ id: "status-uuid", name: "Started" }],
      true,
    );

    await expect(resolveProjectStatusId(client, "Started")).rejects.toThrow(
      "more than 250 project statuses",
    );
  });

  it("still names an ambiguity found past the page bound", async () => {
    const client = mockGqlClient(
      [
        {
          id: "old-uuid",
          name: "In Review",
          archivedAt: "2026-01-01T00:00:00Z",
        },
        { id: "new-uuid", name: "In Review", archivedAt: null },
      ],
      true,
    );

    await expect(
      resolveProjectStatusId(client, "In Review", { includeArchived: true }),
    ).rejects.toThrow('Multiple project statuses found matching "In Review"');
  });
});
