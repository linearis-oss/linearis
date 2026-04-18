import { describe, expect, it, vi } from "vitest";
import type { GraphQLClient } from "../../../src/client/graphql-client.js";
import {
  CreateInitiativeRelationDocument,
  DeleteInitiativeRelationDocument,
} from "../../../src/gql/graphql.js";
import {
  createInitiativeRelation,
  deleteInitiativeRelation,
} from "../../../src/services/initiative-relation-service.js";

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

describe("createInitiativeRelation", () => {
  it("returns created initiative relation on success", async () => {
    const relation = {
      id: "rel-1",
      initiative: { id: "init-parent", name: "Parent" },
      relatedInitiative: { id: "init-child", name: "Child" },
    };
    const { client, request } = mockGqlClient({
      initiativeRelationCreate: {
        success: true,
        initiativeRelation: relation,
      },
    });

    await expect(
      createInitiativeRelation(client, {
        parentId: "init-parent",
        childId: "init-child",
      }),
    ).resolves.toEqual(relation);

    expect(request).toHaveBeenCalledWith(CreateInitiativeRelationDocument, {
      input: {
        initiativeId: "init-parent",
        relatedInitiativeId: "init-child",
      },
    });
  });

  it("throws when mutation success is false", async () => {
    const { client } = mockGqlClient({
      initiativeRelationCreate: {
        success: false,
        initiativeRelation: {
          id: "rel-1",
        },
      },
    });

    await expect(
      createInitiativeRelation(client, {
        parentId: "init-parent",
        childId: "init-child",
      }),
    ).rejects.toThrow(
      'Failed to create initiative relation from "init-parent" to "init-child"',
    );
  });

  it("throws when payload is missing", async () => {
    const { client } = mockGqlClient({
      initiativeRelationCreate: {
        success: true,
        initiativeRelation: null,
      },
    });

    await expect(
      createInitiativeRelation(client, {
        parentId: "init-parent",
        childId: "init-child",
      }),
    ).rejects.toThrow(
      'Failed to create initiative relation from "init-parent" to "init-child"',
    );
  });
});

describe("deleteInitiativeRelation", () => {
  it("returns id and success on delete", async () => {
    const { client, request } = mockGqlClient({
      initiativeRelationDelete: {
        success: true,
        entityId: "rel-1",
      },
    });

    await expect(deleteInitiativeRelation(client, "rel-1")).resolves.toEqual({
      id: "rel-1",
      success: true,
    });

    expect(request).toHaveBeenCalledWith(DeleteInitiativeRelationDocument, {
      id: "rel-1",
    });
  });

  it("throws when mutation success is false", async () => {
    const { client } = mockGqlClient({
      initiativeRelationDelete: {
        success: false,
        entityId: "rel-1",
      },
    });

    await expect(deleteInitiativeRelation(client, "rel-1")).rejects.toThrow(
      'Failed to delete initiative relation "rel-1"',
    );
  });

  it("throws when payload is missing", async () => {
    const { client } = mockGqlClient({
      initiativeRelationDelete: {
        success: true,
        entityId: null,
      },
    });

    await expect(deleteInitiativeRelation(client, "rel-1")).rejects.toThrow(
      'Failed to delete initiative relation "rel-1"',
    );
  });
});
