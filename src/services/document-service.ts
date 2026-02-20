import type { GraphQLClient } from "../client/graphql-client.js";
import type {
  CreatedDocument,
  Document,
  DocumentListItem,
  PaginatedResult,
  UpdatedDocument,
} from "../common/types.js";
import {
  DocumentCreateDocument,
  type DocumentCreateInput,
  type DocumentCreateMutation,
  DocumentDeleteDocument,
  type DocumentDeleteMutation,
  type DocumentFilter,
  DocumentUpdateDocument,
  type DocumentUpdateInput,
  type DocumentUpdateMutation,
  GetDocumentDocument,
  type GetDocumentQuery,
  ListDocumentsDocument,
  type ListDocumentsQuery,
} from "../gql/graphql.js";

export async function getDocument(
  client: GraphQLClient,
  id: string,
): Promise<Document> {
  const result = await client.request<GetDocumentQuery>(GetDocumentDocument, {
    id,
  });

  if (!result.document) {
    throw new Error(`Document with ID "${id}" not found`);
  }

  return result.document;
}

export async function createDocument(
  client: GraphQLClient,
  input: DocumentCreateInput,
): Promise<CreatedDocument> {
  const result = await client.request<DocumentCreateMutation>(
    DocumentCreateDocument,
    { input },
  );

  if (!result.documentCreate.success || !result.documentCreate.document) {
    throw new Error("Failed to create document");
  }

  return result.documentCreate.document;
}

export async function updateDocument(
  client: GraphQLClient,
  id: string,
  input: DocumentUpdateInput,
): Promise<UpdatedDocument> {
  const result = await client.request<DocumentUpdateMutation>(
    DocumentUpdateDocument,
    { id, input },
  );

  if (!result.documentUpdate.success || !result.documentUpdate.document) {
    throw new Error("Failed to update document");
  }

  return result.documentUpdate.document;
}

export async function listDocuments(
  client: GraphQLClient,
  options?: {
    limit?: number;
    after?: string;
    filter?: DocumentFilter;
  },
): Promise<PaginatedResult<DocumentListItem>> {
  const result = await client.request<ListDocumentsQuery>(
    ListDocumentsDocument,
    {
      first: options?.limit ?? 25,
      after: options?.after,
      filter: options?.filter,
    },
  );

  return {
    nodes: result.documents?.nodes ?? [],
    pageInfo: result.documents?.pageInfo ?? {
      hasNextPage: false,
      endCursor: null,
    },
  };
}

export async function listDocumentsBySlugIds(
  client: GraphQLClient,
  slugIds: string[],
): Promise<DocumentListItem[]> {
  if (slugIds.length === 0) {
    return [];
  }

  const result = await client.request<ListDocumentsQuery>(
    ListDocumentsDocument,
    {
      first: slugIds.length,
      filter: {
        slugId: { in: slugIds },
      },
    },
  );

  return result.documents?.nodes ?? [];
}

export async function deleteDocument(
  client: GraphQLClient,
  id: string,
): Promise<boolean> {
  const result = await client.request<DocumentDeleteMutation>(
    DocumentDeleteDocument,
    { id },
  );

  if (!result.documentDelete.success) {
    throw new Error("Failed to delete document");
  }

  return true;
}
