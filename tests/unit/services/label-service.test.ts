import { describe, expect, it, vi } from "vitest";
import type { GraphQLClient } from "../../../src/client/graphql-client.js";
import { asUuid } from "../../../src/common/identifier.js";
import {
  CreateProjectLabelDocument,
  DeleteProjectLabelDocument,
  GetProjectLabelDocument,
  RestoreProjectLabelDocument,
  RetireIssueLabelDocument,
  RetireProjectLabelDocument,
  UpdateProjectLabelDocument,
} from "../../../src/gql/graphql.js";
import {
  createLabel,
  deleteLabel,
  getLabel,
  listLabels,
  listProjectLabels,
  restoreLabel,
  retireLabel,
  updateLabel,
} from "../../../src/services/label-service.js";

function mockGqlClient(response: Record<string, unknown>): GraphQLClient {
  return {
    request: vi.fn().mockResolvedValue(response),
  } as unknown as GraphQLClient;
}

describe("getLabel", () => {
  it("returns a label by id", async () => {
    const client = mockGqlClient({
      issueLabel: {
        id: "lbl-1",
        name: "Bug",
        color: "#ff0000",
        description: "A bug",
      },
    });

    const result = await getLabel(client, asUuid("lbl-1"));

    expect(result).toEqual({
      id: "lbl-1",
      name: "Bug",
      color: "#ff0000",
      description: "A bug",
      type: "issue",
    });
  });

  it("throws when label not found", async () => {
    const client = mockGqlClient({ issueLabel: null });

    await expect(getLabel(client, asUuid("lbl-1"))).rejects.toThrow(
      'Label with ID "lbl-1" not found',
    );
  });
});

describe("createLabel", () => {
  it("returns created issue label with type", async () => {
    const client = mockGqlClient({
      issueLabelCreate: {
        success: true,
        issueLabel: {
          id: "lbl-new",
          name: "branch:unmerged",
          color: "#B45309",
          description: "Created from DBL branch workflow",
        },
      },
    });

    const result = await createLabel(client, {
      name: "branch:unmerged",
      teamId: asUuid("team-1"),
      color: "#B45309",
      description: "Created from DBL branch workflow",
    });

    expect(client.request).toHaveBeenCalledWith(expect.anything(), {
      input: {
        name: "branch:unmerged",
        teamId: "team-1",
        color: "#B45309",
        description: "Created from DBL branch workflow",
      },
    });
    expect(result).toEqual({
      id: "lbl-new",
      name: "branch:unmerged",
      color: "#B45309",
      description: "Created from DBL branch workflow",
      type: "issue",
    });
  });

  it("throws on create failure", async () => {
    const client = mockGqlClient({
      issueLabelCreate: {
        success: false,
        issueLabel: {
          id: "lbl-new",
          name: "branch:unmerged",
          color: "#B45309",
          description: null,
        },
      },
    });

    await expect(
      createLabel(client, { name: "branch:unmerged" }),
    ).rejects.toThrow('Failed to create label "branch:unmerged"');
  });

  it("converts null create description to undefined", async () => {
    const client = mockGqlClient({
      issueLabelCreate: {
        success: true,
        issueLabel: {
          id: "lbl-new",
          name: "branch:unmerged",
          color: "#B45309",
          description: null,
        },
      },
    });

    const result = await createLabel(client, { name: "branch:unmerged" });

    expect(result.description).toBeUndefined();
    expect(result.type).toBe("issue");
  });
});

