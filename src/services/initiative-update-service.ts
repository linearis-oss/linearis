import type { GraphQLClient } from "../client/graphql-client.js";
import { invalidParameterError } from "../common/errors.js";
import type { BrandUuidFields, UUID } from "../common/identifier.js";
import { requireMutationEntity } from "../common/mutation-payload.js";
import type { PaginatedResult } from "../common/types.js";
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

// Initiative update projection types
export type InitiativeUpdateListItem =
  ListInitiativeUpdatesQuery["initiativeUpdates"]["nodes"][0];
export type InitiativeUpdateDetail = NonNullable<
  GetInitiativeUpdateQuery["initiativeUpdate"]
>;
export type CreatedInitiativeUpdate = NonNullable<
  CreateInitiativeUpdateMutation["initiativeUpdateCreate"]["initiativeUpdate"]
>;
export type UpdatedInitiativeUpdate = NonNullable<
  UpdateInitiativeUpdateMutation["initiativeUpdateUpdate"]["initiativeUpdate"]
>;
export type ArchivedInitiativeUpdate = NonNullable<
  ArchiveInitiativeUpdateMutation["initiativeUpdateArchive"]["entity"]
>;
export type UnarchivedInitiativeUpdate = NonNullable<
  UnarchiveInitiativeUpdateMutation["initiativeUpdateUnarchive"]["entity"]
>;

export interface InitiativeUpdateListOptions {
  initiativeId: UUID;
  limit?: number;
  after?: string;
  includeArchived?: boolean;
}

// Service-owned input types (UUIDs pre-resolved by the command).
export type CreateInitiativeUpdateInput = BrandUuidFields<
  Pick<InitiativeUpdateCreateInput, "initiativeId" | "body" | "health">,
  "initiativeId"
>;
export type UpdateInitiativeUpdateInput = Pick<
  InitiativeUpdateUpdateInput,
  "body" | "health"
>;

export async function listInitiativeUpdates(
  client: GraphQLClient,
  options: InitiativeUpdateListOptions,
): Promise<PaginatedResult<InitiativeUpdateListItem>> {
  const { initiativeId, limit = 50, after, includeArchived = false } = options;

  const result = await client.request(ListInitiativeUpdatesDocument, {
    initiativeId,
    first: limit,
    after,
    includeArchived,
  });

  return {
    nodes: result.initiativeUpdates.nodes,
    pageInfo: result.initiativeUpdates.pageInfo,
  };
}

export async function getInitiativeUpdate(
  client: GraphQLClient,
  id: UUID,
): Promise<InitiativeUpdateDetail> {
  const result = await client.request(GetInitiativeUpdateDocument, { id });

  if (!result.initiativeUpdate) {
    throw new Error(`Initiative update with ID "${id}" not found`);
  }

  return result.initiativeUpdate;
}

export async function createInitiativeUpdate(
  client: GraphQLClient,
  input: CreateInitiativeUpdateInput,
): Promise<CreatedInitiativeUpdate> {
  const gqlInput: InitiativeUpdateCreateInput = input;
  const result = await client.request(CreateInitiativeUpdateDocument, {
    input: gqlInput,
  });

  return requireMutationEntity(
    result.initiativeUpdateCreate,
    "initiativeUpdate",
    "Failed to create initiative update",
  );
}

export async function updateInitiativeUpdate(
  client: GraphQLClient,
  id: UUID,
  input: UpdateInitiativeUpdateInput,
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

  const gqlInput: InitiativeUpdateUpdateInput = input;
  const result = await client.request(UpdateInitiativeUpdateDocument, {
    id,
    input: gqlInput,
  });

  return requireMutationEntity(
    result.initiativeUpdateUpdate,
    "initiativeUpdate",
    `Failed to update initiative update "${id}"`,
  );
}

export async function archiveInitiativeUpdate(
  client: GraphQLClient,
  id: UUID,
): Promise<ArchivedInitiativeUpdate> {
  const result = await client.request(ArchiveInitiativeUpdateDocument, { id });

  return requireMutationEntity(
    result.initiativeUpdateArchive,
    "entity",
    `Failed to archive initiative update "${id}"`,
  );
}

export async function unarchiveInitiativeUpdate(
  client: GraphQLClient,
  id: UUID,
): Promise<UnarchivedInitiativeUpdate> {
  const result = await client.request(UnarchiveInitiativeUpdateDocument, {
    id,
  });

  return requireMutationEntity(
    result.initiativeUpdateUnarchive,
    "entity",
    `Failed to unarchive initiative update "${id}"`,
  );
}
