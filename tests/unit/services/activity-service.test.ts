import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GraphQLClient } from "../../../src/client/graphql-client.js";
import { asUuid } from "../../../src/common/identifier.js";
import {
  GetIssueActivityRefDocument,
  GetLabelsDocument,
  ListIssueActivityHistoryDocument,
  ListIssueDiscussionReplyCandidatesDocument,
  ListIssueDiscussionReplyCandidatesWithReactionsDocument,
  ListIssueDiscussionRootsDocument,
  ListIssueDiscussionRootsWithReactionsDocument,
} from "../../../src/gql/graphql.js";
import { getIssueActivity } from "../../../src/services/activity-service.js";
import type { DiscussionThreadWithReactions } from "../../../src/services/discussion-service.js";

const ISSUE_ID = asUuid("11111111-1111-1111-1111-111111111111");
const USER = { id: "user-1", displayName: "Ada" };

function createClientMock(): GraphQLClient {
  return { request: vi.fn() } as unknown as GraphQLClient;
}

function comment(
  id: string,
  createdAt: string,
  parentId: string | null = null,
) {
  return {
    id,
    body: `comment-${id}`,
    createdAt,
    editedAt: null,
    parentId,
    resolvedAt: null,
    resolvingComment: null,
    resolvingUser: null,
    user: USER,
  };
}

function commentWithReactions(
  id: string,
  createdAt: string,
  parentId: string | null = null,
) {
  return {
    ...comment(id, createdAt, parentId),
    reactions: [{ id: "r-1", emoji: "👍", user: USER, externalUser: null }],
  };
}

function historyNode(
  id: string,
  createdAt: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    id,
    createdAt,
    fromPriority: null,
    toPriority: null,
    fromTitle: null,
    toTitle: null,
    fromEstimate: null,
    toEstimate: null,
    addedLabelIds: null,
    removedLabelIds: null,
    archived: null,
    actor: USER,
    botActor: null,
    fromState: null,
    toState: null,
    fromAssignee: null,
    toAssignee: null,
    fromProject: null,
    toProject: null,
    fromCycle: null,
    toCycle: null,
    ...overrides,
  };
}

const EMPTY_PAGE = { hasNextPage: false, endCursor: null };

interface MockData {
  ref?: { id: string; identifier: string } | null;
  roots?: unknown[];
  rootsWithReactions?: unknown[];
  replyCandidates?: unknown[];
  replyCandidatesWithReactions?: unknown[];
  history?: unknown[];
  labels?: { id: string; name: string }[];
}

function mockClient(client: GraphQLClient, data: MockData): void {
  vi.mocked(client.request).mockImplementation(
    async (document: unknown): Promise<unknown> => {
      if (document === GetIssueActivityRefDocument) {
        return {
          issue:
            data.ref === undefined
              ? { id: ISSUE_ID, identifier: "ENG-1" }
              : data.ref,
        };
      }
      if (document === ListIssueDiscussionRootsDocument) {
        return {
          issue: {
            comments: { nodes: data.roots ?? [], pageInfo: EMPTY_PAGE },
          },
        };
      }
      if (document === ListIssueDiscussionRootsWithReactionsDocument) {
        return {
          issue: {
            comments: {
              nodes: data.rootsWithReactions ?? [],
              pageInfo: EMPTY_PAGE,
            },
          },
        };
      }
      if (document === ListIssueDiscussionReplyCandidatesDocument) {
        return {
          comments: { nodes: data.replyCandidates ?? [], pageInfo: EMPTY_PAGE },
        };
      }
      if (
        document === ListIssueDiscussionReplyCandidatesWithReactionsDocument
      ) {
        return {
          comments: {
            nodes: data.replyCandidatesWithReactions ?? [],
            pageInfo: EMPTY_PAGE,
          },
        };
      }
      if (document === ListIssueActivityHistoryDocument) {
        return {
          issue: {
            history: { nodes: data.history ?? [], pageInfo: EMPTY_PAGE },
          },
        };
      }
      if (document === GetLabelsDocument) {
        return {
          issueLabels: { nodes: data.labels ?? [], pageInfo: EMPTY_PAGE },
        };
      }
      throw new Error("Unexpected document in mock");
    },
  );
}

