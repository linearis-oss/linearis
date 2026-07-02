import type { DocumentNode } from "graphql";
import { describe, expect, it, vi } from "vitest";
import type { GraphQLClient } from "../../../src/client/graphql-client.js";
import {
  createMilestone,
  updateMilestone,
} from "../../../src/services/milestone-service.js";
import { assertVariablesMatchDocument } from "../helpers/assert-variables.js";

/**
 * Regression guard for issue #228: the milestone mutations declare flat
 * variables (`$projectId`, `$name`, ...), so the service must pass flat
 * variables — not `{ input }` / `{ id, input }`. These tests capture the
 * variables object actually handed to `client.request` and assert every key
 * is a variable the document declares.
 */
function mockGqlClient(response: Record<string, unknown>): {
  client: GraphQLClient;
  request: ReturnType<typeof vi.fn>;
} {
  const request = vi.fn().mockResolvedValue(response);
  return { client: { request } as unknown as GraphQLClient, request };
}

function lastCallVariables(
  request: ReturnType<typeof vi.fn>,
): [DocumentNode, Record<string, unknown>] {
  const [document, variables] = request.mock.calls[0] as [
    DocumentNode,
    Record<string, unknown>,
  ];
  return [document, variables];
}

describe("milestone service variable shapes (issue #228)", () => {
  it("createMilestone passes only declared variables", async () => {
    const { client, request } = mockGqlClient({
      projectMilestoneCreate: {
        success: true,
        projectMilestone: { id: "ms-new", name: "v2.0" },
      },
    });

    await createMilestone(client, {
      projectId: "proj-1",
      name: "v2.0",
      description: "Second release",
      targetDate: "2025-12-01",
    });

    const [document, variables] = lastCallVariables(request);
    assertVariablesMatchDocument(document, variables);
    expect(variables).not.toHaveProperty("input");
  });

  it("updateMilestone passes only declared variables", async () => {
    const { client, request } = mockGqlClient({
      projectMilestoneUpdate: {
        success: true,
        projectMilestone: { id: "ms-1", name: "v1.1" },
      },
    });

    await updateMilestone(client, "ms-1", {
      name: "v1.1",
      description: "Updated",
      targetDate: "2026-01-01",
      sortOrder: 2,
    });

    const [document, variables] = lastCallVariables(request);
    assertVariablesMatchDocument(document, variables);
    expect(variables).not.toHaveProperty("input");
  });
});
