import { describe, expect, it, vi } from "vitest";
import type { GraphQLClient } from "../../../src/client/graphql-client.js";
import { asUuid } from "../../../src/common/identifier.js";
import { resolveProjectRelation } from "../../../src/resolvers/project-relation-resolver.js";

const PROJECT_A = "550e8400-e29b-41d4-a716-446655440000";
const PROJECT_B = "550e8400-e29b-41d4-a716-446655440001";
const RELATION = "550e8400-e29b-41d4-a716-4466554400ff";

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
