import { type DocumentNode, type FragmentDefinitionNode, Kind } from "graphql";
import { describe, expect, it, vi } from "vitest";
import type { GraphQLClient } from "../../../src/client/graphql-client.js";
import { GetInitiativeDocument } from "../../../src/gql/graphql.js";
import {
  archiveInitiative,
  createInitiative,
  deleteInitiative,
  getInitiative,
  listInitiatives,
  unarchiveInitiative,
  updateInitiative,
} from "../../../src/services/initiative-service.js";

function mockGqlClient(response: Record<string, unknown>): GraphQLClient {
  return {
    request: vi.fn().mockResolvedValue(response),
  } as unknown as GraphQLClient;
}

function getFragment(
  document: DocumentNode,
  name: string,
): FragmentDefinitionNode {
  const fragment = document.definitions.find(
    (definition): definition is FragmentDefinitionNode =>
      definition.kind === Kind.FRAGMENT_DEFINITION &&
      definition.name.value === name,
  );

  if (!fragment) {
    throw new Error(`Fragment ${name} not found`);
  }

  return fragment;
}

describe("initiative reaction-aware read documents", () => {
  it("keeps initiative detail reads free of out-of-scope reaction fragments", () => {
    const baseFragment = getFragment(
      GetInitiativeDocument,
      "InitiativeExpandedFields",
    );

    expect(
      baseFragment.selectionSet.selections
        .filter((selection) => selection.kind === Kind.FIELD)
        .map((selection) => selection.name.value),
    ).toContain("initiativeUpdates");

    expect(() =>
      getFragment(GetInitiativeDocument, "InitiativeUpdateFieldsWithReactions"),
    ).toThrow("Fragment InitiativeUpdateFieldsWithReactions not found");

    expect(() =>
      getFragment(GetInitiativeDocument, "InitiativeFieldsWithReactions"),
    ).toThrow("Fragment InitiativeFieldsWithReactions not found");
  });
});

describe("listInitiatives", () => {
  it("forwards pagination, includeArchived, filter, and orderBy", async () => {
    const client = mockGqlClient({
      initiatives: {
        nodes: [],
        pageInfo: { hasNextPage: false, endCursor: null },
      },
    });

    await listInitiatives(client, {
      limit: 10,
      after: "cursor-1",
      includeArchived: true,
      filter: { name: { eqIgnoreCase: "Growth" } },
      orderBy: "createdAt",
    });

    expect(client.request).toHaveBeenCalledWith(expect.anything(), {
      first: 10,
      after: "cursor-1",
      includeArchived: true,
      filter: { name: { eqIgnoreCase: "Growth" } },
      orderBy: "createdAt",
      sort: undefined,
    });
  });

  it("propagates GraphQL request failures", async () => {
    const expectedError = new Error("network exploded");
    const client = {
      request: vi.fn().mockRejectedValue(expectedError),
    } as unknown as GraphQLClient;

    await expect(listInitiatives(client)).rejects.toBe(expectedError);
  });
});

describe("getInitiative", () => {
  it("returns initiative when found", async () => {
    const client = mockGqlClient({
      initiative: {
        id: "init-1",
        name: "Growth",
      },
    });

    await expect(getInitiative(client, "init-1")).resolves.toEqual({
      id: "init-1",
      name: "Growth",
    });
  });

  it("throws when initiative is not found", async () => {
    const client = mockGqlClient({ initiative: null });

    await expect(getInitiative(client, "missing")).rejects.toThrow(
      'Initiative with ID "missing" not found',
    );
  });
});

describe("createInitiative", () => {
  it("returns created initiative on success", async () => {
    const client = mockGqlClient({
      initiativeCreate: {
        success: true,
        initiative: { id: "init-1", name: "Growth" },
      },
    });

    await expect(createInitiative(client, { name: "Growth" })).resolves.toEqual(
      {
        id: "init-1",
        name: "Growth",
      },
    );
  });

  it("throws when mutation success is false or payload missing", async () => {
    const client = mockGqlClient({
      initiativeCreate: { success: false, initiative: null },
    });

    await expect(createInitiative(client, { name: "Growth" })).rejects.toThrow(
      'Failed to create initiative "Growth"',
    );
  });
});

describe("updateInitiative", () => {
  it("rejects empty update input", async () => {
    const client = mockGqlClient({});

    await expect(updateInitiative(client, "init-1", {})).rejects.toThrow(
      "Invalid update options: at least one update field must be provided",
    );
  });

  it("returns updated initiative on success", async () => {
    const client = mockGqlClient({
      initiativeUpdate: {
        success: true,
        initiative: { id: "init-1", name: "Updated" },
      },
    });

    await expect(
      updateInitiative(client, "init-1", { name: "Updated" }),
    ).resolves.toEqual({
      id: "init-1",
      name: "Updated",
    });
  });

  it("throws when mutation success is false or payload missing", async () => {
    const client = mockGqlClient({
      initiativeUpdate: { success: false, initiative: null },
    });

    await expect(
      updateInitiative(client, "init-1", { name: "Updated" }),
    ).rejects.toThrow('Failed to update initiative "init-1"');
  });
});

describe("archiveInitiative", () => {
  it("returns archived initiative entity on success", async () => {
    const client = mockGqlClient({
      initiativeArchive: {
        success: true,
        entity: { id: "init-1", name: "Growth" },
      },
    });

    await expect(archiveInitiative(client, "init-1")).resolves.toEqual({
      id: "init-1",
      name: "Growth",
    });
  });

  it("throws when mutation success is false or payload missing", async () => {
    const client = mockGqlClient({
      initiativeArchive: { success: false, entity: null },
    });

    await expect(archiveInitiative(client, "init-1")).rejects.toThrow(
      'Failed to archive initiative "init-1"',
    );
  });
});

describe("unarchiveInitiative", () => {
  it("returns unarchived initiative entity on success", async () => {
    const client = mockGqlClient({
      initiativeUnarchive: {
        success: true,
        entity: { id: "init-1", name: "Growth" },
      },
    });

    await expect(unarchiveInitiative(client, "init-1")).resolves.toEqual({
      id: "init-1",
      name: "Growth",
    });
  });

  it("throws when mutation success is false or payload missing", async () => {
    const client = mockGqlClient({
      initiativeUnarchive: { success: false, entity: null },
    });

    await expect(unarchiveInitiative(client, "init-1")).rejects.toThrow(
      'Failed to unarchive initiative "init-1"',
    );
  });
});

describe("deleteInitiative", () => {
  it("returns delete payload on success", async () => {
    const client = mockGqlClient({
      initiativeDelete: { success: true, entityId: "init-1" },
    });

    await expect(deleteInitiative(client, "init-1")).resolves.toEqual({
      id: "init-1",
      success: true,
    });
  });

  it("throws when mutation success is false or payload missing", async () => {
    const client = mockGqlClient({
      initiativeDelete: { success: false, entityId: null },
    });

    await expect(deleteInitiative(client, "init-1")).rejects.toThrow(
      'Failed to delete initiative "init-1"',
    );
  });
});
