import { describe, expect, it, vi } from "vitest";
import type { GraphQLClient } from "../../../src/client/graphql-client.js";
import { asUuid } from "../../../src/common/identifier.js";
import {
  ArchiveProjectUpdateDocument,
  CreateProjectUpdateDocument,
  CreateProjectUpdateReminderDocument,
  EditProjectUpdateDocument,
  GetProjectUpdateDocument,
  ListProjectUpdatesDocument,
  UnarchiveProjectUpdateDocument,
} from "../../../src/gql/graphql.js";
import {
  archiveProjectUpdate,
  createProjectUpdate,
  editProjectUpdate,
  getProjectUpdate,
  listProjectUpdates,
  remindProjectUpdate,
  unarchiveProjectUpdate,
} from "../../../src/services/project-update-service.js";

function mockGqlClient(response: Record<string, unknown>): {
  client: GraphQLClient;
  request: ReturnType<typeof vi.fn>;
} {
  const request = vi.fn().mockResolvedValue(response);
  return {
    client: { request } as unknown as GraphQLClient,
    request,
  };
}

describe("listProjectUpdates", () => {
  it("forwards the project filter and pagination", async () => {
    const { client, request } = mockGqlClient({
      projectUpdates: {
        nodes: [{ id: "upd-1", body: "Week 1" }],
        pageInfo: { hasNextPage: false, endCursor: null },
      },
    });

    await expect(
      listProjectUpdates(client, {
        projectId: asUuid("proj-1"),
        limit: 5,
        after: "cursor-1",
        includeArchived: true,
      }),
    ).resolves.toEqual({
      nodes: [{ id: "upd-1", body: "Week 1" }],
      pageInfo: { hasNextPage: false, endCursor: null },
    });

    expect(request).toHaveBeenCalledWith(ListProjectUpdatesDocument, {
      projectId: "proj-1",
      first: 5,
      after: "cursor-1",
      includeArchived: true,
    });
  });

  it("defaults to 50 results and excludes archived updates", async () => {
    const { client, request } = mockGqlClient({
      projectUpdates: { nodes: [], pageInfo: { hasNextPage: false } },
    });

    await listProjectUpdates(client, { projectId: asUuid("proj-1") });

    expect(request).toHaveBeenCalledWith(ListProjectUpdatesDocument, {
      projectId: "proj-1",
      first: 50,
      after: undefined,
      includeArchived: false,
    });
  });
});

describe("getProjectUpdate", () => {
  it("returns the update when found", async () => {
    const update = { id: "upd-1", body: "Week 1", health: "onTrack" };
    const { client, request } = mockGqlClient({ projectUpdate: update });

    await expect(getProjectUpdate(client, asUuid("upd-1"))).resolves.toEqual(
      update,
    );
    expect(request).toHaveBeenCalledWith(GetProjectUpdateDocument, {
      id: "upd-1",
    });
  });

  it("throws when the update is missing", async () => {
    const { client } = mockGqlClient({ projectUpdate: null });

    await expect(getProjectUpdate(client, asUuid("upd-1"))).rejects.toThrow(
      'Project update with ID "upd-1" not found',
    );
  });
});

describe("createProjectUpdate", () => {
  it("returns the created update", async () => {
    const { client, request } = mockGqlClient({
      projectUpdateCreate: {
        success: true,
        projectUpdate: { id: "upd-1", body: "Week 1" },
      },
    });

    await expect(
      createProjectUpdate(client, {
        projectId: asUuid("proj-1"),
        body: "Week 1",
        health: "atRisk",
        isDiffHidden: true,
      }),
    ).resolves.toEqual({ id: "upd-1", body: "Week 1" });

    expect(request).toHaveBeenCalledWith(CreateProjectUpdateDocument, {
      input: {
        projectId: "proj-1",
        body: "Week 1",
        health: "atRisk",
        isDiffHidden: true,
      },
    });
  });

  it("throws when the mutation reports failure", async () => {
    const { client } = mockGqlClient({
      projectUpdateCreate: { success: false, projectUpdate: null },
    });

    await expect(
      createProjectUpdate(client, { projectId: asUuid("proj-1") }),
    ).rejects.toThrow("Failed to create project update");
  });
});

describe("editProjectUpdate", () => {
  it("returns the edited update", async () => {
    const { client, request } = mockGqlClient({
      projectUpdateUpdate: {
        success: true,
        projectUpdate: { id: "upd-1", body: "Revised" },
      },
    });

    await expect(
      editProjectUpdate(client, asUuid("upd-1"), { body: "Revised" }),
    ).resolves.toEqual({ id: "upd-1", body: "Revised" });

    expect(request).toHaveBeenCalledWith(EditProjectUpdateDocument, {
      id: "upd-1",
      input: { body: "Revised" },
    });
  });

  it("rejects an empty patch before calling the API", async () => {
    const { client, request } = mockGqlClient({});

    await expect(
      editProjectUpdate(client, asUuid("upd-1"), {}),
    ).rejects.toThrow("at least one update field must be provided");

    expect(request).not.toHaveBeenCalled();
  });
});

describe("archiveProjectUpdate", () => {
  it("returns the archived update", async () => {
    const { client, request } = mockGqlClient({
      projectUpdateArchive: { success: true, entity: { id: "upd-1" } },
    });

    await expect(
      archiveProjectUpdate(client, asUuid("upd-1")),
    ).resolves.toEqual({ id: "upd-1" });

    expect(request).toHaveBeenCalledWith(ArchiveProjectUpdateDocument, {
      id: "upd-1",
    });
  });

  it("throws when the mutation reports failure", async () => {
    const { client } = mockGqlClient({
      projectUpdateArchive: { success: false, entity: null },
    });

    await expect(archiveProjectUpdate(client, asUuid("upd-1"))).rejects.toThrow(
      'Failed to archive project update "upd-1"',
    );
  });
});

describe("unarchiveProjectUpdate", () => {
  it("returns the restored update", async () => {
    const { client, request } = mockGqlClient({
      projectUpdateUnarchive: { success: true, entity: { id: "upd-1" } },
    });

    await expect(
      unarchiveProjectUpdate(client, asUuid("upd-1")),
    ).resolves.toEqual({ id: "upd-1" });

    expect(request).toHaveBeenCalledWith(UnarchiveProjectUpdateDocument, {
      id: "upd-1",
    });
  });

  it("throws when the mutation reports failure", async () => {
    const { client } = mockGqlClient({
      projectUpdateUnarchive: { success: false, entity: null },
    });

    await expect(
      unarchiveProjectUpdate(client, asUuid("upd-1")),
    ).rejects.toThrow('Failed to unarchive project update "upd-1"');
  });
});

describe("remindProjectUpdate", () => {
  it("echoes the project because the payload carries no entity", async () => {
    const { client, request } = mockGqlClient({
      createProjectUpdateReminder: { success: true },
    });

    await expect(
      remindProjectUpdate(client, asUuid("proj-1"), asUuid("user-1")),
    ).resolves.toEqual({ projectId: "proj-1", success: true });

    expect(request).toHaveBeenCalledWith(CreateProjectUpdateReminderDocument, {
      projectId: "proj-1",
      userId: "user-1",
    });
  });

  it("throws when the mutation reports failure", async () => {
    const { client } = mockGqlClient({
      createProjectUpdateReminder: { success: false },
    });

    await expect(remindProjectUpdate(client, asUuid("proj-1"))).rejects.toThrow(
      'Failed to create an update reminder for project "proj-1"',
    );
  });
});
