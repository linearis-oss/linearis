import type { GraphQLClient } from "../client/graphql-client.js";
import { invalidParameterError } from "../common/errors.js";
import type { PaginatedResult } from "../common/types.js";
import {
  ArchiveInitiativeDocument,
  type ArchiveInitiativeMutation,
  CreateInitiativeDocument,
  type CreateInitiativeMutation,
  DeleteInitiativeDocument,
  type DeleteInitiativeMutation,
  GetInitiativeDocument,
  type GetInitiativeQuery,
  type InitiativeCreateInput,
  type InitiativeUpdateInput,
  ListInitiativesDocument,
  type ListInitiativesQuery,
  type ListInitiativesQueryVariables,
  UnarchiveInitiativeDocument,
  type UnarchiveInitiativeMutation,
  UpdateInitiativeDocument,
  type UpdateInitiativeMutation,
} from "../gql/graphql.js";

// Initiative projection types
export type InitiativeListItem =
  ListInitiativesQuery["initiatives"]["nodes"][0];
export type InitiativeDetail = NonNullable<GetInitiativeQuery["initiative"]>;
export type CreatedInitiative = NonNullable<
  CreateInitiativeMutation["initiativeCreate"]["initiative"]
>;
export type UpdatedInitiative = NonNullable<
  UpdateInitiativeMutation["initiativeUpdate"]["initiative"]
>;
export type ArchivedInitiative = NonNullable<
  ArchiveInitiativeMutation["initiativeArchive"]["entity"]
>;
export type UnarchivedInitiative = NonNullable<
  UnarchiveInitiativeMutation["initiativeUnarchive"]["entity"]
>;
export type DeletedInitiative = {
  id: NonNullable<DeleteInitiativeMutation["initiativeDelete"]["entityId"]>;
  success: true;
};

export interface InitiativeListOptions {
  limit?: number;
  after?: string;
  includeArchived?: boolean;
  filter?: ListInitiativesQueryVariables["filter"];
  orderBy?: ListInitiativesQueryVariables["orderBy"];
  sort?: ListInitiativesQueryVariables["sort"];
}

export async function listInitiatives(
  client: GraphQLClient,
  options: InitiativeListOptions = {},
): Promise<PaginatedResult<InitiativeListItem>> {
  const {
    limit = 50,
    after,
    includeArchived = false,
    filter,
    orderBy,
    sort,
  } = options;

  const result = await client.request(ListInitiativesDocument, {
    first: limit,
    after,
    includeArchived,
    filter,
    orderBy,
    sort,
  });

  return {
    nodes: result.initiatives.nodes,
    pageInfo: result.initiatives.pageInfo,
  };
}

export async function getInitiative(
  client: GraphQLClient,
  id: string,
): Promise<InitiativeDetail> {
  const result = await client.request(GetInitiativeDocument, {
    id,
  });

  if (!result.initiative) {
    throw new Error(`Initiative with ID "${id}" not found`);
  }

  return result.initiative;
}

export async function createInitiative(
  client: GraphQLClient,
  input: InitiativeCreateInput,
): Promise<CreatedInitiative> {
  const result = await client.request(CreateInitiativeDocument, {
    input,
  });

  if (!result.initiativeCreate.success || !result.initiativeCreate.initiative) {
    throw new Error(`Failed to create initiative "${input.name}"`);
  }

  return result.initiativeCreate.initiative;
}

export async function updateInitiative(
  client: GraphQLClient,
  id: string,
  input: InitiativeUpdateInput,
): Promise<UpdatedInitiative> {
  const hasAtLeastOneField = Object.values(input).some(
    (value) => value !== undefined,
  );

  if (!hasAtLeastOneField) {
    throw invalidParameterError(
      "update options",
      "at least one update field must be provided",
    );
  }

  const result = await client.request(UpdateInitiativeDocument, {
    id,
    input,
  });

  if (!result.initiativeUpdate.success || !result.initiativeUpdate.initiative) {
    throw new Error(`Failed to update initiative "${id}"`);
  }

  return result.initiativeUpdate.initiative;
}

export async function archiveInitiative(
  client: GraphQLClient,
  id: string,
): Promise<ArchivedInitiative> {
  const result = await client.request(ArchiveInitiativeDocument, { id });

  if (!result.initiativeArchive.success || !result.initiativeArchive.entity) {
    throw new Error(`Failed to archive initiative "${id}"`);
  }

  return result.initiativeArchive.entity;
}

export async function unarchiveInitiative(
  client: GraphQLClient,
  id: string,
): Promise<UnarchivedInitiative> {
  const result = await client.request(UnarchiveInitiativeDocument, { id });

  if (
    !result.initiativeUnarchive.success ||
    !result.initiativeUnarchive.entity
  ) {
    throw new Error(`Failed to unarchive initiative "${id}"`);
  }

  return result.initiativeUnarchive.entity;
}

export async function deleteInitiative(
  client: GraphQLClient,
  id: string,
): Promise<DeletedInitiative> {
  const result = await client.request(DeleteInitiativeDocument, { id });

  if (!result.initiativeDelete.success || !result.initiativeDelete.entityId) {
    throw new Error(`Failed to delete initiative "${id}"`);
  }

  return {
    id: result.initiativeDelete.entityId,
    success: true,
  };
}