describe("updateLabel", () => {
  it("returns updated issue label", async () => {
    const client = mockGqlClient({
      issueLabelUpdate: {
        success: true,
        issueLabel: {
          id: "lbl-1",
          name: "branch:merged",
          color: "#1D4ED8",
          description: "Updated from DBL branch workflow",
        },
      },
    });

    const result = await updateLabel(client, asUuid("lbl-1"), {
      name: "branch:merged",
      color: "#1D4ED8",
      description: "Updated from DBL branch workflow",
    });

    expect(client.request).toHaveBeenCalledWith(expect.anything(), {
      id: "lbl-1",
      input: {
        name: "branch:merged",
        color: "#1D4ED8",
        description: "Updated from DBL branch workflow",
      },
    });
    expect(result).toEqual({
      id: "lbl-1",
      name: "branch:merged",
      color: "#1D4ED8",
      description: "Updated from DBL branch workflow",
      type: "issue",
    });
  });

  it("throws on update failure", async () => {
    const client = mockGqlClient({
      issueLabelUpdate: {
        success: false,
        issueLabel: {
          id: "lbl-1",
          name: "branch:merged",
          color: "#1D4ED8",
          description: null,
        },
      },
    });

    await expect(
      updateLabel(client, asUuid("lbl-1"), { name: "branch:merged" }),
    ).rejects.toThrow('Failed to update label "lbl-1"');
  });
});

describe("deleteLabel", () => {
  it("returns deleted label id", async () => {
    const client = mockGqlClient({
      issueLabelDelete: {
        success: true,
        entityId: "lbl-1",
      },
    });

    const result = await deleteLabel(client, asUuid("lbl-1"));

    expect(client.request).toHaveBeenCalledWith(expect.anything(), {
      id: "lbl-1",
    });
    expect(result).toEqual({ id: "lbl-1", success: true });
  });

  it("throws on delete failure", async () => {
    const client = mockGqlClient({
      issueLabelDelete: {
        success: false,
        entityId: "lbl-1",
      },
    });

    await expect(deleteLabel(client, asUuid("lbl-1"))).rejects.toThrow(
      'Failed to delete label "lbl-1"',
    );
  });
});

describe("listLabels", () => {
  it("returns issue labels with type", async () => {
    const client = mockGqlClient({
      issueLabels: {
        nodes: [
          { id: "lbl-1", name: "Bug", color: "#ff0000", description: "A bug" },
        ],
        pageInfo: { hasNextPage: false, endCursor: "c1" },
      },
    });

    const result = await listLabels(client);

    expect(result.nodes).toEqual([
      {
        id: "lbl-1",
        name: "Bug",
        color: "#ff0000",
        description: "A bug",
        type: "issue",
      },
    ]);
    expect(result.pageInfo).toEqual({ hasNextPage: false, endCursor: "c1" });
  });

  it("returns empty result", async () => {
    const client = mockGqlClient({
      issueLabels: {
        nodes: [],
        pageInfo: { hasNextPage: false, endCursor: null },
      },
    });

    const result = await listLabels(client);

    expect(result.nodes).toEqual([]);
    expect(result.pageInfo.hasNextPage).toBe(false);
  });

  it("passes after cursor", async () => {
    const client = mockGqlClient({
      issueLabels: {
        nodes: [],
        pageInfo: { hasNextPage: false, endCursor: null },
      },
    });

    await listLabels(client, undefined, { after: "cur1" });

    expect(client.request).toHaveBeenCalledWith(expect.anything(), {
      first: 50,
      after: "cur1",
      filter: undefined,
    });
  });

  it("uses default limit of 50", async () => {
    const client = mockGqlClient({
      issueLabels: {
        nodes: [],
        pageInfo: { hasNextPage: false, endCursor: null },
      },
    });

    await listLabels(client);

    expect(client.request).toHaveBeenCalledWith(expect.anything(), {
      first: 50,
      after: undefined,
      filter: undefined,
    });
  });

  it("filters by team when teamId provided", async () => {
    const client = mockGqlClient({
      issueLabels: {
        nodes: [],
        pageInfo: { hasNextPage: false, endCursor: null },
      },
    });

    await listLabels(client, asUuid("team-1"));

    expect(client.request).toHaveBeenCalledWith(expect.anything(), {
      first: 50,
      after: undefined,
      filter: { team: { id: { eq: "team-1" } } },
    });
  });

  it("filters workspace issue labels by null team", async () => {
    const client = mockGqlClient({
      issueLabels: {
        nodes: [],
        pageInfo: { hasNextPage: false, endCursor: null },
      },
    });

    await listLabels(client, undefined, { scope: "workspace" });

    expect(client.request).toHaveBeenCalledWith(expect.anything(), {
      first: 50,
      after: undefined,
      filter: { team: { null: true } },
    });
  });

  it("keeps team scope on the resolved team filter", async () => {
    const client = mockGqlClient({
      issueLabels: {
        nodes: [],
        pageInfo: { hasNextPage: false, endCursor: null },
      },
    });

    await listLabels(client, asUuid("team-1"), { scope: "team" });

    expect(client.request).toHaveBeenCalledWith(expect.anything(), {
      first: 50,
      after: undefined,
      filter: { team: { id: { eq: "team-1" }, null: false } },
    });
  });

  it("converts null description to undefined", async () => {
    const client = mockGqlClient({
      issueLabels: {
        nodes: [
          { id: "lbl-2", name: "Feature", color: "#00ff00", description: null },
        ],
        pageInfo: { hasNextPage: false, endCursor: null },
      },
    });

    const result = await listLabels(client);

    expect(result.nodes[0]?.description).toBeUndefined();
    expect(result.nodes[0]?.type).toBe("issue");
  });
});

