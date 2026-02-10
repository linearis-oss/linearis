import { beforeEach, describe, expect, it, vi } from "vitest";
import { GraphQLIssuesService } from "../../src/utils/graphql-issues-service.js";
import type { GraphQLService } from "../../src/utils/graphql-service.js";

/**
 * Unit tests for null comment.user handling in doTransformIssueData.
 *
 * When a Linear issue has automated/synced comments (e.g. from GitHub
 * integration), the `user` field on the comment can be `null`.
 * Previously this caused: Cannot read properties of null (reading 'id').
 */

function makeIssueResponse(commentOverrides: Record<string, unknown> = {}) {
  return {
    issue: {
      id: "issue-1",
      identifier: "ENG-100",
      title: "Test Issue",
      description: null,
      branchName: null,
      priority: 0,
      estimate: null,
      state: { id: "state-1", name: "In Progress" },
      assignee: null,
      team: { id: "team-1", key: "ENG", name: "Engineering" },
      project: null,
      cycle: null,
      projectMilestone: null,
      labels: { nodes: [] },
      parent: null,
      children: { nodes: [] },
      comments: {
        nodes: [
          {
            id: "comment-1",
            body: "Automated sync comment",
            user: null,
            createdAt: "2025-01-01T00:00:00Z",
            updatedAt: "2025-01-01T00:00:00Z",
            ...commentOverrides,
          },
        ],
      },
      createdAt: "2025-01-01T00:00:00Z",
      updatedAt: "2025-01-01T00:00:00Z",
    },
  };
}

describe("GraphQLIssuesService - Null Comment User", () => {
  let mockGraphQLService: { rawRequest: ReturnType<typeof vi.fn> };
  let service: GraphQLIssuesService;

  beforeEach(() => {
    mockGraphQLService = {
      rawRequest: vi.fn(),
    };
    service = new GraphQLIssuesService(
      mockGraphQLService as unknown as GraphQLService,
    );
  });

  it("should handle comment with null user without crashing", async () => {
    mockGraphQLService.rawRequest.mockResolvedValue(makeIssueResponse());

    const result = await service.getIssueById(
      "550e8400-e29b-41d4-a716-446655440000",
    );

    expect(result.comments).toHaveLength(1);
    expect(result.comments![0].user).toBeUndefined();
    expect(result.comments![0].body).toBe("Automated sync comment");
  });

  it("should preserve user when present on comment", async () => {
    mockGraphQLService.rawRequest.mockResolvedValue(
      makeIssueResponse({
        user: { id: "user-1", name: "Alice" },
      }),
    );

    const result = await service.getIssueById(
      "550e8400-e29b-41d4-a716-446655440000",
    );

    expect(result.comments).toHaveLength(1);
    expect(result.comments![0].user).toEqual({
      id: "user-1",
      name: "Alice",
    });
  });
});
