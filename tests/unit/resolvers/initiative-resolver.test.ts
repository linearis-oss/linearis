import { describe, expect, it, vi } from "vitest";
import type { GraphQLClient } from "../../../src/client/graphql-client.js";
import type { LinearSdkClient } from "../../../src/client/linear-client.js";
import {
  resolveInitiativeId,
  resolveInitiativeProjectLinkId,
  resolveInitiativeRelationId,
} from "../../../src/resolvers/initiative-resolver.js";

type InitiativeLookupNode = {
  id: string;
  name: string;
};

function mockSdkClient(nodes: InitiativeLookupNode[]) {
  return {
    sdk: {
      initiatives: vi.fn().mockResolvedValue({ nodes }),
    },
  } as unknown as LinearSdkClient;
}

function mockGqlClient(response: Record<string, unknown>) {
  return {
    request: vi.fn().mockResolvedValue(response),
  } as unknown as GraphQLClient;
}

function mockPagedGqlClient(responses: Array<Record<string, unknown>>) {
  const request = vi.fn();

  responses.forEach((response) => {
    request.mockResolvedValueOnce(response);
  });

  return {
    request,
  } as unknown as GraphQLClient;
}

describe("resolveInitiativeId", () => {
  it("returns UUID as-is", async () => {
    const sdk = mockSdkClient([]);
    const result = await resolveInitiativeId(
      sdk,
      "550e8400-e29b-41d4-a716-446655440000",
    );

    expect(result).toBe("550e8400-e29b-41d4-a716-446655440000");
    expect(sdk.sdk.initiatives).not.toHaveBeenCalled();
  });

  it("resolves initiative name", async () => {
    const sdk = mockSdkClient([{ id: "init-1", name: "Growth" }]);

    await expect(resolveInitiativeId(sdk, "growth")).resolves.toBe("init-1");
    expect(sdk.sdk.initiatives).toHaveBeenCalledWith({
      filter: { name: { eqIgnoreCase: "growth" } },
      first: 20,
    });
  });

  it("throws not found", async () => {
    const sdk = mockSdkClient([]);

    await expect(resolveInitiativeId(sdk, "Missing")).rejects.toThrow(
      'Initiative "Missing" not found',
    );
  });

  it("throws ambiguity without scope", async () => {
    const sdk = mockSdkClient([
      { id: "init-1", name: "Growth" },
      { id: "init-2", name: "Growth" },
    ]);

    await expect(resolveInitiativeId(sdk, "Growth")).rejects.toThrow(
      "Multiple initiatives found matching",
    );
    await expect(resolveInitiativeId(sdk, "Growth")).rejects.toThrow(
      "provide --team or --owner, or use UUID",
    );
  });

  it("resolves scoped disambiguation", async () => {
    const sdk = mockSdkClient([{ id: "init-2", name: "Growth" }]);

    await expect(
      resolveInitiativeId(sdk, "Growth", {
        teamId: "team-1",
        ownerId: "user-1",
      }),
    ).resolves.toBe("init-2");

    expect(sdk.sdk.initiatives).toHaveBeenCalledWith({
      filter: {
        and: [
          { name: { eqIgnoreCase: "Growth" } },
          { teams: { some: { id: { eq: "team-1" } } } },
          { owner: { id: { eq: "user-1" } } },
        ],
      },
      first: 20,
    });
  });
});