describe("listProjectLabels", () => {
  it("returns project labels with type", async () => {
    const client = mockGqlClient({
      projectLabels: {
        nodes: [
          {
            id: "plbl-1",
            name: "Customer",
            color: "#0000ff",
            description: "Customer-facing",
          },
        ],
        pageInfo: { hasNextPage: false, endCursor: "p1" },
      },
    });

    const result = await listProjectLabels(client);

    expect(result.nodes).toEqual([
      {
        id: "plbl-1",
        name: "Customer",
        color: "#0000ff",
        description: "Customer-facing",
        type: "project",
      },
    ]);
    expect(result.pageInfo).toEqual({ hasNextPage: false, endCursor: "p1" });
  });

  it("uses default limit of 50", async () => {
    const client = mockGqlClient({
      projectLabels: {
        nodes: [],
        pageInfo: { hasNextPage: false, endCursor: null },
      },
    });

    await listProjectLabels(client);

    expect(client.request).toHaveBeenCalledWith(expect.anything(), {
      first: 50,
      after: undefined,
    });
  });

  it("passes pagination without filter", async () => {
    const client = mockGqlClient({
      projectLabels: {
        nodes: [],
        pageInfo: { hasNextPage: false, endCursor: null },
      },
    });

    await listProjectLabels(client, { limit: 25, after: "cur2" });

    expect(client.request).toHaveBeenCalledWith(expect.anything(), {
      first: 25,
      after: "cur2",
    });
  });

  it("converts null description to undefined", async () => {
    const client = mockGqlClient({
      projectLabels: {
        nodes: [
          {
            id: "plbl-2",
            name: "Internal",
            color: "#123456",
            description: null,
          },
        ],
        pageInfo: { hasNextPage: false, endCursor: null },
      },
    });

    const result = await listProjectLabels(client);

    expect(result.nodes[0]?.description).toBeUndefined();
    expect(result.nodes[0]?.type).toBe("project");
  });
});

