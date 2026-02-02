import { print } from "graphql";
import { GraphQLService, createGraphQLService } from "./graphql-service.js";
import { CommandOptions } from "./auth.js";
import {
  AttachmentCreateDocument,
  AttachmentCreateMutation,
  AttachmentCreateInput,
  AttachmentDeleteDocument,
  AttachmentDeleteMutation,
  ListAttachmentsDocument,
  ListAttachmentsQuery,
} from "../gql/graphql.js";

// Type aliases for cleaner method signatures
type AttachmentFromCreate = AttachmentCreateMutation["attachmentCreate"]["attachment"];
type AttachmentFromList = ListAttachmentsQuery["issue"]["attachments"]["nodes"][0];

/**
 * GraphQL-optimized attachments service for single API call operations
 *
 * Attachments allow linking any URL to an issue. This is the mechanism
 * to associate documents (or any external resource) with issues, since
 * documents cannot be directly linked to issues in Linear's data model.
 *
 * Key behavior: Attachments are idempotent - creating an attachment with
 * the same url + issueId will update the existing attachment.
 */
export class GraphQLAttachmentsService {
  constructor(private graphqlService: GraphQLService) {}

  /**
   * Create an attachment on an issue
   *
   * If an attachment with the same url and issueId already exists,
   * the existing record is updated instead of creating a duplicate.
   *
   * @param input Attachment creation parameters
   * @returns Created or updated attachment
   */
  async createAttachment(
    input: AttachmentCreateInput
  ): Promise<AttachmentFromCreate> {
    // * NOTE: We must enforce the return type here and ensure it matches the mutation document,
    // * as a string is expected in return type. Be extremely careful to use the correct GraphQL document
    // * (AttachmentCreateDocument) with the appropriate return type parameter.
    const result =
      await this.graphqlService.rawRequest<AttachmentCreateMutation>(
        print(AttachmentCreateDocument),
        { input }
      );

    if (!result.attachmentCreate.success) {
      throw new Error(
        `Failed to create attachment on issue ${input.issueId} for URL "${input.url}"`
      );
    }

    return result.attachmentCreate.attachment;
  }

  /**
   * Delete an attachment
   *
   * @param id Attachment ID
   * @returns true if deletion was successful
   * @throws Error if deletion fails
   */
  async deleteAttachment(
    id: string
  ): Promise<AttachmentDeleteMutation["attachmentDelete"]["success"]> {
    // * NOTE: We must enforce the return type here and ensure it matches the mutation document,
    // * as a string is expected in return type. Be extremely careful to use the correct GraphQL document
    // * (AttachmentDeleteDocument) with the appropriate return type parameter.
    const result =
      await this.graphqlService.rawRequest<AttachmentDeleteMutation>(
        print(AttachmentDeleteDocument),
        { id }
      );

    if (!result.attachmentDelete.success) {
      throw new Error(`Failed to delete attachment: ${id}`);
    }

    return true;
  }

  /**
   * List attachments on an issue
   *
   * @param issueId Issue ID (UUID)
   * @returns Array of attachments
   * @throws Error if issue not found
   */
  async listAttachments(
    issueId: string
  ): Promise<ListAttachmentsQuery["issue"]["attachments"]["nodes"]> {
    // * NOTE: We must enforce the return type here and ensure it matches the mutation document,
    // * as a string is expected in return type. Be extremely careful to use the correct GraphQL document
    // * (ListAttachmentsDocument) with the appropriate return type parameter.
    const result = await this.graphqlService.rawRequest<ListAttachmentsQuery>(
      print(ListAttachmentsDocument),
      { issueId }
    );

    if (!result.issue) {
      throw new Error(`Issue not found: ${issueId}`);
    }

    return result.issue.attachments.nodes;
  }
}

/**
 * Create GraphQLAttachmentsService instance with authentication
 */
export async function createGraphQLAttachmentsService(
  options: CommandOptions
): Promise<GraphQLAttachmentsService> {
  const graphqlService = await createGraphQLService(options);
  return new GraphQLAttachmentsService(graphqlService);
}
