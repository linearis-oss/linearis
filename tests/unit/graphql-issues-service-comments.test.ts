import { beforeEach, describe, expect, it, vi } from "vitest";
import { GraphQLIssuesService } from "../../src/utils/graphql-issues-service.js";
import type { GraphQLService } from "../../src/utils/graphql-service.js";

/**
 * Unit tests for comment transformation in GraphQLIssuesService
 *
 * These tests verify the fix for null user handling:
 * - System-generated comments (e.g., Jira sync) have user: null
 * - The transformation should handle null users without crashing
 */

describe("GraphQLIssuesService - Comment Transformation", () => {
  let mockGraphQLService: {
    rawRequest: ReturnType<typeof vi.fn>;
  };
  let service: GraphQLIssuesService;

  beforeEach(() => {
    mockGraphQLService = {
      rawRequest: vi.fn(),
    };
    service = new GraphQLIssuesService(
      mockGraphQLService as unknown as GraphQLService,
    );
  });

  describe("getIssueById - comment user handling", () => {
    it("should handle comment with null user", async () => {
      mockGraphQLService.rawRequest.mockResolvedValue({
        issues: {
          nodes: [
            {
              id: "issue-1",
              identifier: "TEST-1",
              title: "Test Issue",
              description: null,
              branchName: "test-branch",
              priority: 0,
              estimate: null,
              createdAt: "2026-01-01T00:00:00.000Z",
              updatedAt: "2026-01-01T00:00:00.000Z",
              state: { id: "state-1", name: "Todo" },
              assignee: null,
              team: { id: "team-1", key: "TEST", name: "Test Team" },
              project: null,
              labels: { nodes: [] },
              cycle: null,
              projectMilestone: null,
              parent: null,
              children: { nodes: [] },
              comments: {
                nodes: [
                  {
                    id: "comment-1",
                    body: "System generated comment",
                    user: null,
                    createdAt: "2026-01-01T00:00:00.000Z",
                    updatedAt: "2026-01-01T00:00:00.000Z",
                  },
                ],
              },
            },
          ],
        },
      });

      const result = await service.getIssueById("TEST-1");

      expect(result.comments).toHaveLength(1);
      expect(result.comments![0].user).toBeUndefined();
      expect(result.comments![0].body).toBe("System generated comment");
    });

    it("should handle comment with valid user", async () => {
      mockGraphQLService.rawRequest.mockResolvedValue({
        issues: {
          nodes: [
            {
              id: "issue-1",
              identifier: "TEST-1",
              title: "Test Issue",
              description: null,
              branchName: "test-branch",
              priority: 0,
              estimate: null,
              createdAt: "2026-01-01T00:00:00.000Z",
              updatedAt: "2026-01-01T00:00:00.000Z",
              state: { id: "state-1", name: "Todo" },
              assignee: null,
              team: { id: "team-1", key: "TEST", name: "Test Team" },
              project: null,
              labels: { nodes: [] },
              cycle: null,
              projectMilestone: null,
              parent: null,
              children: { nodes: [] },
              comments: {
                nodes: [
                  {
                    id: "comment-1",
                    body: "User comment",
                    user: { id: "user-1", name: "Test User" },
                    createdAt: "2026-01-01T00:00:00.000Z",
                    updatedAt: "2026-01-01T00:00:00.000Z",
                  },
                ],
              },
            },
          ],
        },
      });

      const result = await service.getIssueById("TEST-1");

      expect(result.comments).toHaveLength(1);
      expect(result.comments![0].user).toEqual({
        id: "user-1",
        name: "Test User",
      });
    });

    it("should handle mix of comments with and without users", async () => {
      mockGraphQLService.rawRequest.mockResolvedValue({
        issues: {
          nodes: [
            {
              id: "issue-1",
              identifier: "TEST-1",
              title: "Test Issue",
              description: null,
              branchName: "test-branch",
              priority: 0,
              estimate: null,
              createdAt: "2026-01-01T00:00:00.000Z",
              updatedAt: "2026-01-01T00:00:00.000Z",
              state: { id: "state-1", name: "Todo" },
              assignee: null,
              team: { id: "team-1", key: "TEST", name: "Test Team" },
              project: null,
              labels: { nodes: [] },
              cycle: null,
              projectMilestone: null,
              parent: null,
              children: { nodes: [] },
              comments: {
                nodes: [
                  {
                    id: "comment-1",
                    body: "System comment",
                    user: null,
                    createdAt: "2026-01-01T00:00:00.000Z",
                    updatedAt: "2026-01-01T00:00:00.000Z",
                  },
                  {
                    id: "comment-2",
                    body: "User comment",
                    user: { id: "user-1", name: "Test User" },
                    createdAt: "2026-01-01T00:00:00.000Z",
                    updatedAt: "2026-01-01T00:00:00.000Z",
                  },
                ],
              },
            },
          ],
        },
      });

      const result = await service.getIssueById("TEST-1");

      expect(result.comments).toHaveLength(2);
      expect(result.comments![0].user).toBeUndefined();
      expect(result.comments![1].user).toEqual({
        id: "user-1",
        name: "Test User",
      });
    });
  });
});
