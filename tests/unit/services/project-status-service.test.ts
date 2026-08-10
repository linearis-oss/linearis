import { describe, expect, it, vi } from "vitest";
import type { GraphQLClient } from "../../../src/client/graphql-client.js";
import { asUuid } from "../../../src/common/identifier.js";
import {
  ArchiveProjectStatusDocument,
  CreateProjectStatusDocument,
  GetProjectStatusDocument,
  GetProjectStatusProjectCountDocument,
  ListProjectStatusesDocument,
  ReassignProjectStatusDocument,
  UnarchiveProjectStatusDocument,
  UpdateProjectStatusDocument,
} from "../../../src/gql/graphql.js";
import {
  archiveProjectStatus,
  createProjectStatus,
  getProjectStatus,
  listProjectStatuses,
  reassignProjectStatus,
  unarchiveProjectStatus,
  updateProjectStatus,
} from "../../../src/services/project-status-service.js";

/** Routes each document to its own canned response. */
function mockGqlClient(responses: Map<unknown, unknown>): {
  client: GraphQLClient;
  request: ReturnType<typeof vi.fn>;
} {
  const request = vi.fn(async (document: unknown) => {
    if (!responses.has(document)) {
      throw new Error("unexpected document");
    }
    return responses.get(document);
  });

  return { client: { request } as unknown as GraphQLClient, request };
}

describe("listProjectStatuses", () => {
  it("excludes archived statuses by default", async () => {
    const { client, request } = mockGqlClient(
      new Map([
        [
          ListProjectStatusesDocument,
          { projectStatuses: { nodes: [], pageInfo: { hasNextPage: false } } },
        ],
      ]),
    );

    await expect(listProjectStatuses(client)).resolves.toEqual({
      nodes: [],
      truncated: false,
    });
    expect(request).toHaveBeenCalledWith(ListProjectStatusesDocument, {
      includeArchived: false,
      first: 250,
    });
  });

  it("reports a flow that outgrew the page bound as truncated", async () => {
    const { client } = mockGqlClient(
      new Map([
        [
          ListProjectStatusesDocument,
          {
            projectStatuses: {
              nodes: [{ id: "st-1" }],
              pageInfo: { hasNextPage: true },
            },
          },
        ],
      ]),
    );

    await expect(listProjectStatuses(client, true)).resolves.toMatchObject({
      truncated: true,
    });
  });
});

describe("getProjectStatus", () => {
  it("folds the project count into the status payload", async () => {
    const { client } = mockGqlClient(
      new Map<unknown, unknown>([
        [GetProjectStatusDocument, { projectStatus: { id: "st-1" } }],
        [
          GetProjectStatusProjectCountDocument,
          {
            projectStatusProjectCount: {
              count: 3,
              privateCount: 1,
              archivedTeamCount: 0,
            },
          },
        ],
      ]),
    );

    await expect(getProjectStatus(client, asUuid("st-1"))).resolves.toEqual({
      id: "st-1",
      projectCount: { count: 3, privateCount: 1, archivedTeamCount: 0 },
    });
  });

  it("throws when the status is missing", async () => {
    const { client } = mockGqlClient(
      new Map<unknown, unknown>([
        [GetProjectStatusDocument, { projectStatus: null }],
        [
          GetProjectStatusProjectCountDocument,
          { projectStatusProjectCount: { count: 0 } },
        ],
      ]),
    );

    await expect(getProjectStatus(client, asUuid("st-1"))).rejects.toThrow(
      'Project status with ID "st-1" not found',
    );
  });
});

describe("createProjectStatus", () => {
  it("appends past the highest existing position when none is given", async () => {
    const { client, request } = mockGqlClient(
      new Map<unknown, unknown>([
        [
          ListProjectStatusesDocument,
          {
            projectStatuses: {
              nodes: [{ position: 2 }, { position: 5 }],
              pageInfo: { hasNextPage: false },
            },
          },
        ],
        [
          CreateProjectStatusDocument,
          { projectStatusCreate: { success: true, status: { id: "st-new" } } },
        ],
      ]),
    );

    await expect(
      createProjectStatus(client, {
        name: "Blocked",
        type: "paused",
        color: "#B45309",
      }),
    ).resolves.toEqual({ id: "st-new" });

    expect(request).toHaveBeenCalledWith(CreateProjectStatusDocument, {
      input: {
        name: "Blocked",
        type: "paused",
        color: "#B45309",
        position: 6,
      },
    });
  });

  it("counts archived statuses when picking the next position", async () => {
    const { client, request } = mockGqlClient(
      new Map<unknown, unknown>([
        [
          ListProjectStatusesDocument,
          {
            projectStatuses: {
              nodes: [{ position: 2 }, { position: 9 }],
              pageInfo: { hasNextPage: false },
            },
          },
        ],
        [
          CreateProjectStatusDocument,
          { projectStatusCreate: { success: true, status: { id: "st-new" } } },
        ],
      ]),
    );

    await createProjectStatus(client, {
      name: "Blocked",
      type: "paused",
      color: "#B45309",
    });

    expect(request).toHaveBeenCalledWith(ListProjectStatusesDocument, {
      includeArchived: true,
      first: 250,
    });
    expect(request).toHaveBeenCalledWith(CreateProjectStatusDocument, {
      input: expect.objectContaining({ position: 10 }),
    });
  });

  it("refuses to guess a position from a truncated flow", async () => {
    const { client, request } = mockGqlClient(
      new Map<unknown, unknown>([
        [
          ListProjectStatusesDocument,
          {
            projectStatuses: {
              nodes: [{ position: 2 }],
              pageInfo: { hasNextPage: true },
            },
          },
        ],
      ]),
    );

    await expect(
      createProjectStatus(client, {
        name: "Blocked",
        type: "paused",
        color: "#B45309",
      }),
    ).rejects.toThrow("more than 250 project statuses");

    expect(request).not.toHaveBeenCalledWith(
      CreateProjectStatusDocument,
      expect.anything(),
    );
  });

  it("uses an explicit position without reading the flow", async () => {
    const { client, request } = mockGqlClient(
      new Map<unknown, unknown>([
        [
          CreateProjectStatusDocument,
          { projectStatusCreate: { success: true, status: { id: "st-new" } } },
        ],
      ]),
    );

    await createProjectStatus(client, {
      name: "Blocked",
      type: "paused",
      color: "#B45309",
      position: 1.5,
    });

    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith(CreateProjectStatusDocument, {
      input: {
        name: "Blocked",
        type: "paused",
        color: "#B45309",
        position: 1.5,
      },
    });
  });

  it("throws when the mutation reports failure", async () => {
    const { client } = mockGqlClient(
      new Map<unknown, unknown>([
        [
          CreateProjectStatusDocument,
          { projectStatusCreate: { success: false, status: null } },
        ],
      ]),
    );

    await expect(
      createProjectStatus(client, {
        name: "Blocked",
        type: "paused",
        color: "#B45309",
        position: 1,
      }),
    ).rejects.toThrow('Failed to create project status "Blocked"');
  });
});

