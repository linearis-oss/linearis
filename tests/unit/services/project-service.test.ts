// tests/unit/services/project-service.test.ts

import { type DocumentNode, type FragmentDefinitionNode, Kind } from "graphql";
import { describe, expect, it, vi } from "vitest";
import type { GraphQLClient } from "../../../src/client/graphql-client.js";
import { asUuid } from "../../../src/common/identifier.js";
import {
  GetProjectDocument,
  GetProjectLabelIdsDocument,
  GetProjectWithReactionsDocument,
  UpdateProjectDocument,
} from "../../../src/gql/graphql.js";
import {
  createProject,
  deleteProject,
  getProject,
  getProjectLabelIds,
  listProjects,
  unarchiveProject,
  updateProject,
} from "../../../src/services/project-service.js";

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

describe("project reaction-aware read documents", () => {
  it("adds only paginated root discussion comments with reactions to the opt-in project read", () => {
    const baseFragment = getFragment(GetProjectDocument, "ProjectDetailFields");
    const reactionFragment = getFragment(
      GetProjectWithReactionsDocument,
      "ProjectDetailFieldsWithReactions",
    );

    const reactionSelections = reactionFragment.selectionSet.selections.filter(
      (selection) =>
        selection.kind === Kind.FRAGMENT_SPREAD ||
        selection.kind === Kind.FIELD,
    );

    expect(
      reactionSelections.map((selection) =>
        selection.kind === Kind.FRAGMENT_SPREAD
          ? `...${selection.name.value}`
          : selection.name.value,
      ),
    ).toEqual(["...ProjectDetailFields", "comments"]);

    const commentsField = reactionSelections.find(
      (selection) =>
        selection.kind === Kind.FIELD && selection.name.value === "comments",
    );

    expect(commentsField).toBeDefined();
    if (!commentsField || commentsField.kind !== Kind.FIELD) {
      throw new Error("comments field not found");
    }

    expect(
      commentsField.arguments?.map((argument) => argument.name.value),
    ).toEqual(["first", "after", "filter"]);

    const filterArgument = commentsField.arguments?.find(
      (argument) => argument.name.value === "filter",
    );
    expect(filterArgument).toBeDefined();

    const commentsSelections = commentsField.selectionSet?.selections.filter(
      (selection) => selection.kind === Kind.FIELD,
    );
    expect(
      commentsSelections?.map((selection) => selection.name.value),
    ).toEqual(["nodes", "pageInfo"]);

    const nodesField = commentsSelections?.find(
      (selection) => selection.name.value === "nodes",
    );
    expect(nodesField?.selectionSet?.selections).toHaveLength(1);
    expect(nodesField?.selectionSet?.selections[0]).toMatchObject({
      kind: Kind.FRAGMENT_SPREAD,
      name: { value: "DiscussionCommentFieldsWithReactions" },
    });

    const pageInfoField = commentsSelections?.find(
      (selection) => selection.name.value === "pageInfo",
    );
    expect(
      pageInfoField?.selectionSet?.selections
        .filter((selection) => selection.kind === Kind.FIELD)
        .map((selection) => selection.name.value),
    ).toEqual(["hasNextPage", "endCursor"]);

    const baseFieldNames = baseFragment.selectionSet.selections
      .filter((selection) => selection.kind === Kind.FIELD)
      .map((selection) => selection.name.value);
    expect(baseFieldNames).not.toContain("comments");
  });
});

