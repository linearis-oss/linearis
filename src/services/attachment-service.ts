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

// Service-owned input type (UUIDs pre-resolved by the command).
export type CreateAttachmentInput = Pick<
  AttachmentCreateInput,
  "issueId" | "title" | "url" | "subtitle" | "commentBody" | "iconUrl"
>;

export interface AttachmentFilterOptions {
  sourceType?: string;
  title?: string;
  createdAfter?: string;
  createdBefore?: string;
}

export function buildAttachmentFilter(
  options: AttachmentFilterOptions,
): AttachmentFilter | undefined {
  const filters: AttachmentFilter[] = [];

  if (options.sourceType) {
    filters.push({ sourceType: { eq: options.sourceType } });
  }
  if (options.title) {
    filters.push({ title: { eqIgnoreCase: options.title } });
  }
  if (options.createdAfter) {
    filters.push({ createdAt: { gte: options.createdAfter } });
  }
  if (options.createdBefore) {
    filters.push({ createdAt: { lt: options.createdBefore } });
  }

  if (filters.length === 0) return undefined;
  if (filters.length === 1) return filters[0];
  return { and: filters };
}

export async function createAttachment(
  client: GraphQLClient,
  input: CreateAttachmentInput,
): Promise<CreatedAttachment> {
  const gqlInput: AttachmentCreateInput = input;
  const result = await client.request(AttachmentCreateDocument, {
    input: gqlInput,
  });

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
