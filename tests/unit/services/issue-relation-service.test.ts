import { describe, expect, it, vi } from "vitest";
import type { GraphQLClient } from "../../../src/client/graphql-client.js";
import { IssueRelationType } from "../../../src/gql/graphql.js";
import {
  createIssueRelation,
  deleteIssueRelation,
  findIssueRelation,
} from "../../../src/services/issue-relation-service.js";

function mockGqlClient(response: Record<string, unknown>): GraphQLClient {
  return {
    request: vi.fn().mockResolvedValue(response),
  } as unknown as GraphQLClient;
}

describe("createIssueRelation", () => {
  it("creates a relation and returns it", async () => {
    const relation = {
      id: "rel-1",
      type: IssueRelationType.Blocks,
      relatedIssue: { id: "issue-2", identifier: "ENG-2" },
    };
    const client = mockGqlClient({
      issueRelationCreate: { success: true, issueRelation: relation },
    });

    const result = await createIssueRelation(client, {
      issueId: "issue-1",
      relatedIssueId: "issue-2",
      type: IssueRelationType.Blocks,
    });

    expect(result).toEqual(relation);
    expect(client.request).toHaveBeenCalledOnce();
  });

  it("throws when creation fails", async () => {
    const client = mockGqlClient({
      issueRelationCreate: { success: false, issueRelation: null },
    });

    await expect(
      createIssueRelation(client, {
        issueId: "issue-1",
        relatedIssueId: "issue-2",
        type: IssueRelationType.Blocks,
      }),
    ).rejects.toThrow("Failed to create issue relation");
  });
});

describe("findIssueRelation", () => {
  it("finds relation in forward relations", async () => {
    const client = mockGqlClient({
      issue: {
        relations: {
          nodes: [
            {
              id: "rel-1",
              type: IssueRelationType.Blocks,
              relatedIssue: { id: "target-id", identifier: "ENG-2" },
            },
          ],
        },
        inverseRelations: { nodes: [] },
      },
    });

    const result = await findIssueRelation(client, "source-id", "target-id");
    expect(result).toBe("rel-1");
  });

  it("finds relation in inverse relations", async () => {
    const client = mockGqlClient({
      issue: {
        relations: { nodes: [] },
        inverseRelations: {
          nodes: [
            {
              id: "rel-2",
              type: IssueRelationType.Blocks,
              issue: { id: "target-id", identifier: "ENG-1" },
            },
          ],
        },
      },
    });

    const result = await findIssueRelation(client, "source-id", "target-id");
    expect(result).toBe("rel-2");
  });

  it("throws when issue is not found", async () => {
    const client = mockGqlClient({ issue: null });

    await expect(
      findIssueRelation(client, "non-existent-id", "target-id"),
    ).rejects.toThrow("not found");
  });

  it("throws when no relation found", async () => {
    const client = mockGqlClient({
      issue: {
        relations: { nodes: [] },
        inverseRelations: { nodes: [] },
      },
    });

    await expect(
      findIssueRelation(client, "source-id", "target-id"),
    ).rejects.toThrow("not found");
  });
});

describe("deleteIssueRelation", () => {
  it("deletes a relation by ID", async () => {
    const client = mockGqlClient({
      issueRelationDelete: { success: true, entityId: "rel-1" },
    });

    await deleteIssueRelation(client, "rel-1");
    expect(client.request).toHaveBeenCalledOnce();
  });

  it("throws when deletion fails", async () => {
    const client = mockGqlClient({
      issueRelationDelete: { success: false },
    });

    await expect(deleteIssueRelation(client, "rel-1")).rejects.toThrow(
      "Failed to delete issue relation",
    );
  });
});