describe("listProjects", () => {
  it("returns projects", async () => {
    const client = mockGqlClient({
      projects: {
        nodes: [
          {
            id: "proj-1",
            name: "Project Alpha",
            description: "A test project",
            state: "started",
            status: { id: "status-1", name: "Started", type: "started" },
            slugId: "alpha",
            priority: 2,
            priorityLabel: "High",
            health: "onTrack",
            progress: 0.5,
            startDate: "2025-01-01",
            targetDate: "2025-12-31",
            url: "https://linear.app/team/project/alpha",
            lead: { id: "user-1", name: "Alice" },
            teams: {
              nodes: [{ id: "team-1", key: "ENG", name: "Engineering" }],
            },
            labels: {
              nodes: [{ id: "label-1", name: "Q1", color: "#ff0000" }],
            },
          },
        ],
        pageInfo: { hasNextPage: false, endCursor: "c1" },
      },
    });
    const result = await listProjects(client);
    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0]?.id).toBe("proj-1");
    expect(result.nodes[0]?.name).toBe("Project Alpha");
    expect(result.nodes[0]?.state).toBe("started");
    expect(result.nodes[0]?.status.name).toBe("Started");
    expect(result.nodes[0]?.slugId).toBe("alpha");
    expect(result.pageInfo).toEqual({ hasNextPage: false, endCursor: "c1" });
  });

  it("returns empty result", async () => {
    const client = mockGqlClient({
      projects: {
        nodes: [],
        pageInfo: { hasNextPage: false, endCursor: null },
      },
    });
    const result = await listProjects(client);
    expect(result.nodes).toEqual([]);
    expect(result.pageInfo.hasNextPage).toBe(false);
  });

  it("passes after cursor", async () => {
    const client = mockGqlClient({
      projects: {
        nodes: [],
        pageInfo: { hasNextPage: false, endCursor: null },
      },
    });
    await listProjects(client, { after: "cur1" });
    expect(client.request).toHaveBeenCalledWith(expect.anything(), {
      first: 50,
      after: "cur1",
      includeArchived: undefined,
    });
  });

  it("uses default limit of 50", async () => {
    const client = mockGqlClient({
      projects: {
        nodes: [],
        pageInfo: { hasNextPage: false, endCursor: null },
      },
    });
    await listProjects(client);
    expect(client.request).toHaveBeenCalledWith(expect.anything(), {
      first: 50,
      after: undefined,
      includeArchived: undefined,
    });
  });

  it("passes includeArchived when requested", async () => {
    const client = mockGqlClient({
      projects: {
        nodes: [],
        pageInfo: { hasNextPage: false, endCursor: null },
      },
    });
    await listProjects(client, { includeArchived: true });
    expect(client.request).toHaveBeenCalledWith(expect.anything(), {
      first: 50,
      after: undefined,
      includeArchived: true,
    });
  });

  it("passes through null targetDate", async () => {
    const client = mockGqlClient({
      projects: {
        nodes: [
          {
            id: "proj-2",
            name: "No Date",
            description: "",
            state: "planned",
            status: { id: "status-2", name: "Planned", type: "planned" },
            slugId: "no-date",
            priority: 0,
            priorityLabel: "No priority",
            health: null,
            progress: 0,
            startDate: null,
            targetDate: null,
            url: "https://linear.app/team/project/no-date",
            lead: null,
            teams: { nodes: [] },
            labels: { nodes: [] },
          },
        ],
        pageInfo: { hasNextPage: false, endCursor: null },
      },
    });
    const result = await listProjects(client);
    expect(result.nodes[0]?.targetDate).toBeNull();
  });
});

