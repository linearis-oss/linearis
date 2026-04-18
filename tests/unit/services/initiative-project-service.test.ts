import { describe, expect, it, vi } from "vitest";
import type { GraphQLClient } from "../../../src/client/graphql-client.js";
import {
  createInitiativeProjectLink,
  deleteInitiativeProjectLink,
} from "../../../src/services/initiative-project-service.js";

function mockGqlClient(response: Record<string, unknown>): GraphQLClient {
  return {
    request: vi.fn().mockResolvedValue(response),
  } as unknown as GraphQLClient;
}

describe("createInitiativeProjectLink", () => {
  it("returns created initiative-project link on success", async () => {
    const link = {
      id: "link-1",
      initiative: { id: "init-1", name: "Growth" },
      project: { id: "proj-1", name: "Website" },
    };
    const client = mockGqlClient({
      initiativeToProjectCreate: {
        success: true,
        initiativeToProject: link,
      },
    });

    await expect(
      createInitiativeProjectLink(client, {
        initiativeId: "init-1",
        projectId: "proj-1",
      }),
    ).resolves.toEqual(link);
  });

  it("throws when mutation success is false or payload missing", async () => {
    const client = mockGqlClient({
      initiativeToProjectCreate: {
        success: true,
        initiativeToProject: null,
      },
    });

    await expect(
      createInitiativeProjectLink(client, {
        initiativeId: "init-1",
        projectId: "proj-1",
      }),
    ).rejects.toThrow(
      'Failed to create initiative-project link for initiative "init-1" and project "proj-1"',
    );
  });
});

describe("deleteInitiativeProjectLink", () => {
  it("returns id and success on delete", async () => {
    const client = mockGqlClient({
      initiativeToProjectDelete: {
        success: true,
        entityId: "link-1",
      },
    });

    await expect(
      deleteInitiativeProjectLink(client, "link-1"),
    ).resolves.toEqual({
      id: "link-1",
      success: true,
    });
  });

  it("throws when mutation success is false or payload missing", async () => {
    const client = mockGqlClient({
      initiativeToProjectDelete: {
        success: true,
        entityId: null,
      },
    });

    await expect(deleteInitiativeProjectLink(client, "link-1")).rejects.toThrow(
      'Failed to delete initiative-project link "link-1"',
    );
  });
});
