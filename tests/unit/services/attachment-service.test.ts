// tests/unit/services/attachment-service.test.ts
import { describe, expect, it, vi } from "vitest";
import type { GraphQLClient } from "../../../src/client/graphql-client.js";
import {
  createAttachment,
  deleteAttachment,
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
      issueId: "issue-1",
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
        issueId: "issue-1",
        title: "Test.pdf",
        url: "https://example.com/test.pdf",
      }),
    ).rejects.toThrow("Failed to create attachment");
  });
});

describe("deleteAttachment", () => {
  it("returns true on success", async () => {
    const client = mockGqlClient({ attachmentDelete: { success: true } });
    const result = await deleteAttachment(client, "att-1");
    expect(result).toBe(true);
  });

  it("throws when delete fails", async () => {
    const client = mockGqlClient({ attachmentDelete: { success: false } });
    await expect(deleteAttachment(client, "att-1")).rejects.toThrow(
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
    const result = await listAttachments(client, "issue-1");
    expect(result).toHaveLength(2);
  });

  it("returns empty array when no attachments", async () => {
    const client = mockGqlClient({
      issue: { attachments: { nodes: [] } },
    });
    const result = await listAttachments(client, "issue-1");
    expect(result).toEqual([]);
  });

  it("throws when issue not found", async () => {
    const client = mockGqlClient({ issue: null });
    await expect(listAttachments(client, "missing")).rejects.toThrow(
      "not found",
    );
  });
});
