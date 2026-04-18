import { describe, expect, it, vi } from "vitest";
import type { GraphQLClient } from "../../../src/client/graphql-client.js";
import {
  ArchiveInitiativeUpdateDocument,
  CreateInitiativeUpdateDocument,
  GetInitiativeUpdateDocument,
  ListInitiativeUpdatesDocument,
  UnarchiveInitiativeUpdateDocument,
  UpdateInitiativeUpdateDocument,
} from "../../../src/gql/graphql.js";
import {
  archiveInitiativeUpdate,
  createInitiativeUpdate,
  getInitiativeUpdate,
  listInitiativeUpdates,
  unarchiveInitiativeUpdate,
  updateInitiativeUpdate,
} from "../../../src/services/initiative-update-service.js";

function mockGqlClient(response: Record<string, unknown>): {
  client: GraphQLClient;
  request: ReturnType<typeof vi.fn>;
} {
  const request = vi.fn().mockResolvedValue(response);
  return {
    client: {
      request,
    } as unknown as GraphQLClient,
    request,
  };
}

describe("listInitiativeUpdates", () => {
  it("forwards initiative filter and pagination", async () => {
    const { client, request } = mockGqlClient({
      initiativeUpdates: {
        nodes: [{ id: "upd-1", body: "Week 1" }],
        pageInfo: { hasNextPage: false, endCursor: null },
      },
    });

    await listInitiativeUpdates(client, {
      initiativeId: "init-1",
      limit: 5,
      after: "cursor-1",
      includeArchived: true,
    });

    expect(request).toHaveBeenCalledWith(ListInitiativeUpdatesDocument, {
      initiativeId: "init-1",
      first: 5,
      after: "cursor-1",
      includeArchived: true,
    });
  });
});

describe("getInitiativeUpdate", () => {
  it("returns update when found", async () => {
    const update = {
      id: "upd-1",
      body: "Week 1",
      health: "OnTrack",
      createdAt: "2026-04-17T00:00:00.000Z",
      updatedAt: "2026-04-17T00:00:00.000Z",
      archivedAt: null,
      initiative: { id: "init-1", name: "Growth" },
      user: { id: "usr-1", name: "Alex" },
    };
    const { client, request } = mockGqlClient({ initiativeUpdate: update });

    await expect(getInitiativeUpdate(client, "upd-1")).resolves.toEqual(update);

    expect(request).toHaveBeenCalledWith(GetInitiativeUpdateDocument, {
      id: "upd-1",
    });
  });

  it("throws when update is not found", async () => {
    const { client } = mockGqlClient({ initiativeUpdate: null });

    await expect(getInitiativeUpdate(client, "upd-missing")).rejects.toThrow(
      'Initiative update with ID "upd-missing" not found',
    );
  });
});

describe("createInitiativeUpdate", () => {
  it("returns created update on success", async () => {
    const update = {
      id: "upd-1",
      body: "Week 1",
      health: "OnTrack",
      createdAt: "2026-04-17T00:00:00.000Z",
      updatedAt: "2026-04-17T00:00:00.000Z",
      archivedAt: null,
      initiative: { id: "init-1", name: "Growth" },
      user: { id: "usr-1", name: "Alex" },
    };
    const { client, request } = mockGqlClient({
      initiativeUpdateCreate: { success: true, initiativeUpdate: update },
    });

    await expect(
      createInitiativeUpdate(client, {
        initiativeId: "init-1",
        body: "Week 1",
      }),
    ).resolves.toEqual(update);

    expect(request).toHaveBeenCalledWith(CreateInitiativeUpdateDocument, {
      input: { initiativeId: "init-1", body: "Week 1" },
    });
  });

  it("throws when mutation success is false", async () => {
    const { client } = mockGqlClient({
      initiativeUpdateCreate: {
        success: false,
        initiativeUpdate: { id: "upd-1" },
      },
    });

    await expect(
      createInitiativeUpdate(client, {
        initiativeId: "init-1",
        body: "Week 1",
      }),
    ).rejects.toThrow("Failed to create initiative update");
  });

  it("throws when mutation payload is missing", async () => {
    const { client } = mockGqlClient({
      initiativeUpdateCreate: { success: true, initiativeUpdate: null },
    });

    await expect(
      createInitiativeUpdate(client, {
        initiativeId: "init-1",
        body: "Week 1",
      }),
    ).rejects.toThrow("Failed to create initiative update");
  });
});