describe("updateProjectStatus", () => {
  it("forwards the patch", async () => {
    const { client, request } = mockGqlClient(
      new Map<unknown, unknown>([
        [
          UpdateProjectStatusDocument,
          { projectStatusUpdate: { success: true, status: { id: "st-1" } } },
        ],
      ]),
    );

    await expect(
      updateProjectStatus(client, asUuid("st-1"), { indefinite: false }),
    ).resolves.toEqual({ id: "st-1" });

    expect(request).toHaveBeenCalledWith(UpdateProjectStatusDocument, {
      id: "st-1",
      input: { indefinite: false },
    });
  });

  it("rejects an empty patch before calling the API", async () => {
    const { client, request } = mockGqlClient(new Map());

    await expect(
      updateProjectStatus(client, asUuid("st-1"), {}),
    ).rejects.toThrow("at least one update field must be provided");

    expect(request).not.toHaveBeenCalled();
  });
});

describe("reassignProjectStatus", () => {
  it("resolves when the mutation succeeds", async () => {
    const { client, request } = mockGqlClient(
      new Map<unknown, unknown>([
        [
          ReassignProjectStatusDocument,
          { projectReassignStatus: { success: true } },
        ],
      ]),
    );

    await expect(
      reassignProjectStatus(client, asUuid("st-1"), asUuid("st-2")),
    ).resolves.toBeUndefined();

    expect(request).toHaveBeenCalledWith(ReassignProjectStatusDocument, {
      originalProjectStatusId: "st-1",
      newProjectStatusId: "st-2",
    });
  });

  it("throws when the mutation reports failure", async () => {
    const { client } = mockGqlClient(
      new Map<unknown, unknown>([
        [
          ReassignProjectStatusDocument,
          { projectReassignStatus: { success: false } },
        ],
      ]),
    );

    await expect(
      reassignProjectStatus(client, asUuid("st-1"), asUuid("st-2")),
    ).rejects.toThrow(
      'Failed to reassign projects from status "st-1" to "st-2"',
    );
  });
});

describe("archiveProjectStatus", () => {
  it("returns the archived status", async () => {
    const { client } = mockGqlClient(
      new Map<unknown, unknown>([
        [
          ArchiveProjectStatusDocument,
          { projectStatusArchive: { success: true, entity: { id: "st-1" } } },
        ],
      ]),
    );

    await expect(archiveProjectStatus(client, asUuid("st-1"))).resolves.toEqual(
      { id: "st-1" },
    );
  });

  it("throws when Linear refuses the archive", async () => {
    const { client } = mockGqlClient(
      new Map<unknown, unknown>([
        [
          ArchiveProjectStatusDocument,
          { projectStatusArchive: { success: false, entity: null } },
        ],
      ]),
    );

    await expect(archiveProjectStatus(client, asUuid("st-1"))).rejects.toThrow(
      'Failed to archive project status "st-1"',
    );
  });
});

describe("unarchiveProjectStatus", () => {
  it("returns the restored status", async () => {
    const { client, request } = mockGqlClient(
      new Map<unknown, unknown>([
        [
          UnarchiveProjectStatusDocument,
          { projectStatusUnarchive: { success: true, entity: { id: "st-1" } } },
        ],
      ]),
    );

    await expect(
      unarchiveProjectStatus(client, asUuid("st-1")),
    ).resolves.toEqual({ id: "st-1" });

    expect(request).toHaveBeenCalledWith(UnarchiveProjectStatusDocument, {
      id: "st-1",
    });
  });

  it("throws when the mutation reports failure", async () => {
    const { client } = mockGqlClient(
      new Map<unknown, unknown>([
        [
          UnarchiveProjectStatusDocument,
          { projectStatusUnarchive: { success: false, entity: null } },
        ],
      ]),
    );

    await expect(
      unarchiveProjectStatus(client, asUuid("st-1")),
    ).rejects.toThrow('Failed to unarchive project status "st-1"');
  });
});
