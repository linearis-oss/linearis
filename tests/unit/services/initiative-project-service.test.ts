import { describe, expect, it, vi } from "vitest";
import type { GraphQLClient } from "../../../src/client/graphql-client.js";
import { asUuid } from "../../../src/common/identifier.js";
import {
  CreateInitiativeToProjectDocument,
  DeleteInitiativeToProjectDocument,
} from "../../../src/gql/graphql.js";
import {
  createInitiativeProjectLink,
  deleteInitiativeProjectLink,
} from "../../../src/services/initiative-project-service.js";

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

describe("createInitiativeProjectLink", () => {
  it("returns created initiative-project link on success", async () => {
    const link = {
      id: "link-1",
      initiative: { id: "init-1", name: "Growth" },
      project: { id: "proj-1", name: "Website" },
    };
    const { client, request } = mockGqlClient({
      initiativeToProjectCreate: {
        success: true,
        initiativeToProject: link,
      },
    });

    await expect(
      createInitiativeProjectLink(client, {
        initiativeId: asUuid("init-1"),
        projectId: asUuid("proj-1"),
      }),
    ).resolves.toEqual(link);

    expect(request).toHaveBeenCalledWith(CreateInitiativeToProjectDocument, {
      input: {
        initiativeId: "init-1",
        projectId: "proj-1",
      },
    });
  });

  it("throws when mutation success is false", async () => {
    const { client } = mockGqlClient({
      initiativeToProjectCreate: {
        success: false,
        initiativeToProject: {
          id: "link-1",
        },
      },
    });

    await expect(
      createInitiativeProjectLink(client, {
        initiativeId: asUuid("init-1"),
        projectId: asUuid("proj-1"),
      }),
    ).rejects.toThrow(
      'Failed to create initiative-project link for initiative "init-1" and project "proj-1"',
    );
  });

  it("throws when payload is missing", async () => {
    const { client } = mockGqlClient({
      initiativeToProjectCreate: {
        success: true,
        initiativeToProject: null,
      },
    });

    await expect(
      createInitiativeProjectLink(client, {
        initiativeId: asUuid("init-1"),
        projectId: asUuid("proj-1"),
      }),
    ).rejects.toThrow(
      'Failed to create initiative-project link for initiative "init-1" and project "proj-1"',
    );
  });
});

describe("deleteInitiativeProjectLink", () => {
  it("returns id and success on delete", async () => {
    const { client, request } = mockGqlClient({
      initiativeToProjectDelete: {
        success: true,
        entityId: "link-1",
      },
    });

    await expect(
      deleteInitiativeProjectLink(client, asUuid("link-1")),
    ).resolves.toEqual({
      id: "link-1",
      success: true,
    });

    expect(request).toHaveBeenCalledWith(DeleteInitiativeToProjectDocument, {
      id: "link-1",
    });
  });

  it("throws when mutation success is false", async () => {
    const { client } = mockGqlClient({
      initiativeToProjectDelete: {
        success: false,
        entityId: "link-1",
      },
    });

    await expect(
      deleteInitiativeProjectLink(client, asUuid("link-1")),
    ).rejects.toThrow('Failed to delete initiative-project link "link-1"');
  });

  it("throws when payload is missing", async () => {
    const { client } = mockGqlClient({
      initiativeToProjectDelete: {
        success: true,
        entityId: null,
      },
    });

    await expect(
      deleteInitiativeProjectLink(client, asUuid("link-1")),
    ).rejects.toThrow('Failed to delete initiative-project link "link-1"');
  });
});
