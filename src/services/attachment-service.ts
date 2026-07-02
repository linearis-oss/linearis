import type { GraphQLClient } from "../client/graphql-client.js";
import type { Attachment, CreatedAttachment } from "../common/types.js";
import {
  AttachmentCreateDocument,
  type AttachmentCreateInput,
  AttachmentDeleteDocument,
  type AttachmentFilter,
  ListAttachmentsDocument,
} from "../gql/graphql.js";

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
): Promise<Attachment[]> {
  const result = await client.request(ListAttachmentsDocument, {
    issueId,
    ...(filter && { filter }),
  });

  if (!result.issue) {
    throw new Error(`Issue with ID "${issueId}" not found`);
  }

  return result.issue.attachments?.nodes ?? [];
}
