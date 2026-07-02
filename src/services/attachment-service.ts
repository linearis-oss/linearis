import type { GraphQLClient } from "../client/graphql-client.js";
import {
  AttachmentCreateDocument,
  type AttachmentCreateInput,
  type AttachmentCreateMutation,
  AttachmentDeleteDocument,
  type AttachmentFilter,
  ListAttachmentsDocument,
  type ListAttachmentsQuery,
} from "../gql/graphql.js";

// Attachment projection types
export type AttachmentListItem =
  ListAttachmentsQuery["issue"]["attachments"]["nodes"][0];
export type CreatedAttachment =
  AttachmentCreateMutation["attachmentCreate"]["attachment"];

export async function createAttachment(
  client: GraphQLClient,
  input: AttachmentCreateInput,
): Promise<CreatedAttachment> {
  const result = await client.request(AttachmentCreateDocument, { input });

  if (!result.attachmentCreate.success || !result.attachmentCreate.attachment) {
    throw new Error("Failed to create attachment");
  }

  return result.attachmentCreate.attachment;
}

export async function deleteAttachment(
  client: GraphQLClient,
  id: string,
): Promise<{ id: string; success: boolean }> {
  const result = await client.request(AttachmentDeleteDocument, { id });

  if (!result.attachmentDelete.success) {
    throw new Error("Failed to delete attachment");
  }

  return { id: result.attachmentDelete.entityId, success: true };
}

export async function listAttachments(
  client: GraphQLClient,
  issueId: string,
  filter?: AttachmentFilter,
): Promise<AttachmentListItem[]> {
  const result = await client.request(ListAttachmentsDocument, {
    issueId,
    ...(filter && { filter }),
  });

  if (!result.issue) {
    throw new Error(`Issue with ID "${issueId}" not found`);
  }

  return result.issue.attachments?.nodes ?? [];
}
