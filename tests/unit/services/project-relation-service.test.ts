import { describe, expect, it, vi } from "vitest";
import type { GraphQLClient } from "../../../src/client/graphql-client.js";
import { asUuid } from "../../../src/common/identifier.js";
import {
  CreateProjectRelationDocument,
  DeleteProjectRelationDocument,
  UpdateProjectRelationDocument,
} from "../../../src/gql/graphql.js";
import {
  createProjectRelation,
  deleteProjectRelation,
  listProjectRelations,
  updateProjectRelation,
} from "../../../src/services/project-relation-service.js";

function mockGqlClient(response: Record<string, unknown>): GraphQLClient {
  return {
    request: vi.fn().mockResolvedValue(response),
  } as unknown as GraphQLClient;
}

describe("listProjectRelations", () => {
  it("returns both directions separately", async () => {
    const client = mockGqlClient({
      project: {
        id: "proj-1",
        name: "Auth",
        relations: {
          nodes: [{ id: "rel-1" }],
          pageInfo: { hasNextPage: false },
        },
        inverseRelations: {
          nodes: [{ id: "rel-2" }],
          pageInfo: { hasNextPage: false },
        },
      },
    });

    await expect(
      listProjectRelations(client, asUuid("proj-1")),
    ).resolves.toEqual({
      project: { id: "proj-1", name: "Auth" },
      relations: [{ id: "rel-1" }],
      inverseRelations: [{ id: "rel-2" }],
      truncated: false,
    });
  });

  it("reports truncation when either connection is cut off", async () => {
    const client = mockGqlClient({
      project: {
        id: "proj-1",
        name: "Auth",
        relations: { nodes: [], pageInfo: { hasNextPage: false } },
        inverseRelations: { nodes: [], pageInfo: { hasNextPage: true } },
      },
    });

    await expect(
      listProjectRelations(client, asUuid("proj-1")),
    ).resolves.toMatchObject({ truncated: true });
  });

  it("throws when the project is missing", async () => {
    const client = mockGqlClient({ project: null });

    await expect(
      listProjectRelations(client, asUuid("proj-1")),
    ).rejects.toThrow('Project "proj-1" not found');
  });
});

describe("createProjectRelation", () => {
  it('always writes type "dependency", the one literal Linear uses', async () => {
    const client = mockGqlClient({
      projectRelationCreate: {
        success: true,
        projectRelation: { id: "rel-1" },
      },
    });

    await expect(
      createProjectRelation(client, {
        projectId: asUuid("proj-1"),
        relatedProjectId: asUuid("proj-2"),
        anchorType: "end",
        relatedAnchorType: "start",
      }),
    ).resolves.toEqual({ id: "rel-1" });

    expect(client.request).toHaveBeenCalledWith(CreateProjectRelationDocument, {
      input: {
        projectId: "proj-1",
        relatedProjectId: "proj-2",
        anchorType: "end",
        relatedAnchorType: "start",
        type: "dependency",
      },
    });
  });

  it("passes milestone anchors through", async () => {
    const client = mockGqlClient({
      projectRelationCreate: {
        success: true,
        projectRelation: { id: "rel-1" },
      },
    });

    await createProjectRelation(client, {
      projectId: asUuid("proj-1"),
      relatedProjectId: asUuid("proj-2"),
      anchorType: "end",
      relatedAnchorType: "start",
      projectMilestoneId: asUuid("ms-1"),
      relatedProjectMilestoneId: asUuid("ms-2"),
    });

    expect(client.request).toHaveBeenCalledWith(
      CreateProjectRelationDocument,
      expect.objectContaining({
        input: expect.objectContaining({
          projectMilestoneId: "ms-1",
          relatedProjectMilestoneId: "ms-2",
        }),
      }),
    );
  });

  it("names both endpoints when the mutation fails", async () => {
    const client = mockGqlClient({
      projectRelationCreate: { success: false, projectRelation: null },
    });

    await expect(
      createProjectRelation(client, {
        projectId: asUuid("proj-1"),
        relatedProjectId: asUuid("proj-2"),
        anchorType: "end",
        relatedAnchorType: "start",
      }),
    ).rejects.toThrow('Failed to relate project "proj-1" to "proj-2"');
  });
});

describe("updateProjectRelation", () => {
  it("forwards a null milestone to detach the anchor", async () => {
    const client = mockGqlClient({
      projectRelationUpdate: {
        success: true,
        projectRelation: { id: "rel-1" },
      },
    });

    await updateProjectRelation(client, asUuid("rel-1"), {
      projectMilestoneId: null,
      anchorType: "start",
    });

    expect(client.request).toHaveBeenCalledWith(UpdateProjectRelationDocument, {
      id: "rel-1",
      input: { projectMilestoneId: null, anchorType: "start" },
    });
  });

  it("throws when the mutation reports failure", async () => {
    const client = mockGqlClient({
      projectRelationUpdate: { success: false, projectRelation: null },
    });

    await expect(
      updateProjectRelation(client, asUuid("rel-1"), { anchorType: "start" }),
    ).rejects.toThrow('Failed to update project relation "rel-1"');
  });
});

describe("deleteProjectRelation", () => {
  it("returns the deleted id", async () => {
    const client = mockGqlClient({
      projectRelationDelete: { success: true, entityId: "rel-1" },
    });

    await expect(
      deleteProjectRelation(client, asUuid("rel-1")),
    ).resolves.toEqual({ id: "rel-1", success: true });

    expect(client.request).toHaveBeenCalledWith(DeleteProjectRelationDocument, {
      id: "rel-1",
    });
  });

  it("throws when the mutation reports failure", async () => {
    const client = mockGqlClient({
      projectRelationDelete: { success: false, entityId: null },
    });

    await expect(
      deleteProjectRelation(client, asUuid("rel-1")),
    ).rejects.toThrow('Failed to delete project relation "rel-1"');
  });
});
