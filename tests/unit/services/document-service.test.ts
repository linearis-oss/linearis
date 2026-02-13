// tests/unit/services/document-service.test.ts
import { describe, expect, it, vi } from "vitest";
import type { GraphQLClient } from "../../../src/client/graphql-client.js";
import {
  createDocument,
  deleteDocument,
  getDocument,
  listDocuments,
  listDocumentsBySlugIds,
  updateDocument,
} from "../../../src/services/document-service.js";

function mockGqlClient(response: Record<string, unknown>) {
  return {
    request: vi.fn().mockResolvedValue(response),
  } as unknown as GraphQLClient;
}

describe("getDocument", () => {
  it("returns document by ID", async () => {
    const client = mockGqlClient({ document: { id: "doc-1", title: "Test" } });
    const result = await getDocument(client, "doc-1");
    expect(result.id).toBe("doc-1");
  });

  it("throws when not found", async () => {
    const client = mockGqlClient({ document: null });
    await expect(getDocument(client, "missing")).rejects.toThrow("not found");
  });
});

describe("createDocument", () => {
  it("returns created document", async () => {
    const client = mockGqlClient({
      documentCreate: {
        success: true,
        document: { id: "new-doc", title: "New" },
      },
    });
    const result = await createDocument(client, { title: "New" });
    expect(result.id).toBe("new-doc");
  });

  it("throws when creation fails", async () => {
    const client = mockGqlClient({
      documentCreate: { success: false },
    });
    await expect(createDocument(client, { title: "New" })).rejects.toThrow(
      "Failed to create document",
    );
  });
});

describe("updateDocument", () => {
  it("returns updated document", async () => {
    const client = mockGqlClient({
      documentUpdate: {
        success: true,
        document: { id: "doc-1", title: "Updated" },
      },
    });
    const result = await updateDocument(client, "doc-1", { title: "Updated" });
    expect(result.title).toBe("Updated");
  });

  it("throws when update fails", async () => {
    const client = mockGqlClient({
      documentUpdate: { success: false },
    });
    await expect(
      updateDocument(client, "doc-1", { title: "Updated" }),
    ).rejects.toThrow("Failed to update document");
  });
});

describe("listDocuments", () => {
  it("returns documents list", async () => {
    const client = mockGqlClient({
      documents: { nodes: [{ id: "1" }, { id: "2" }] },
    });
    const result = await listDocuments(client);
    expect(result).toHaveLength(2);
  });

  it("returns empty array when no documents", async () => {
    const client = mockGqlClient({ documents: { nodes: [] } });
    const result = await listDocuments(client);
    expect(result).toEqual([]);
  });
});

describe("listDocumentsBySlugIds", () => {
  it("returns empty array for empty input", async () => {
    const client = mockGqlClient({});
    const result = await listDocumentsBySlugIds(client, []);
    expect(result).toEqual([]);
  });

  it("returns documents matching slugIds", async () => {
    const client = mockGqlClient({
      documents: {
        nodes: [
          { id: "1", slugId: "abc" },
          { id: "2", slugId: "def" },
        ],
      },
    });
    const result = await listDocumentsBySlugIds(client, ["abc", "def"]);
    expect(result).toHaveLength(2);
  });
});

describe("deleteDocument", () => {
  it("returns true on success", async () => {
    const client = mockGqlClient({ documentDelete: { success: true } });
    const result = await deleteDocument(client, "doc-1");
    expect(result).toBe(true);
  });

  it("throws when delete fails", async () => {
    const client = mockGqlClient({ documentDelete: { success: false } });
    await expect(deleteDocument(client, "doc-1")).rejects.toThrow(
      "Failed to delete document",
    );
  });
});