describe("updateInitiativeUpdate", () => {
  it("rejects no-op update input", async () => {
    const { client } = mockGqlClient({});

    await expect(updateInitiativeUpdate(client, "upd-1", {})).rejects.toThrow(
      "Invalid update options: at least one update field must be provided",
    );
  });

  it("returns updated update on success", async () => {
    const update = {
      id: "upd-1",
      body: "Week 2",
      health: "AtRisk",
      createdAt: "2026-04-17T00:00:00.000Z",
      updatedAt: "2026-04-18T00:00:00.000Z",
      archivedAt: null,
      initiative: { id: "init-1", name: "Growth" },
      user: { id: "usr-1", name: "Alex" },
    };
    const { client, request } = mockGqlClient({
      initiativeUpdateUpdate: { success: true, initiativeUpdate: update },
    });

    await expect(
      updateInitiativeUpdate(client, "upd-1", { body: "Week 2" }),
    ).resolves.toEqual(update);

    expect(request).toHaveBeenCalledWith(UpdateInitiativeUpdateDocument, {
      id: "upd-1",
      input: { body: "Week 2" },
    });
  });

  it("throws when mutation success is false", async () => {
    const { client } = mockGqlClient({
      initiativeUpdateUpdate: {
        success: false,
        initiativeUpdate: { id: "upd-1" },
      },
    });

    await expect(
      updateInitiativeUpdate(client, "upd-1", { body: "Week 2" }),
    ).rejects.toThrow('Failed to update initiative update "upd-1"');
  });

  it("throws when mutation payload is missing", async () => {
    const { client } = mockGqlClient({
      initiativeUpdateUpdate: { success: true, initiativeUpdate: null },
    });

    await expect(
      updateInitiativeUpdate(client, "upd-1", { body: "Week 2" }),
    ).rejects.toThrow('Failed to update initiative update "upd-1"');
  });
});

describe("archiveInitiativeUpdate", () => {
  it("returns archived update entity on success", async () => {
    const archived = {
      id: "upd-1",
      body: "Week 1",
      health: "OnTrack",
      createdAt: "2026-04-17T00:00:00.000Z",
      updatedAt: "2026-04-18T00:00:00.000Z",
      archivedAt: "2026-04-18T00:00:00.000Z",
      initiative: { id: "init-1", name: "Growth" },
      user: { id: "usr-1", name: "Alex" },
    };
    const { client, request } = mockGqlClient({
      initiativeUpdateArchive: { success: true, entity: archived },
    });

    await expect(archiveInitiativeUpdate(client, "upd-1")).resolves.toEqual(
      archived,
    );

    expect(request).toHaveBeenCalledWith(ArchiveInitiativeUpdateDocument, {
      id: "upd-1",
    });
  });

  it("throws when mutation success is false", async () => {
    const { client } = mockGqlClient({
      initiativeUpdateArchive: { success: false, entity: { id: "upd-1" } },
    });

    await expect(archiveInitiativeUpdate(client, "upd-1")).rejects.toThrow(
      'Failed to archive initiative update "upd-1"',
    );
  });

  it("throws when mutation payload is missing", async () => {
    const { client } = mockGqlClient({
      initiativeUpdateArchive: { success: true, entity: null },
    });

    await expect(archiveInitiativeUpdate(client, "upd-1")).rejects.toThrow(
      'Failed to archive initiative update "upd-1"',
    );
  });
});

describe("unarchiveInitiativeUpdate", () => {
  it("returns unarchived update entity on success", async () => {
    const unarchived = {
      id: "upd-1",
      body: "Week 1",
      health: "OnTrack",
      createdAt: "2026-04-17T00:00:00.000Z",
      updatedAt: "2026-04-18T00:00:00.000Z",
      archivedAt: null,
      initiative: { id: "init-1", name: "Growth" },
      user: { id: "usr-1", name: "Alex" },
    };
    const { client, request } = mockGqlClient({
      initiativeUpdateUnarchive: { success: true, entity: unarchived },
    });

    await expect(unarchiveInitiativeUpdate(client, "upd-1")).resolves.toEqual(
      unarchived,
    );

    expect(request).toHaveBeenCalledWith(UnarchiveInitiativeUpdateDocument, {
      id: "upd-1",
    });
  });

  it("throws when mutation success is false", async () => {
    const { client } = mockGqlClient({
      initiativeUpdateUnarchive: { success: false, entity: { id: "upd-1" } },
    });

    await expect(unarchiveInitiativeUpdate(client, "upd-1")).rejects.toThrow(
      'Failed to unarchive initiative update "upd-1"',
    );
  });

  it("throws when mutation payload is missing", async () => {
    const { client } = mockGqlClient({
      initiativeUpdateUnarchive: { success: true, entity: null },
    });

    await expect(unarchiveInitiativeUpdate(client, "upd-1")).rejects.toThrow(
      'Failed to unarchive initiative update "upd-1"',
    );
  });
});
