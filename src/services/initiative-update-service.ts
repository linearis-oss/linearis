import type { GraphQLClient } from "../client/graphql-client.js";
import { invalidParameterError } from "../common/errors.js";
import type { PaginatedResult } from "../common/types.js";
import {
  ArchiveInitiativeUpdateDocument,
  type ArchiveInitiativeUpdateMutation,
  CreateInitiativeUpdateDocument,
  type CreateInitiativeUpdateMutation,
  GetInitiativeUpdateDocument,
  type GetInitiativeUpdateQuery,
  type InitiativeUpdateCreateInput,
  type InitiativeUpdateHealthType,
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
  initiativeId: string;
  limit?: number;
  after?: string;
  includeArchived?: boolean;
}

// Service-owned input types (UUIDs pre-resolved by the command).
export type CreateInitiativeUpdateInput = Pick<
  InitiativeUpdateCreateInput,
  "initiativeId" | "body" | "health"
>;
export type UpdateInitiativeUpdateInput = Pick<
  InitiativeUpdateUpdateInput,
  "body" | "health"
>;

export function parseHealth(
  value?: string,
): InitiativeUpdateHealthType | undefined {
  if (!value) return undefined;

  const normalized = value.trim().toLowerCase();
  if (normalized === "ontrack") return "onTrack";
  if (normalized === "atrisk") return "atRisk";
  if (normalized === "offtrack") return "offTrack";

  throw invalidParameterError(
    "--health",
    'must be one of: "onTrack", "atRisk", "offTrack"',
  );
}

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
  id: string,
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
  const result = await client.request(ArchiveInitiativeUpdateDocument, { id });

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
  const result = await client.request(UnarchiveInitiativeUpdateDocument, {
    id,
  });

  if (
    !result.initiativeUpdateUnarchive.success ||
    !result.initiativeUpdateUnarchive.entity
  ) {
    throw new Error(`Failed to unarchive initiative update "${id}"`);
  }

  return result.initiativeUpdateUnarchive.entity;
}
