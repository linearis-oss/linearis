import type { GraphQLClient } from "../client/graphql-client.js";
import type { Attachment, CreatedAttachment } from "../common/types.js";
import {
  AttachmentCreateDocument,
  type AttachmentCreateInput,
  type AttachmentCreateMutation,
  AttachmentDeleteDocument,
  type AttachmentDeleteMutation,
  ListAttachmentsDocument,
  type ListAttachmentsQuery,
} from "../gql/graphql.js";

export async function createAttachment(
  client: GraphQLClient,
  input: AttachmentCreateInput,
): Promise<CreatedAttachment> {
  const result = await client.request<AttachmentCreateMutation>(
    AttachmentCreateDocument,
    { input },
  );

  if (!result.attachmentCreate.success || !result.attachmentCreate.attachment) {
    throw new Error("Failed to create attachment");
  }

  return result.attachmentCreate.attachment;
}

export async function deleteAttachment(
  client: GraphQLClient,
  id: string,
): Promise<boolean> {
  const result = await client.request<AttachmentDeleteMutation>(
    AttachmentDeleteDocument,
    { id },
  );

  if (!result.attachmentDelete.success) {
    throw new Error("Failed to delete attachment");
  }

  return true;
}

export async function listAttachments(
  client: GraphQLClient,
  issueId: string,
): Promise<Attachment[]> {
  const result = await client.request<ListAttachmentsQuery>(
    ListAttachmentsDocument,
    { issueId },
  );

  if (!result.issue) {
    throw new Error(`Issue with ID "${issueId}" not found`);
  }

  return result.issue.attachments?.nodes ?? [];
}