describe("getProject", () => {
  it("returns project detail", async () => {
    const client = mockGqlClient({
      project: {
        id: "proj-1",
        name: "Project Alpha",
        description: "A test project",
        state: "started",
        status: { id: "status-1", name: "Started", type: "started" },
        slugId: "alpha",
        priority: 2,
        priorityLabel: "High",
        health: "onTrack",
        progress: 0.5,
        startDate: "2025-01-01",
        targetDate: "2025-12-31",
        url: "https://linear.app/team/project/alpha",
        lead: { id: "user-1", name: "Alice" },
        teams: { nodes: [{ id: "team-1", key: "ENG", name: "Engineering" }] },
        labels: { nodes: [{ id: "label-1", name: "Q1", color: "#ff0000" }] },
        content: "# Project Alpha\nDetailed content here.",
        icon: "🚀",
        color: "#0000ff",
        createdAt: "2025-01-01T00:00:00Z",
        updatedAt: "2025-06-01T00:00:00Z",
        startedAt: "2025-01-15T00:00:00Z",
        completedAt: null,
        canceledAt: null,
        creator: { id: "user-2", name: "Bob" },
        members: { nodes: [{ id: "user-1", name: "Alice" }] },
        projectMilestones: {
          nodes: [{ id: "ms-1", name: "Beta", targetDate: "2025-06-30" }],
        },
        initiatives: { nodes: [{ id: "init-1", name: "Growth" }] },
      },
    });
    const result = await getProject(client, asUuid("proj-1"));
    expect(result.id).toBe("proj-1");
    expect(result.name).toBe("Project Alpha");
    expect(result.status.name).toBe("Started");
    expect(result.content).toBe("# Project Alpha\nDetailed content here.");
    expect(result.members.nodes).toHaveLength(1);
    expect(client.request).toHaveBeenCalledWith(expect.anything(), {
      id: "proj-1",
      milestonesFirst: 25,
      skipMilestones: false,
      issuesFirst: 25,
      skipIssues: false,
    });
  });

  it("supports bounded detail expansion and zero skips", async () => {
    const client = mockGqlClient({
      project: {
        id: "proj-1",
        name: "Project Alpha",
      },
    });

    await getProject(client, asUuid("proj-1"), {
      milestonesFirst: 0,
      issuesFirst: 0,
    });

    expect(client.request).toHaveBeenCalledWith(expect.anything(), {
      id: "proj-1",
      milestonesFirst: 1,
      skipMilestones: true,
      issuesFirst: 1,
      skipIssues: true,
    });
  });

  it("passes custom milestone and issue limits", async () => {
    const client = mockGqlClient({
      project: {
        id: "proj-1",
        name: "Project Alpha",
      },
    });

    await getProject(client, asUuid("proj-1"), {
      milestonesFirst: 5,
      issuesFirst: 10,
    });

    expect(client.request).toHaveBeenCalledWith(expect.anything(), {
      id: "proj-1",
      milestonesFirst: 5,
      skipMilestones: false,
      issuesFirst: 10,
      skipIssues: false,
    });
  });

  it("throws when project not found", async () => {
    const client = mockGqlClient({ project: null });
    await expect(getProject(client, asUuid("nonexistent"))).rejects.toThrow(
      'Project with ID "nonexistent" not found',
    );
  });
});

describe("getProjectLabelIds", () => {
  it("returns the project's label UUIDs via the lean query", async () => {
    const client = mockGqlClient({
      project: {
        id: "proj-1",
        labels: {
          nodes: [{ id: "label-1" }, { id: "label-2" }],
          pageInfo: { hasNextPage: false },
        },
      },
    });

    const result = await getProjectLabelIds(client, asUuid("proj-1"));

    expect(result).toEqual(["label-1", "label-2"]);
    expect(client.request).toHaveBeenCalledWith(GetProjectLabelIdsDocument, {
      id: "proj-1",
    });
  });

  it("throws when project not found", async () => {
    const client = mockGqlClient({ project: null });
    await expect(
      getProjectLabelIds(client, asUuid("nonexistent")),
    ).rejects.toThrow('Project with ID "nonexistent" not found');
  });

  it("throws instead of returning a truncated label set", async () => {
    const client = mockGqlClient({
      project: {
        id: "proj-1",
        labels: {
          nodes: [{ id: "label-1" }],
          pageInfo: { hasNextPage: true },
        },
      },
    });

    await expect(getProjectLabelIds(client, asUuid("proj-1"))).rejects.toThrow(
      "refusing to modify labels from a truncated label set",
    );
  });
});