describe("resolveInitiativeRelationId", () => {
  it("returns relation id for exact parent-child pair", async () => {
    const gql = mockGqlClient({
      parent: { id: "parent-id" },
      child: { id: "child-id" },
      initiativeRelations: {
        nodes: [
          {
            id: "rel-other",
            initiative: { id: "someone-else" },
            relatedInitiative: { id: "child-id" },
          },
          {
            id: "rel-1",
            initiative: { id: "parent-id" },
            relatedInitiative: { id: "child-id" },
          },
        ],
        pageInfo: { hasNextPage: false, endCursor: null },
      },
    });

    await expect(
      resolveInitiativeRelationId(gql, "parent-id", "child-id"),
    ).resolves.toBe("rel-1");
  });

  it("throws when relation pair does not exist", async () => {
    const gql = mockGqlClient({
      parent: { id: "parent-id" },
      child: { id: "child-id" },
      initiativeRelations: {
        nodes: [],
        pageInfo: { hasNextPage: false, endCursor: null },
      },
    });

    await expect(
      resolveInitiativeRelationId(gql, "parent-id", "child-id"),
    ).rejects.toThrow(
      'Initiative relation "between parent-id and child-id" not found',
    );
  });

  it("continues pagination and finds relation on later page", async () => {
    const gql = mockPagedGqlClient([
      {
        parent: { id: "parent-id" },
        child: { id: "child-id" },
        initiativeRelations: {
          nodes: [
            {
              id: "rel-other",
              initiative: { id: "wrong-parent" },
              relatedInitiative: { id: "wrong-child" },
            },
          ],
          pageInfo: { hasNextPage: true, endCursor: "cursor-1" },
        },
      },
      {
        parent: { id: "parent-id" },
        child: { id: "child-id" },
        initiativeRelations: {
          nodes: [
            {
              id: "rel-2",
              initiative: { id: "parent-id" },
              relatedInitiative: { id: "child-id" },
            },
          ],
          pageInfo: { hasNextPage: false, endCursor: null },
        },
      },
    ]);

    await expect(
      resolveInitiativeRelationId(gql, "parent-id", "child-id"),
    ).resolves.toBe("rel-2");

    expect(gql.request).toHaveBeenNthCalledWith(1, expect.anything(), {
      parentId: "parent-id",
      childId: "child-id",
      after: undefined,
    });
    expect(gql.request).toHaveBeenNthCalledWith(2, expect.anything(), {
      parentId: "parent-id",
      childId: "child-id",
      after: "cursor-1",
    });
  });

  it("throws when relation pair is not found after exhausting pages", async () => {
    const gql = mockPagedGqlClient([
      {
        parent: { id: "parent-id" },
        child: { id: "child-id" },
        initiativeRelations: {
          nodes: [],
          pageInfo: { hasNextPage: true, endCursor: "cursor-1" },
        },
      },
      {
        parent: { id: "parent-id" },
        child: { id: "child-id" },
        initiativeRelations: {
          nodes: [],
          pageInfo: { hasNextPage: false, endCursor: null },
        },
      },
    ]);

    await expect(
      resolveInitiativeRelationId(gql, "parent-id", "child-id"),
    ).rejects.toThrow(
      'Initiative relation "between parent-id and child-id" not found',
    );
  });
});

describe("resolveInitiativeProjectLinkId", () => {
  it("returns link id for exact initiative-project pair", async () => {
    const gql = mockGqlClient({
      initiative: { id: "init-id" },
      project: { id: "project-id" },
      initiativeToProjects: {
        nodes: [
          {
            id: "link-other",
            initiative: { id: "another-init" },
            project: { id: "project-id" },
          },
          {
            id: "link-1",
            initiative: { id: "init-id" },
            project: { id: "project-id" },
          },
        ],
        pageInfo: { hasNextPage: false, endCursor: null },
      },
    });

    await expect(
      resolveInitiativeProjectLinkId(gql, "init-id", "project-id"),
    ).resolves.toBe("link-1");
  });

  it("throws when initiative-project pair does not exist", async () => {
    const gql = mockGqlClient({
      initiative: { id: "init-id" },
      project: { id: "project-id" },
      initiativeToProjects: {
        nodes: [],
        pageInfo: { hasNextPage: false, endCursor: null },
      },
    });

    await expect(
      resolveInitiativeProjectLinkId(gql, "init-id", "project-id"),
    ).rejects.toThrow(
      'Initiative project link "between init-id and project-id" not found',
    );
  });

  it("continues pagination and finds link on later page", async () => {
    const gql = mockPagedGqlClient([
      {
        initiative: { id: "init-id" },
        project: { id: "project-id" },
        initiativeToProjects: {
          nodes: [
            {
              id: "link-other",
              initiative: { id: "wrong-init" },
              project: { id: "wrong-project" },
            },
          ],
          pageInfo: { hasNextPage: true, endCursor: "cursor-1" },
        },
      },
      {
        initiative: { id: "init-id" },
        project: { id: "project-id" },
        initiativeToProjects: {
          nodes: [
            {
              id: "link-2",
              initiative: { id: "init-id" },
              project: { id: "project-id" },
            },
          ],
          pageInfo: { hasNextPage: false, endCursor: null },
        },
      },
    ]);

    await expect(
      resolveInitiativeProjectLinkId(gql, "init-id", "project-id"),
    ).resolves.toBe("link-2");

    expect(gql.request).toHaveBeenNthCalledWith(1, expect.anything(), {
      initiativeId: "init-id",
      projectId: "project-id",
      after: undefined,
    });
    expect(gql.request).toHaveBeenNthCalledWith(2, expect.anything(), {
      initiativeId: "init-id",
      projectId: "project-id",
      after: "cursor-1",
    });
  });

  it("throws when initiative-project pair is not found after exhausting pages", async () => {
    const gql = mockPagedGqlClient([
      {
        initiative: { id: "init-id" },
        project: { id: "project-id" },
        initiativeToProjects: {
          nodes: [],
          pageInfo: { hasNextPage: true, endCursor: "cursor-1" },
        },
      },
      {
        initiative: { id: "init-id" },
        project: { id: "project-id" },
        initiativeToProjects: {
          nodes: [],
          pageInfo: { hasNextPage: false, endCursor: null },
        },
      },
    ]);

    await expect(
      resolveInitiativeProjectLinkId(gql, "init-id", "project-id"),
    ).rejects.toThrow(
      'Initiative project link "between init-id and project-id" not found',
    );
  });
});
