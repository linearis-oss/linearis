import { print } from "graphql";
import { GraphQLService, createGraphQLService } from "./graphql-service.js";
import { CommandOptions } from "./auth.js";
import {
  DocumentCreateDocument,
  DocumentCreateMutation,
  DocumentDeleteDocument,
  DocumentDeleteMutation,
  DocumentUpdateDocument,
  DocumentUpdateMutation,
  GetDocumentDocument,
  GetDocumentQuery,
  ListDocumentsDocument,
  ListDocumentsQuery,
  DocumentCreateInput,
  DocumentUpdateInput,
} from "../gql/graphql.js";

// Type aliases for cleaner method signatures
type DocumentFromCreate = DocumentCreateMutation["documentCreate"]["document"];
type DocumentFromUpdate = DocumentUpdateMutation["documentUpdate"]["document"];
type DocumentFromQuery = GetDocumentQuery["document"];
type DocumentFromList = ListDocumentsQuery["documents"]["nodes"][0];

/**
 * GraphQL-optimized documents service for single API call operations
 *
 * Documents in Linear are standalone entities that can be associated with
 * projects, initiatives, or teams. They cannot be directly linked to issues.
 * To link a document to an issue, use the attachments API.
 */
export class GraphQLDocumentsService {
  constructor(private graphqlService: GraphQLService) {}

  /**
   * Create a new document
   *
   * @param input Document creation parameters
   * @returns Created document with all fields
   */
  async createDocument(input: DocumentCreateInput): Promise<DocumentFromCreate> {
    // * NOTE: We must enforce the return type here and ensure it matches the mutation document,
    // * as a string is expected in return type. Be extremely careful to use the correct GraphQL document
    // * (DocumentCreateDocument) with the appropriate return type parameter.
    const result = await this.graphqlService.rawRequest<DocumentCreateMutation>(
      print(DocumentCreateDocument),
      { input }
    );

    if (!result.documentCreate.success) {
      throw new Error(
        `Failed to create document "${input.title}"${
          input.projectId ? ` in project ${input.projectId}` : ""
        }${input.teamId ? ` for team ${input.teamId}` : ""}`
      );
    }

    return result.documentCreate.document;
  }

  /**
   * Update an existing document
   *
   * @param id Document ID (UUID or slug)
   * @param input Update parameters (only provided fields are updated)
   * @returns Updated document with all fields
   */
  async updateDocument(
    id: string,
    input: DocumentUpdateInput
  ): Promise<DocumentFromUpdate> {
    // * NOTE: We must enforce the return type here and ensure it matches the mutation document,
    // * as a string is expected in return type. Be extremely careful to use the correct GraphQL document
    // * (DocumentUpdateDocument) with the appropriate return type parameter.
    const result = await this.graphqlService.rawRequest<DocumentUpdateMutation>(
      print(DocumentUpdateDocument),
      { id, input }
    );

    if (!result.documentUpdate.success) {
      throw new Error(`Failed to update document: ${id}`);
    }

    return result.documentUpdate.document;
  }

  /**
   * Get a single document by ID
   *
   * @param id Document ID (UUID or slug)
   * @returns Document with all fields
   * @throws Error if document not found
   */
  async getDocument(id: string): Promise<DocumentFromQuery> {
    // * NOTE: We must enforce the return type here and ensure it matches the mutation document,
    // * as a string is expected in return type. Be extremely careful to use the correct GraphQL document
    // * (GetDocumentDocument) with the appropriate return type parameter.
    const result = await this.graphqlService.rawRequest<GetDocumentQuery>(
      print(GetDocumentDocument),
      { id }
    );

    if (!result.document) {
      throw new Error(`Document not found: ${id}`);
    }

    return result.document;
  }

  /**
   * List documents with optional filtering
   *
   * @param options Filter and pagination options
   * @returns Array of documents
   */
  async listDocuments(options?: {
    projectId?: string;
    first?: number;
  }): Promise<ListDocumentsQuery["documents"]["nodes"]> {
    const filter = options?.projectId
      ? { project: { id: { eq: options.projectId } } }
      : undefined;

    // * NOTE: We must enforce the return type here and ensure it matches the mutation document,
    // * as a string is expected in return type. Be extremely careful to use the correct GraphQL document
    // * (ListDocumentsDocument) with the appropriate return type parameter.
    const result = await this.graphqlService.rawRequest<ListDocumentsQuery>(
      print(ListDocumentsDocument),
      {
        first: options?.first ?? 50,
        filter,
      }
    );

    return result.documents.nodes;
  }

  /**
   * Delete (trash) a document
   *
   * This is a soft delete - the document is moved to trash.
   *
   * @param id Document ID
   * @returns true if deletion was successful
   * @throws Error if deletion fails
   */
  async deleteDocument(
    id: string
  ): Promise<DocumentDeleteMutation["documentDelete"]["success"]> {
    // * NOTE: We must enforce the return type here and ensure it matches the mutation document,
    // * as a string is expected in return type. Be extremely careful to use the correct GraphQL document
    // * (DocumentDeleteDocument) with the appropriate return type parameter.
    const result = await this.graphqlService.rawRequest<DocumentDeleteMutation>(
      print(DocumentDeleteDocument),
      { id }
    );

    if (!result.documentDelete.success) {
      throw new Error(`Failed to delete document: ${id}`);
    }

    return true;
  }

  /**
   * List documents by their slug IDs
   *
   * Used for batch-fetching documents, e.g., when retrieving documents
   * linked to an issue via URL attachments.
   *
   * @param slugIds Array of document slug IDs (the short ID at the end of document URLs)
   * @param limit Maximum number of documents to return
   * @returns Array of documents (may be fewer if some slugIds don't exist or exceed limit)
   */
  async listDocumentsBySlugIds(
    slugIds: string[],
    limit?: number
  ): Promise<ListDocumentsQuery["documents"]["nodes"]> {
    if (slugIds.length === 0) {
      return [];
    }

    const filter = {
      or: slugIds.map((slugId) => ({ slugId: { eq: slugId } })),
    };

    // * NOTE: We must enforce the return type here and ensure it matches the mutation document,
    // * as a string is expected in return type. Be extremely careful to use the correct GraphQL document
    // * (ListDocumentsDocument) with the appropriate return type parameter.
    const result = await this.graphqlService.rawRequest<ListDocumentsQuery>(
      print(ListDocumentsDocument),
      {
        first: limit ?? slugIds.length,
        filter,
      }
    );

    return result.documents.nodes;
  }
}

/**
 * Create GraphQLDocumentsService instance with authentication
 */
export async function createGraphQLDocumentsService(
  options: CommandOptions
): Promise<GraphQLDocumentsService> {
  const graphqlService = await createGraphQLService(options);
  return new GraphQLDocumentsService(graphqlService);
}