describe("project fragment connection bounds", () => {
  // Linear's complexity estimator charges an unbounded connection at its
  // default page size per parent row; unbounded connections in these
  // fragments are what made default `projects list`/`read` exceed the
  // 10000 budget (#276, #283). These assertions make a future tidy-up
  // that unbounds them fail CI instead of shipping the regression.
  // pageInfo itself prices at ~23 complexity per parent row, so the
  // truncation signal lives only in the detail fragment (parent count of
  // one) — selecting it in ProjectListFields would put the 100-row list
  // back over budget.
  const BOUNDED_CONNECTIONS: Array<[string, string, boolean]> = [
    ["ProjectListFields", "teams", false],
    ["ProjectListFields", "labels", false],
    ["ProjectDetailFields", "teams", true],
    ["ProjectDetailFields", "labels", true],
    ["ProjectDetailFields", "members", true],
    ["ProjectDetailFields", "initiatives", true],
    ["ProjectDetailWithDefaultConnectionsFields", "projectMilestones", true],
  ];

  it.each(BOUNDED_CONNECTIONS)(
    "%s bounds %s with a literal first argument",
    (fragmentName, connectionName, requiresPageInfo) => {
      const fragment = getFragment(UpdateProjectDocument, fragmentName);

      const field = fragment.selectionSet.selections.find(
        (selection) =>
          selection.kind === Kind.FIELD &&
          selection.name.value === connectionName,
      );
      if (!field || field.kind !== Kind.FIELD) {
        throw new Error(`${fragmentName} does not select ${connectionName}`);
      }

      const firstArgument = field.arguments?.find(
        (argument) => argument.name.value === "first",
      );
      expect(
        firstArgument?.value.kind,
        `${fragmentName}.${connectionName} must carry a literal first: bound`,
      ).toBe(Kind.INT);

      if (requiresPageInfo) {
        const pageInfo = field.selectionSet?.selections.find(
          (selection) =>
            selection.kind === Kind.FIELD &&
            selection.name.value === "pageInfo",
        );
        expect(
          pageInfo,
          `${fragmentName}.${connectionName} must select pageInfo so consumers can detect truncation`,
        ).toBeDefined();
      }
    },
  );

  it("bounds the lean label lookup and selects its truncation signal", () => {
    const operation = GetProjectLabelIdsDocument.definitions.find(
      (definition) => definition.kind === Kind.OPERATION_DEFINITION,
    );
    if (!operation || operation.kind !== Kind.OPERATION_DEFINITION) {
      throw new Error("GetProjectLabelIds operation not found");
    }

    const projectField = operation.selectionSet.selections.find(
      (selection) =>
        selection.kind === Kind.FIELD && selection.name.value === "project",
    );
    if (!projectField || projectField.kind !== Kind.FIELD) {
      throw new Error("GetProjectLabelIds does not select project");
    }

    const labelsField = projectField.selectionSet?.selections.find(
      (selection) =>
        selection.kind === Kind.FIELD && selection.name.value === "labels",
    );
    if (!labelsField || labelsField.kind !== Kind.FIELD) {
      throw new Error("GetProjectLabelIds does not select labels");
    }

    const firstArgument = labelsField.arguments?.find(
      (argument) => argument.name.value === "first",
    );
    expect(firstArgument?.value.kind).toBe(Kind.INT);

    const pageInfo = labelsField.selectionSet?.selections.find(
      (selection) =>
        selection.kind === Kind.FIELD && selection.name.value === "pageInfo",
    );
    expect(pageInfo).toBeDefined();
  });
});

describe("createProject", () => {
  it("returns created project", async () => {
    const client = mockGqlClient({
      projectCreate: {
        success: true,
        project: {
          id: "proj-new",
          name: "New Project",
          description: "",
          state: "planned",
          status: { id: "status-1", name: "Planned", type: "planned" },
          slugId: "new-project",
          priority: 0,
          priorityLabel: "No priority",
          health: null,
          progress: 0,
          startDate: null,
          targetDate: null,
          url: "https://linear.app/team/project/new-project",
          lead: null,
          teams: { nodes: [{ id: "team-1", key: "ENG", name: "Engineering" }] },
          labels: { nodes: [] },
          content: null,
          icon: null,
          color: "#000000",
          createdAt: "2025-01-01T00:00:00Z",
          updatedAt: "2025-01-01T00:00:00Z",
          startedAt: null,
          completedAt: null,
          canceledAt: null,
          creator: { id: "user-1", name: "Alice" },
          members: { nodes: [] },
          projectMilestones: { nodes: [] },
          initiatives: { nodes: [] },
        },
      },
    });
    const result = await createProject(client, {
      name: "New Project",
      teamIds: [asUuid("team-1")],
    });
    expect(result.id).toBe("proj-new");
    expect(result.name).toBe("New Project");
  });

  it("throws on failure", async () => {
    const client = mockGqlClient({
      projectCreate: { success: false, project: null },
    });
    await expect(
      createProject(client, { name: "Fail", teamIds: [asUuid("team-1")] }),
    ).rejects.toThrow('Failed to create project "Fail"');
  });
});