describe("getIssueActivity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("merges comment threads and history into one chronological timeline", async () => {
    const client = createClientMock();
    mockClient(client, {
      roots: [
        comment("root-1", "2026-04-21T10:00:00.000Z"),
        comment("root-2", "2026-04-21T12:00:00.000Z"),
      ],
      replyCandidates: [
        comment("reply-1", "2026-04-21T11:00:00.000Z", "root-1"),
      ],
      history: [
        historyNode("hist-1", "2026-04-21T09:00:00.000Z", {
          fromState: { id: "s1", name: "Todo" },
          toState: { id: "s2", name: "In Progress" },
        }),
        historyNode("hist-2", "2026-04-21T13:00:00.000Z", {
          toAssignee: { id: "user-2", displayName: "Alan" },
        }),
      ],
    });

    const result = await getIssueActivity(client, ISSUE_ID);

    expect(result.issue).toEqual({ id: ISSUE_ID, identifier: "ENG-1" });
    expect(result.activity.map((item) => item.type)).toEqual([
      "history",
      "commentThread",
      "commentThread",
      "history",
    ]);

    const [firstHistory, firstThread] = result.activity;
    expect(firstHistory).toMatchObject({
      type: "history",
      id: "hist-1",
      changes: [
        {
          field: "state",
          from: { id: "s1", name: "Todo" },
          to: { id: "s2", name: "In Progress" },
        },
      ],
    });
    expect(firstThread).toMatchObject({ type: "commentThread" });
    if (firstThread?.type === "commentThread") {
      expect(firstThread.root.id).toBe("root-1");
      expect(firstThread.replies.map((reply) => reply.id)).toEqual(["reply-1"]);
    }
  });

  it("drops history events whose changes are all outside the captured fields", async () => {
    const client = createClientMock();
    mockClient(client, {
      history: [
        // No from/to captured field differs -> empty changes, should be dropped.
        historyNode("hist-empty", "2026-04-21T09:00:00.000Z"),
        historyNode("hist-state", "2026-04-21T10:00:00.000Z", {
          fromState: { id: "s1", name: "Todo" },
          toState: { id: "s2", name: "Done" },
        }),
      ],
    });

    const result = await getIssueActivity(client, ISSUE_ID);

    expect(
      result.activity.map((item) =>
        item.type === "history" ? item.id : item.root.id,
      ),
    ).toEqual(["hist-state"]);
  });

  it("resolves label ids on history events to names", async () => {
    const client = createClientMock();
    mockClient(client, {
      history: [
        historyNode("hist-labels", "2026-04-21T10:00:00.000Z", {
          addedLabelIds: ["label-1"],
          removedLabelIds: ["label-2"],
        }),
      ],
      labels: [{ id: "label-1", name: "bug" }],
    });

    const result = await getIssueActivity(client, ISSUE_ID);

    const [item] = result.activity;
    expect(item).toMatchObject({
      type: "history",
      changes: [
        {
          field: "labels",
          added: [{ id: "label-1", name: "bug" }],
          // Unknown/deleted label resolves to a null name.
          removed: [{ id: "label-2", name: null }],
        },
      ],
    });
    expect(client.request).toHaveBeenCalledWith(
      GetLabelsDocument,
      expect.objectContaining({
        filter: { id: { in: ["label-1", "label-2"] } },
      }),
    );
  });

  it("excludes history events when commentsOnly is set", async () => {
    const client = createClientMock();
    mockClient(client, {
      roots: [comment("root-1", "2026-04-21T10:00:00.000Z")],
    });

    const result = await getIssueActivity(client, ISSUE_ID, {
      commentsOnly: true,
    });

    expect(result.activity.every((item) => item.type === "commentThread")).toBe(
      true,
    );
    expect(client.request).not.toHaveBeenCalledWith(
      ListIssueActivityHistoryDocument,
      expect.anything(),
    );
  });

  it("includes normalized reactions on root and replies with withReactions", async () => {
    const client = createClientMock();
    mockClient(client, {
      rootsWithReactions: [
        commentWithReactions("root-1", "2026-04-21T10:00:00.000Z"),
      ],
      replyCandidatesWithReactions: [
        commentWithReactions("reply-1", "2026-04-21T11:00:00.000Z", "root-1"),
      ],
    });

    const result = await getIssueActivity(client, ISSUE_ID, {
      withReactions: true,
      commentsOnly: true,
    });

    const [thread] = result.activity;
    expect(thread?.type).toBe("commentThread");
    if (thread?.type === "commentThread") {
      const root = thread.root as DiscussionThreadWithReactions;
      const replies = thread.replies as DiscussionThreadWithReactions[];
      expect(Array.isArray(root.reactions)).toBe(true);
      expect(root.reactions[0]).toMatchObject({ emoji: "👍" });
      expect(replies[0]?.reactions[0]).toMatchObject({ emoji: "👍" });
    }
    expect(client.request).toHaveBeenCalledWith(
      ListIssueDiscussionRootsWithReactionsDocument,
      expect.anything(),
    );
  });

  it("paginates the merged timeline with an id cursor", async () => {
    const client = createClientMock();
    mockClient(client, {
      roots: [
        comment("root-1", "2026-04-21T10:00:00.000Z"),
        comment("root-2", "2026-04-21T11:00:00.000Z"),
        comment("root-3", "2026-04-21T12:00:00.000Z"),
      ],
    });

    const firstPage = await getIssueActivity(client, ISSUE_ID, {
      limit: 2,
      commentsOnly: true,
    });
    expect(firstPage.activity).toHaveLength(2);
    expect(firstPage.pageInfo.hasNextPage).toBe(true);
    expect(firstPage.pageInfo.endCursor).toBe("root-2");

    const secondPage = await getIssueActivity(client, ISSUE_ID, {
      limit: 2,
      after: "root-2",
      commentsOnly: true,
    });
    expect(secondPage.activity).toHaveLength(1);
    expect(secondPage.pageInfo.hasNextPage).toBe(false);
    expect(secondPage.pageInfo.endCursor).toBe("root-3");
  });

  it("throws when the after cursor is unknown", async () => {
    const client = createClientMock();
    mockClient(client, {
      roots: [comment("root-1", "2026-04-21T10:00:00.000Z")],
    });

    await expect(
      getIssueActivity(client, ISSUE_ID, {
        after: "does-not-exist",
        commentsOnly: true,
      }),
    ).rejects.toThrow(/cursor "does-not-exist" not found/);
  });

  it("throws when the issue does not exist", async () => {
    const client = createClientMock();
    mockClient(client, { ref: null });

    await expect(getIssueActivity(client, ISSUE_ID)).rejects.toThrow(
      /not found/,
    );
  });
});
