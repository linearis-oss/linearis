import type { GraphQLClient } from "../client/graphql-client.js";
import { invalidParameterError } from "../common/errors.js";
import type {
  ArchivedInitiativeUpdate,
  CreatedInitiativeUpdate,
  InitiativeUpdateDetail,
  InitiativeUpdateListItem,
  PaginatedResult,
  UnarchivedInitiativeUpdate,
  UpdatedInitiativeUpdate,
} from "../common/types.js";
import {
  ArchiveInitiativeUpdateDocument,
  type ArchiveInitiativeUpdateMutation,
  CreateInitiativeUpdateDocument,
  type CreateInitiativeUpdateMutation,
  GetInitiativeUpdateDocument,
  type GetInitiativeUpdateQuery,
  type InitiativeUpdateCreateInput,
  type InitiativeUpdateUpdateInput,
  ListInitiativeUpdatesDocument,
  type ListInitiativeUpdatesQuery,
  UnarchiveInitiativeUpdateDocument,
  type UnarchiveInitiativeUpdateMutation,
  UpdateInitiativeUpdateDocument,
  type UpdateInitiativeUpdateMutation,
} from "../gql/graphql.js";

interface InitiativeUpdateListOptions {
  initiativeId: string;
  limit?: number;
  after?: string;
  includeArchived?: boolean;
}

export async function listInitiativeUpdates(
  client: GraphQLClient,
  options: InitiativeUpdateListOptions,
): Promise<PaginatedResult<InitiativeUpdateListItem>> {
  const { initiativeId, limit = 50, after, includeArchived = false } = options;

  const result = await client.request<ListInitiativeUpdatesQuery>(
    ListInitiativeUpdatesDocument,
    {
      initiativeId,
      first: limit,
      after,
      includeArchived,
    },
  );

  return {
    nodes: result.initiativeUpdates.nodes,
    pageInfo: result.initiativeUpdates.pageInfo,
  };
}

export async function getInitiativeUpdate(
  client: GraphQLClient,
  id: string,
): Promise<InitiativeUpdateDetail> {
  const result = await client.request<GetInitiativeUpdateQuery>(
    GetInitiativeUpdateDocument,
    { id },
  );

  if (!result.initiativeUpdate) {
    throw new Error(`Initiative update with ID "${id}" not found`);
  }

  return result.initiativeUpdate;
}

export async function createInitiativeUpdate(
  client: GraphQLClient,
  input: InitiativeUpdateCreateInput,
): Promise<CreatedInitiativeUpdate> {
  const result = await client.request<CreateInitiativeUpdateMutation>(
    CreateInitiativeUpdateDocument,
    { input },
  );

  if (
    !result.initiativeUpdateCreate.success ||
    !result.initiativeUpdateCreate.initiativeUpdate
  ) {
    throw new Error("Failed to create initiative update");
  }

  return result.initiativeUpdateCreate.initiativeUpdate;
}

export async function updateInitiativeUpdate(
  client: GraphQLClient,
  id: string,
  input: InitiativeUpdateUpdateInput,
): Promise<UpdatedInitiativeUpdate> {
  const hasAtLeastOneField = Object.values(input).some(
    (value) => value !== undefined,
  );

  if (!hasAtLeastOneField) {
    throw invalidParameterError(
      "update options",
      "at least one update field must be provided",
    );
  }

  const result = await client.request<UpdateInitiativeUpdateMutation>(
    UpdateInitiativeUpdateDocument,
    { id, input },
  );

  if (
    !result.initiativeUpdateUpdate.success ||
    !result.initiativeUpdateUpdate.initiativeUpdate
  ) {
    throw new Error(`Failed to update initiative update "${id}"`);
  }

  return result.initiativeUpdateUpdate.initiativeUpdate;
}

export async function archiveInitiativeUpdate(
  client: GraphQLClient,
  id: string,
): Promise<ArchivedInitiativeUpdate> {
  const result = await client.request<ArchiveInitiativeUpdateMutation>(
    ArchiveInitiativeUpdateDocument,
    { id },
  );

  if (
    !result.initiativeUpdateArchive.success ||
    !result.initiativeUpdateArchive.entity
  ) {
    throw new Error(`Failed to archive initiative update "${id}"`);
  }

  return result.initiativeUpdateArchive.entity;
}

export async function unarchiveInitiativeUpdate(
  client: GraphQLClient,
  id: string,
): Promise<UnarchivedInitiativeUpdate> {
  const result = await client.request<UnarchiveInitiativeUpdateMutation>(
    UnarchiveInitiativeUpdateDocument,
    { id },
  );

  if (
    !result.initiativeUpdateUnarchive.success ||
    !result.initiativeUpdateUnarchive.entity
  ) {
    throw new Error(`Failed to unarchive initiative update "${id}"`);
  }

  return result.initiativeUpdateUnarchive.entity;
}
