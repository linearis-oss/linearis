import type { GraphQLClient } from "../client/graphql-client.js";
import type { BrandUuidFields, UUID } from "../common/identifier.js";
import {
  requireMutationEntity,
  requireMutationSuccess,
} from "../common/mutation-payload.js";
import {
  AttachmentCreateDocument,
  type AttachmentCreateInput,
  type AttachmentCreateMutation,
  AttachmentDeleteDocument,
  AttachmentExternalSyncDisableDocument,
  type AttachmentExternalSyncDisableMutation,
  type AttachmentFilter,
  ListAttachmentsDocument,
  type ListAttachmentsQuery,
} from "../gql/graphql.js";

// Attachment projection types
export type AttachmentListItem =
  ListAttachmentsQuery["issue"]["attachments"]["nodes"][0];
export type CreatedAttachment =
  AttachmentCreateMutation["attachmentCreate"]["attachment"];
export type ExternalSyncDisabledIssue = NonNullable<
  AttachmentExternalSyncDisableMutation["issueExternalSyncDisable"]["issue"]
>;

// Service-owned input type (UUIDs pre-resolved by the command).
export type CreateAttachmentInput = BrandUuidFields<
  Pick<
    AttachmentCreateInput,
    "issueId" | "title" | "url" | "subtitle" | "commentBody" | "iconUrl"
  >,
  "issueId"
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

  return requireMutationEntity(
    result.attachmentCreate,
    "attachment",
    "Failed to create attachment",
  );
}

export async function deleteAttachment(
  client: GraphQLClient,
  id: UUID,
): Promise<{ id: string; success: boolean }> {
  const result = await client.request(AttachmentDeleteDocument, { id });

  requireMutationSuccess(
    result.attachmentDelete,
    "Failed to delete attachment",
  );

  return { id: result.attachmentDelete.entityId, success: true };
}

/**
 * Stops syncing the issue with the external resource behind an attachment.
 *
 * The mutation is `issueExternalSyncDisable`, but it is keyed by attachment
 * rather than issue, which is why it belongs here and not on the issue
 * service: one issue can carry several synced attachments.
 */
export async function disableExternalSync(
  client: GraphQLClient,
  attachmentId: UUID,
): Promise<ExternalSyncDisabledIssue> {
  const result = await client.request(AttachmentExternalSyncDisableDocument, {
    attachmentId,
  });

  return requireMutationEntity(
    result.issueExternalSyncDisable,
    "issue",
    `Failed to disable external sync for attachment "${attachmentId}"`,
  );
}

export async function listAttachments(
  client: GraphQLClient,
  issueId: UUID,
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