describe("updateProject", () => {
  it("returns updated project", async () => {
    const client = mockGqlClient({
      projectUpdate: {
        success: true,
        project: {
          id: "proj-1",
          name: "Updated Name",
          description: "Updated desc",
          state: "started",
          status: { id: "status-2", name: "Started", type: "started" },
          slugId: "alpha",
          priority: 1,
          priorityLabel: "Urgent",
          health: "atRisk",
          progress: 0.75,
          startDate: "2025-01-01",
          targetDate: "2025-12-31",
          url: "https://linear.app/team/project/alpha",
          lead: { id: "user-1", name: "Alice" },
          teams: { nodes: [{ id: "team-1", key: "ENG", name: "Engineering" }] },
          labels: { nodes: [] },
          content: "Updated content",
          icon: "🎯",
          color: "#ff0000",
          createdAt: "2025-01-01T00:00:00Z",
          updatedAt: "2025-07-01T00:00:00Z",
          startedAt: "2025-01-15T00:00:00Z",
          completedAt: null,
          canceledAt: null,
          creator: { id: "user-2", name: "Bob" },
          members: { nodes: [{ id: "user-1", name: "Alice" }] },
          projectMilestones: { nodes: [] },
          initiatives: { nodes: [] },
        },
      },
    });
    const result = await updateProject(client, asUuid("proj-1"), {
      name: "Updated Name",
    });
    expect(result.id).toBe("proj-1");
    expect(result.name).toBe("Updated Name");
    expect(result.health).toBe("atRisk");
  });

  it("throws on failure", async () => {
    const client = mockGqlClient({
      projectUpdate: { success: false, project: null },
    });
    await expect(
      updateProject(client, asUuid("proj-1"), { name: "Fail" }),
    ).rejects.toThrow('Failed to update project "proj-1"');
  });
});

describe("unarchiveProject", () => {
  it("returns unarchived project on success", async () => {
    const client = mockGqlClient({
      projectUnarchive: {
        success: true,
        entity: { id: "proj-1", name: "Active Project" },
      },
    });

    await expect(unarchiveProject(client, asUuid("proj-1"))).resolves.toEqual({
      id: "proj-1",
      name: "Active Project",
    });

    expect(client.request).toHaveBeenCalledWith(expect.anything(), {
      id: "proj-1",
    });
  });

  it("throws on failure", async () => {
    const client = mockGqlClient({
      projectUnarchive: { success: false, entity: null },
    });

    await expect(unarchiveProject(client, asUuid("proj-1"))).rejects.toThrow(
      'Failed to unarchive project "proj-1"',
    );
  });
});

describe("deleteProject", () => {
  it("returns delete payload on success", async () => {
    const client = mockGqlClient({
      projectDelete: { success: true, entity: { id: "proj-1" } },
    });

    await expect(deleteProject(client, asUuid("proj-1"))).resolves.toEqual({
      id: "proj-1",
      success: true,
    });

    expect(client.request).toHaveBeenCalledWith(expect.anything(), {
      id: "proj-1",
    });
  });

  it("returns the requested id when delete succeeds with null entity", async () => {
    const client = mockGqlClient({
      projectDelete: { success: true, entity: null },
    });

    await expect(deleteProject(client, asUuid("proj-1"))).resolves.toEqual({
      id: "proj-1",
      success: true,
    });
  });

  it("throws on failure", async () => {
    const client = mockGqlClient({
      projectDelete: { success: false, entity: null },
    });

    await expect(deleteProject(client, asUuid("proj-1"))).rejects.toThrow(
      'Failed to delete project "proj-1"',
    );
  });
});
