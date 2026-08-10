import { describe, expect, it, vi } from "vitest";
import type { GraphQLClient } from "../../../src/client/graphql-client.js";
import { asUuid } from "../../../src/common/identifier.js";
import {
  GetProjectActivityRefDocument,
  ListProjectActivityHistoryDocument,
  ListProjectActivityUpdatesDocument,
  ListProjectDiscussionReplyCandidatesDocument,
  ListProjectDiscussionRootsDocument,
} from "../../../src/gql/graphql.js";
import { getProjectActivity } from "../../../src/services/project-activity-service.js";

const EMPTY_PAGE = { hasNextPage: false, endCursor: null };

interface Fixture {
  roots?: unknown[];
  replies?: unknown[];
  history?: unknown[];
  updates?: unknown[];
  projectMissing?: boolean;
}

function mockGqlClient(fixture: Fixture): {
  client: GraphQLClient;
  request: ReturnType<typeof vi.fn>;
} {
  const request = vi.fn(async (document: unknown) => {
    if (document === GetProjectActivityRefDocument) {
      return fixture.projectMissing
        ? { project: null }
        : { project: { id: "proj-1", name: "Auth" } };
    }

    if (document === ListProjectDiscussionRootsDocument) {
      return {
        project: {
          comments: { nodes: fixture.roots ?? [], pageInfo: EMPTY_PAGE },
        },
      };
    }

    if (document === ListProjectDiscussionReplyCandidatesDocument) {
      return {
        comments: { nodes: fixture.replies ?? [], pageInfo: EMPTY_PAGE },
      };
    }

    if (document === ListProjectActivityHistoryDocument) {
      return {
        project: {
          history: { nodes: fixture.history ?? [], pageInfo: EMPTY_PAGE },
        },
      };
    }

    if (document === ListProjectActivityUpdatesDocument) {
      return {
        projectUpdates: { nodes: fixture.updates ?? [], pageInfo: EMPTY_PAGE },
      };
    }

    throw new Error("unexpected document");
  });

  return { client: { request } as unknown as GraphQLClient, request };
}

describe("getProjectActivity", () => {
  it("interleaves threads, history and updates by creation time", async () => {
    const { client } = mockGqlClient({
      roots: [
        { id: "cmt-1", createdAt: "2026-08-02T00:00:00.000Z", parentId: null },
      ],
      history: [
        { id: "hist-1", createdAt: "2026-08-01T00:00:00.000Z", entries: {} },
      ],
      updates: [
        { id: "upd-1", createdAt: "2026-08-03T00:00:00.000Z", body: "Week 1" },
      ],
    });

    const result = await getProjectActivity(client, asUuid("proj-1"));

    expect(result.project).toEqual({ id: "proj-1", name: "Auth" });
    expect(result.activity.map((item) => item.type)).toEqual([
      "history",
      "commentThread",
      "update",
    ]);
    expect(result.pageInfo).toEqual({
      hasNextPage: false,
      endCursor: "upd-1",
    });
  });

  it("passes history entries through verbatim", async () => {
    const entries = { nested: { anything: [1, 2, 3] } };
    const { client } = mockGqlClient({
      history: [
        { id: "hist-1", createdAt: "2026-08-01T00:00:00.000Z", entries },
      ],
    });

    const result = await getProjectActivity(client, asUuid("proj-1"));

    expect(result.activity[0]).toEqual({
      type: "history",
      id: "hist-1",
      createdAt: "2026-08-01T00:00:00.000Z",
      entries,
    });
  });

  it("nests replies under their root thread", async () => {
    const { client } = mockGqlClient({
      roots: [
        { id: "cmt-1", createdAt: "2026-08-01T00:00:00.000Z", parentId: null },
      ],
      replies: [
        {
          id: "cmt-2",
          createdAt: "2026-08-02T00:00:00.000Z",
          parentId: "cmt-1",
        },
      ],
    });

    const result = await getProjectActivity(client, asUuid("proj-1"));

    expect(result.activity).toHaveLength(1);
    expect(result.activity[0]).toMatchObject({
      type: "commentThread",
      root: { id: "cmt-1" },
      replies: [{ id: "cmt-2" }],
    });
  });

  it("--comments-only skips history and updates entirely", async () => {
    const { client, request } = mockGqlClient({
      roots: [
        { id: "cmt-1", createdAt: "2026-08-01T00:00:00.000Z", parentId: null },
      ],
      history: [
        { id: "hist-1", createdAt: "2026-08-01T00:00:00.000Z", entries: {} },
      ],
      updates: [{ id: "upd-1", createdAt: "2026-08-01T00:00:00.000Z" }],
    });

    const result = await getProjectActivity(client, asUuid("proj-1"), {
      commentsOnly: true,
    });

    expect(result.activity.map((item) => item.type)).toEqual(["commentThread"]);
    expect(request).not.toHaveBeenCalledWith(
      ListProjectActivityHistoryDocument,
      expect.anything(),
    );
    expect(request).not.toHaveBeenCalledWith(
      ListProjectActivityUpdatesDocument,
      expect.anything(),
    );
  });

  it("paginates with an opaque id cursor", async () => {
    const { client } = mockGqlClient({
      history: [
        { id: "hist-1", createdAt: "2026-08-01T00:00:00.000Z", entries: {} },
        { id: "hist-2", createdAt: "2026-08-02T00:00:00.000Z", entries: {} },
      ],
    });

    const first = await getProjectActivity(client, asUuid("proj-1"), {
      limit: 1,
    });
    expect(first.pageInfo).toEqual({ hasNextPage: true, endCursor: "hist-1" });

    const second = await getProjectActivity(client, asUuid("proj-1"), {
      limit: 1,
      after: "hist-1",
    });
    expect(second.activity).toMatchObject([{ id: "hist-2" }]);
    expect(second.pageInfo.hasNextPage).toBe(false);
  });

  it("rejects a cursor that is not in the timeline", async () => {
    const { client } = mockGqlClient({});

    await expect(
      getProjectActivity(client, asUuid("proj-1"), { after: "nope" }),
    ).rejects.toThrow('Activity cursor "nope" not found');
  });

  it("throws when the project does not exist", async () => {
    const { client } = mockGqlClient({ projectMissing: true });

    await expect(getProjectActivity(client, asUuid("proj-1"))).rejects.toThrow(
      'Project with ID "proj-1" not found',
    );
  });
});
