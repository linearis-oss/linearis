import { describe, expect, it, vi } from "vitest";
import type { GraphQLClient } from "../../../src/client/graphql-client.js";
import { asUuid } from "../../../src/common/identifier.js";
import { resolveProjectRelation } from "../../../src/resolvers/project-relation-resolver.js";

const PROJECT_A = "550e8400-e29b-41d4-a716-446655440000";
const PROJECT_B = "550e8400-e29b-41d4-a716-446655440001";
const RELATION = "550e8400-e29b-41d4-a716-4466554400ff";
const OTHER_RELATION = "550e8400-e29b-41d4-a716-4466554400fe";
const MILESTONE = "550e8400-e29b-41d4-a716-446655440010";

interface RelationPage {
  nodes: unknown[];
  hasNextPage?: boolean;
}

function connection({ nodes, hasNextPage = false }: RelationPage): unknown {
  return { nodes, pageInfo: { hasNextPage } };
}

function mockGqlClient(project: unknown): GraphQLClient {
  return {
    request: vi.fn().mockResolvedValue({ project }),
  } as unknown as GraphQLClient;
}

describe("resolveProjectRelation", () => {
  it("returns a bare UUID as-is without calling the API", async () => {
    const client = mockGqlClient(null);

    await expect(resolveProjectRelation(client, RELATION)).resolves.toEqual({
      id: RELATION,
      inverted: false,
    });
    expect(client.request).not.toHaveBeenCalled();
  });

  it("finds the relation the project declares", async () => {
    const client = mockGqlClient({
      relations: connection({
        nodes: [{ id: RELATION, relatedProject: { id: PROJECT_B } }],
      }),
      inverseRelations: connection({ nodes: [] }),
    });

    await expect(
      resolveProjectRelation(client, PROJECT_A, asUuid(PROJECT_B)),
    ).resolves.toEqual({ id: RELATION, inverted: false });
  });

  it("reports the inverted direction when the other project declared it", async () => {
    const client = mockGqlClient({
      relations: connection({ nodes: [] }),
      inverseRelations: connection({
        nodes: [{ id: RELATION, project: { id: PROJECT_B } }],
      }),
    });

    await expect(
      resolveProjectRelation(client, PROJECT_A, asUuid(PROJECT_B)),
    ).resolves.toEqual({ id: RELATION, inverted: true });
  });

  it("lists the candidates when the pair carries several relations", async () => {
    const client = mockGqlClient({
      relations: connection({
        nodes: [
          {
            id: RELATION,
            type: "blocks",
            project: { id: PROJECT_A, name: "Alpha" },
            projectMilestone: { id: MILESTONE, name: "M1" },
            relatedProject: { id: PROJECT_B, name: "Beta" },
            relatedProjectMilestone: null,
          },
          {
            id: OTHER_RELATION,
            type: "blocks",
            project: { id: PROJECT_A, name: "Alpha" },
            projectMilestone: { id: MILESTONE, name: "M2" },
            relatedProject: { id: PROJECT_B, name: "Beta" },
            relatedProjectMilestone: null,
          },
        ],
      }),
      inverseRelations: connection({ nodes: [] }),
    });

    const error = await resolveProjectRelation(
      client,
      PROJECT_A,
      asUuid(PROJECT_B),
    ).catch((caught: unknown) => caught as Error);

    expect(error.message).toContain(
      `Multiple project relations found matching "between ${PROJECT_A} and ${PROJECT_B}"`,
    );
    expect(error.message).toContain(`Alpha/M1 blocks Beta (${RELATION})`);
    expect(error.message).toContain(`Alpha/M2 blocks Beta (${OTHER_RELATION})`);
    expect(error.message).toContain("address the relation by UUID");
  });

  it("does not prefer the forward direction when both directions match", async () => {
    const client = mockGqlClient({
      relations: connection({
        nodes: [
          {
            id: RELATION,
            type: "blocks",
            project: { id: PROJECT_A, name: "Alpha" },
            projectMilestone: null,
            relatedProject: { id: PROJECT_B, name: "Beta" },
            relatedProjectMilestone: null,
          },
        ],
      }),
      inverseRelations: connection({
        nodes: [
          {
            id: OTHER_RELATION,
            type: "blocks",
            project: { id: PROJECT_B, name: "Beta" },
            projectMilestone: null,
            relatedProject: { id: PROJECT_A, name: "Alpha" },
            relatedProjectMilestone: null,
          },
        ],
      }),
    });

    await expect(
      resolveProjectRelation(client, PROJECT_A, asUuid(PROJECT_B)),
    ).rejects.toThrow("Multiple project relations found");
  });

  it("throws when the two projects are not related", async () => {
    const client = mockGqlClient({
      relations: connection({ nodes: [] }),
      inverseRelations: connection({ nodes: [] }),
    });

    await expect(
      resolveProjectRelation(client, PROJECT_A, asUuid(PROJECT_B)),
    ).rejects.toThrow(
      `Project relation "between ${PROJECT_A} and ${PROJECT_B}" not found`,
    );
  });

  it("reports the page bound rather than a false miss", async () => {
    const client = mockGqlClient({
      relations: connection({ nodes: [], hasNextPage: true }),
      inverseRelations: connection({ nodes: [] }),
    });

    await expect(
      resolveProjectRelation(client, PROJECT_A, asUuid(PROJECT_B)),
    ).rejects.toThrow("more than 100 dependencies in one direction");
  });

  it("throws when the project does not exist", async () => {
    const client = mockGqlClient(null);

    await expect(
      resolveProjectRelation(client, PROJECT_A, asUuid(PROJECT_B)),
    ).rejects.toThrow(`Project "${PROJECT_A}" not found`);
  });

  it("rejects a non-UUID relation given without a counterpart", async () => {
    const client = mockGqlClient(null);

    await expect(resolveProjectRelation(client, "not-a-uuid")).rejects.toThrow(
      'Project relation "not-a-uuid" not found',
    );
  });
});
