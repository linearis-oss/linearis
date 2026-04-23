// tests/unit/services/project-service.test.ts
import { describe, expect, it, vi } from "vitest";
import type { GraphQLClient } from "../../../src/client/graphql-client.js";
import { DeleteProjectDocument } from "../../../src/gql/graphql.js";
import {
  archiveProject,
  createProject,
  deleteProject,
  getProject,
  listProjects,
  unarchiveProject,
  updateProject,
} from "../../../src/services/project-service.js";

function mockGqlClient(response: Record<string, unknown>): GraphQLClient {
  return {
    request: vi.fn().mockResolvedValue(response),
  } as unknown as GraphQLClient;
}

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
    expect(result.nodes[0].id).toBe("proj-1");
    expect(result.nodes[0].name).toBe("Project Alpha");
    expect(result.nodes[0].state).toBe("started");
    expect(result.nodes[0].status.name).toBe("Started");
    expect(result.nodes[0].slugId).toBe("alpha");
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
    expect(result.nodes[0].targetDate).toBeNull();
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
    const result = await getProject(client, "proj-1");
    expect(result.id).toBe("proj-1");
    expect(result.name).toBe("Project Alpha");
    expect(result.status.name).toBe("Started");
    expect(result.content).toBe("# Project Alpha\nDetailed content here.");
    expect(result.members.nodes).toHaveLength(1);
  });

  it("throws when project not found", async () => {
    const client = mockGqlClient({ project: null });
    await expect(getProject(client, "nonexistent")).rejects.toThrow(
      'Project with ID "nonexistent" not found',
    );
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
      teamIds: ["team-1"],
    });
    expect(result.id).toBe("proj-new");
    expect(result.name).toBe("New Project");
  });

  it("throws on failure", async () => {
    const client = mockGqlClient({
      projectCreate: { success: false, project: null },
    });
    await expect(
      createProject(client, { name: "Fail", teamIds: ["team-1"] }),
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
    const result = await updateProject(client, "proj-1", {
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
      updateProject(client, "proj-1", { name: "Fail" }),
    ).rejects.toThrow('Failed to update project "proj-1"');
  });
});

describe("archiveProject", () => {
  it("returns archived project on success", async () => {
    const client = mockGqlClient({
      projectDelete: {
        success: true,
        entity: { id: "proj-1", name: "Archived Project" },
      },
    });

    await expect(archiveProject(client, "proj-1")).resolves.toEqual({
      id: "proj-1",
      name: "Archived Project",
    });

    expect(client.request).toHaveBeenCalledWith(DeleteProjectDocument, {
      id: "proj-1",
    });
  });

  it("throws on failure", async () => {
    const client = mockGqlClient({
      projectDelete: { success: false, entity: null },
    });

    await expect(archiveProject(client, "proj-1")).rejects.toThrow(
      'Failed to archive project "proj-1"',
    );
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

    await expect(unarchiveProject(client, "proj-1")).resolves.toEqual({
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

    await expect(unarchiveProject(client, "proj-1")).rejects.toThrow(
      'Failed to unarchive project "proj-1"',
    );
  });
});

describe("deleteProject", () => {
  it("returns delete payload on success", async () => {
    const client = mockGqlClient({
      projectDelete: { success: true, entity: { id: "proj-1" } },
    });

    await expect(deleteProject(client, "proj-1")).resolves.toEqual({
      id: "proj-1",
      success: true,
    });

    expect(client.request).toHaveBeenCalledWith(expect.anything(), {
      id: "proj-1",
    });
  });

  it("throws on failure", async () => {
    const client = mockGqlClient({
      projectDelete: { success: false, entity: null },
    });

    await expect(deleteProject(client, "proj-1")).rejects.toThrow(
      'Failed to delete project "proj-1"',
    );
  });
});
