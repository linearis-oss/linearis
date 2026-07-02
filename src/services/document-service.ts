import type { GraphQLClient } from "../client/graphql-client.js";
import type { PaginatedResult } from "../common/types.js";
import {
  DocumentCreateDocument,
  type DocumentCreateInput,
  type DocumentCreateMutation,
  DocumentDeleteDocument,
  type DocumentFilter,
  DocumentUpdateDocument,
  type DocumentUpdateInput,
  type DocumentUpdateMutation,
  GetDocumentDocument,
  type GetDocumentQuery,
  ListDocumentsDocument,
  type ListDocumentsQuery,
} from "../gql/graphql.js";

// Document projection types
export type DocumentDetail = NonNullable<GetDocumentQuery["document"]>;
export type DocumentListItem = ListDocumentsQuery["documents"]["nodes"][0];
export type CreatedDocument =
  DocumentCreateMutation["documentCreate"]["document"];
export type UpdatedDocument =
  DocumentUpdateMutation["documentUpdate"]["document"];

export async function getDocument(
  client: GraphQLClient,
  id: string,
): Promise<DocumentDetail> {
  const result = await client.request(GetDocumentDocument, {
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
  const result = await client.request(DocumentCreateDocument, { input });

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
  const result = await client.request(DocumentUpdateDocument, { id, input });

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
  const result = await client.request(ListDocumentsDocument, {
    first: options?.limit ?? 25,
    after: options?.after,
    filter: options?.filter,
  });

  return {
    nodes: result.documents?.nodes ?? [],
    pageInfo: result.documents?.pageInfo ?? {
      hasNextPage: false,
      endCursor: null,
    },
  };
}

export async function deleteDocument(
  client: GraphQLClient,
  id: string,
): Promise<{ id: string; success: boolean }> {
  const result = await client.request(DocumentDeleteDocument, { id });

  if (!result.documentDelete.success) {
    throw new Error("Failed to delete document");
  }

  return { id: result.documentDelete.entity?.id ?? id, success: true };
}
