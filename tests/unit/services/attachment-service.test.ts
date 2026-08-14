// tests/unit/services/attachment-service.test.ts

import { describe, expect, it, vi } from "vitest";
import type { GraphQLClient } from "../../../src/client/graphql-client.js";
import { asUuid } from "../../../src/common/identifier.js";
import { AttachmentExternalSyncDisableDocument } from "../../../src/gql/graphql.js";
import {
  createAttachment,
  deleteAttachment,
  disableExternalSync,
  listAttachments,
} from "../../../src/services/attachment-service.js";

function mockGqlClient(response: Record<string, unknown>) {
  return {
    request: vi.fn().mockResolvedValue(response),
  } as unknown as GraphQLClient;
}

describe("createAttachment", () => {
  it("returns created attachment", async () => {
    const client = mockGqlClient({
      attachmentCreate: {
        success: true,
        attachment: {
          id: "att-1",
          title: "Test.pdf",
          url: "https://example.com/test.pdf",
        },
      },
    });
    const result = await createAttachment(client, {
      issueId: asUuid("issue-1"),
      title: "Test.pdf",
      url: "https://example.com/test.pdf",
    });
    expect(result.id).toBe("att-1");
  });

  it("throws when creation fails", async () => {
    const client = mockGqlClient({
      attachmentCreate: { success: false },
    });
    await expect(
      createAttachment(client, {
        issueId: asUuid("issue-1"),
        title: "Test.pdf",
        url: "https://example.com/test.pdf",
      }),
    ).rejects.toThrow("Failed to create attachment");
  });
});

describe("deleteAttachment", () => {
  it("returns id and success on success", async () => {
    const client = mockGqlClient({
      attachmentDelete: { success: true, entityId: "att-1" },
    });
    const result = await deleteAttachment(client, asUuid("att-1"));
    expect(result).toEqual({ id: "att-1", success: true });
  });

  it("throws when delete fails", async () => {
    const client = mockGqlClient({ attachmentDelete: { success: false } });
    await expect(deleteAttachment(client, asUuid("att-1"))).rejects.toThrow(
      "Failed to delete attachment",
    );
  });
});

describe("listAttachments", () => {
  it("returns attachments for issue", async () => {
    const client = mockGqlClient({
      issue: {
        attachments: {
          nodes: [
            { id: "1", title: "File1.pdf" },
            { id: "2", title: "File2.pdf" },
          ],
        },
      },
    });
    const result = await listAttachments(client, asUuid("issue-1"));
    expect(result).toHaveLength(2);
  });

  it("returns empty array when no attachments", async () => {
    const client = mockGqlClient({
      issue: { attachments: { nodes: [] } },
    });
    const result = await listAttachments(client, asUuid("issue-1"));
    expect(result).toEqual([]);
  });

  it("throws when issue not found", async () => {
    const client = mockGqlClient({ issue: null });
    await expect(listAttachments(client, asUuid("missing"))).rejects.toThrow(
      "not found",
    );
  });

  it("passes filter to GraphQL request", async () => {
    const client = mockGqlClient({
      issue: {
        attachments: {
          nodes: [{ id: "1", title: "PR #42", sourceType: "github" }],
        },
      },
    });
    const filter = { sourceType: { eq: "github" } };
    const result = await listAttachments(client, asUuid("issue-1"), filter);
    expect(result).toHaveLength(1);
    expect(client.request).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ filter }),
    );
  });
});

describe("disableExternalSync", () => {
  it("returns the affected issue", async () => {
    const client = mockGqlClient({
      issueExternalSyncDisable: { success: true, issue: { id: "issue-1" } },
    });

    await expect(
      disableExternalSync(client, asUuid("attachment-1")),
    ).resolves.toEqual({ id: "issue-1" });
    expect(client.request).toHaveBeenCalledWith(
      AttachmentExternalSyncDisableDocument,
      { attachmentId: "attachment-1" },
    );
  });

  it("names the attachment when the mutation fails", async () => {
    const client = mockGqlClient({
      issueExternalSyncDisable: { success: false, issue: null },
    });

    await expect(
      disableExternalSync(client, asUuid("attachment-1")),
    ).rejects.toThrow(
      'Failed to disable external sync for attachment "attachment-1"',
    );
  });
});
