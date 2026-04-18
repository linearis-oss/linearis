import { describe, expect, it, vi } from "vitest";
import type { GraphQLClient } from "../../../src/client/graphql-client.js";
import {
  createInitiativeRelation,
  deleteInitiativeRelation,
} from "../../../src/services/initiative-relation-service.js";

function mockGqlClient(response: Record<string, unknown>): GraphQLClient {
  return {
    request: vi.fn().mockResolvedValue(response),
  } as unknown as GraphQLClient;
}

describe("createInitiativeRelation", () => {
  it("returns created initiative relation on success", async () => {
    const relation = {
      id: "rel-1",
      initiative: { id: "init-parent", name: "Parent" },
      relatedInitiative: { id: "init-child", name: "Child" },
    };
    const client = mockGqlClient({
      initiativeRelationCreate: {
        success: true,
        initiativeRelation: relation,
      },
    });

    await expect(
      createInitiativeRelation(client, {
        parentId: "init-parent",
        initiativeId: "init-child",
      }),
    ).resolves.toEqual(relation);
  });

  it("throws when mutation success is false or payload missing", async () => {
    const client = mockGqlClient({
      initiativeRelationCreate: {
        success: true,
        initiativeRelation: null,
      },
    });

    await expect(
      createInitiativeRelation(client, {
        parentId: "init-parent",
        initiativeId: "init-child",
      }),
    ).rejects.toThrow(
      'Failed to create initiative relation from "init-parent" to "init-child"',
    );
  });
});

describe("deleteInitiativeRelation", () => {
  it("returns id and success on delete", async () => {
    const client = mockGqlClient({
      initiativeRelationDelete: {
        success: true,
        entityId: "rel-1",
      },
    });

    await expect(deleteInitiativeRelation(client, "rel-1")).resolves.toEqual({
      id: "rel-1",
      success: true,
    });
  });

  it("throws when mutation success is false or payload missing", async () => {
    const client = mockGqlClient({
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