describe("project label CRUD", () => {
  it("reads a project label and tags it as one", async () => {
    const client = mockGqlClient({
      projectLabel: {
        id: "plbl-1",
        name: "Customer",
        color: "#0000ff",
        isGroup: false,
        retiredAt: null,
        parent: { id: "plbl-0", name: "Tier" },
      },
    });

    await expect(
      getLabel(client, asUuid("plbl-1"), "project"),
    ).resolves.toEqual({
      id: "plbl-1",
      name: "Customer",
      color: "#0000ff",
      type: "project",
      isGroup: false,
      parent: { id: "plbl-0", name: "Tier" },
    });

    expect(client.request).toHaveBeenCalledWith(GetProjectLabelDocument, {
      id: "plbl-1",
    });
  });

  it("throws when the project label is missing", async () => {
    const client = mockGqlClient({ projectLabel: null });

    await expect(getLabel(client, asUuid("plbl-1"), "project")).rejects.toThrow(
      'Project label with ID "plbl-1" not found',
    );
  });

  it("drops teamId on create because project labels have no team", async () => {
    const client = mockGqlClient({
      projectLabelCreate: {
        success: true,
        projectLabel: { id: "plbl-1", name: "Customer", color: "#0000ff" },
      },
    });

    await createLabel(
      client,
      { name: "Customer", color: "#0000ff", teamId: asUuid("team-1") },
      "project",
    );

    expect(client.request).toHaveBeenCalledWith(CreateProjectLabelDocument, {
      input: { name: "Customer", color: "#0000ff" },
    });
  });

  it("throws when project label creation fails", async () => {
    const client = mockGqlClient({
      projectLabelCreate: { success: false, projectLabel: null },
    });

    await expect(
      createLabel(client, { name: "Customer" }, "project"),
    ).rejects.toThrow('Failed to create project label "Customer"');
  });

  it("updates a project label", async () => {
    const client = mockGqlClient({
      projectLabelUpdate: {
        success: true,
        projectLabel: { id: "plbl-1", name: "Client", color: "#0000ff" },
      },
    });

    await expect(
      updateLabel(client, asUuid("plbl-1"), { name: "Client" }, "project"),
    ).resolves.toMatchObject({ id: "plbl-1", type: "project" });

    expect(client.request).toHaveBeenCalledWith(UpdateProjectLabelDocument, {
      id: "plbl-1",
      input: { name: "Client" },
    });
  });

  it("deletes a project label", async () => {
    const client = mockGqlClient({
      projectLabelDelete: { success: true, entityId: "plbl-1" },
    });

    await expect(
      deleteLabel(client, asUuid("plbl-1"), "project"),
    ).resolves.toEqual({ id: "plbl-1", success: true });

    expect(client.request).toHaveBeenCalledWith(DeleteProjectLabelDocument, {
      id: "plbl-1",
    });
  });
});

describe("retireLabel and restoreLabel", () => {
  it("retires an issue label by default", async () => {
    const client = mockGqlClient({
      issueLabelRetire: {
        success: true,
        issueLabel: {
          id: "lbl-1",
          name: "Bug",
          color: "#ff0000",
          retiredAt: "2026-08-10T00:00:00.000Z",
        },
      },
    });

    await expect(retireLabel(client, asUuid("lbl-1"))).resolves.toMatchObject({
      type: "issue",
      retiredAt: "2026-08-10T00:00:00.000Z",
    });

    expect(client.request).toHaveBeenCalledWith(RetireIssueLabelDocument, {
      id: "lbl-1",
    });
  });

  it("retires a project label when asked", async () => {
    const client = mockGqlClient({
      projectLabelRetire: {
        success: true,
        projectLabel: { id: "plbl-1", name: "Customer", color: "#0000ff" },
      },
    });

    await expect(
      retireLabel(client, asUuid("plbl-1"), "project"),
    ).resolves.toMatchObject({ type: "project" });

    expect(client.request).toHaveBeenCalledWith(RetireProjectLabelDocument, {
      id: "plbl-1",
    });
  });

  it("restores a project label", async () => {
    const client = mockGqlClient({
      projectLabelRestore: {
        success: true,
        projectLabel: { id: "plbl-1", name: "Customer", color: "#0000ff" },
      },
    });

    await expect(
      restoreLabel(client, asUuid("plbl-1"), "project"),
    ).resolves.toMatchObject({ type: "project" });

    expect(client.request).toHaveBeenCalledWith(RestoreProjectLabelDocument, {
      id: "plbl-1",
    });
  });

  it("throws when a retire is refused", async () => {
    const client = mockGqlClient({
      projectLabelRetire: { success: false, projectLabel: null },
    });

    await expect(
      retireLabel(client, asUuid("plbl-1"), "project"),
    ).rejects.toThrow('Failed to retire project label "plbl-1"');
  });
});
