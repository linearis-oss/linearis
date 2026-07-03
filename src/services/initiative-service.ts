import type { GraphQLClient } from "../client/graphql-client.js";
import { invalidParameterError } from "../common/errors.js";
import type { BrandUuidFields, UUID } from "../common/identifier.js";
import { requireMutationEntity } from "../common/mutation-payload.js";
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
  type InitiativeSortInput,
  type InitiativeStatus,
  type InitiativeUpdateInput,
  ListInitiativesDocument,
  type ListInitiativesQuery,
  type ListInitiativesQueryVariables,
  type PaginationOrderBy,
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

// Service-owned input types (UUIDs pre-resolved by the command).
export type CreateInitiativeInput = BrandUuidFields<
  Pick<
    InitiativeCreateInput,
    | "name"
    | "description"
    | "content"
    | "ownerId"
    | "status"
    | "targetDate"
    | "sortOrder"
  >,
  "ownerId"
>;
export type UpdateInitiativeInput = BrandUuidFields<
  Pick<
    InitiativeUpdateInput,
    | "name"
    | "description"
    | "content"
    | "ownerId"
    | "status"
    | "targetDate"
    | "sortOrder"
  >,
  "ownerId"
>;

export type InitiativeSortBy =
  | "name"
  | "createdAt"
  | "updatedAt"
  | "targetDate"
  | "health"
  | "healthUpdatedAt"
  | "manual"
  | "owner";

const INITIATIVE_STATUS_VALUES = ["Planned", "Active", "Completed"] as const;

export function parseInitiativeStatus(
  value?: string,
): InitiativeStatus | undefined {
  if (!value) return undefined;

  const normalized = value.toLowerCase();
  const match = INITIATIVE_STATUS_VALUES.find(
    (status) => status.toLowerCase() === normalized,
  );
  if (match) return match;

  throw invalidParameterError(
    "--status",
    'must be one of: "Planned", "Active", "Completed"',
  );
}

export function mapSortByToPaginationOrderBy(
  sortBy?: InitiativeSortBy,
): PaginationOrderBy | undefined {
  return sortBy === "createdAt" || sortBy === "updatedAt" ? sortBy : undefined;
}

export function mapSortByToInitiativeSort(
  sortBy?: InitiativeSortBy,
  sortOrder?: "asc" | "desc",
): ListInitiativesQueryVariables["sort"] | undefined {
  if (!sortBy) return undefined;

  const withNulls = {
    order: sortOrder === "desc" ? "Descending" : "Ascending",
    nulls: "last",
  } as const;

  const sortEntry: InitiativeSortInput =
    sortBy === "manual"
      ? { manual: withNulls }
      : sortBy === "name"
        ? { name: withNulls }
        : sortBy === "createdAt"
          ? { createdAt: withNulls }
          : sortBy === "updatedAt"
            ? { updatedAt: withNulls }
            : sortBy === "targetDate"
              ? { targetDate: withNulls }
              : sortBy === "health"
                ? { health: withNulls }
                : sortBy === "healthUpdatedAt"
                  ? { healthUpdatedAt: withNulls }
                  : { owner: withNulls };

  return [sortEntry];
}

// Filter input carrying pre-resolved UUIDs and a parsed status; the command
// resolves human-friendly IDs before calling buildInitiativeFilter.
export interface InitiativeFilterInput {
  id?: string;
  slug?: string;
  name?: string;
  status?: InitiativeStatus;
  health?: string;
  healthWithAge?: string;
  ownerId?: UUID;
  creatorId?: UUID;
  teamId?: UUID;
  targetAfter?: string;
  targetBefore?: string;
  startedAfter?: string;
  startedBefore?: string;
  completedAfter?: string;
  completedBefore?: string;
  createdAfter?: string;
  createdBefore?: string;
  updatedAfter?: string;
  updatedBefore?: string;
  ancestorId?: UUID;
}

function applyNullableDateRange(
  // Accepts a GraphQL date comparator whose optional fields are `InputMaybe`
  // (i.e. include `undefined`); the function only ever writes to gte/lte.
  target: {
    gte?: string | null | undefined;
    lte?: string | null | undefined;
  },
  after?: string,
  before?: string,
): void {
  if (after !== undefined) {
    target.gte = after;
  }
  if (before !== undefined) {
    target.lte = before;
  }
}

export function buildInitiativeFilter(
  input: InitiativeFilterInput,
): ListInitiativesQueryVariables["filter"] | undefined {
  const filter: NonNullable<ListInitiativesQueryVariables["filter"]> = {};

  if (input.id) {
    filter.id = { eq: input.id };
  }

  if (input.slug) {
    filter.slugId = { eqIgnoreCase: input.slug };
  }

  if (input.name) {
    filter.name = { eqIgnoreCase: input.name };
  }

  if (input.status) {
    filter.status = { eq: input.status };
  }

  if (input.health) {
    filter.health = { eq: input.health };
  }

  if (input.healthWithAge) {
    filter.healthWithAge = { eq: input.healthWithAge };
  }

  if (input.ownerId) {
    filter.owner = { id: { eq: input.ownerId } };
  }

  if (input.creatorId) {
    filter.creator = { id: { eq: input.creatorId } };
  }

  if (input.teamId) {
    filter.teams = { some: { id: { eq: input.teamId } } };
  }

  if (input.targetAfter || input.targetBefore) {
    filter.targetDate = {};
    applyNullableDateRange(
      filter.targetDate,
      input.targetAfter,
      input.targetBefore,
    );
  }

  if (input.startedAfter || input.startedBefore) {
    filter.startedAt = {};
    applyNullableDateRange(
      filter.startedAt,
      input.startedAfter,
      input.startedBefore,
    );
  }

  if (input.completedAfter || input.completedBefore) {
    filter.completedAt = {};
    applyNullableDateRange(
      filter.completedAt,
      input.completedAfter,
      input.completedBefore,
    );
  }

  if (input.createdAfter || input.createdBefore) {
    filter.createdAt = {};
    applyNullableDateRange(
      filter.createdAt,
      input.createdAfter,
      input.createdBefore,
    );
  }

  if (input.updatedAfter || input.updatedBefore) {
    filter.updatedAt = {};
    applyNullableDateRange(
      filter.updatedAt,
      input.updatedAfter,
      input.updatedBefore,
    );
  }

  if (input.ancestorId) {
    filter.ancestors = { some: { id: { eq: input.ancestorId } } };
  }

  return Object.keys(filter).length > 0 ? filter : undefined;
}

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
  id: UUID,
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
  input: CreateInitiativeInput,
): Promise<CreatedInitiative> {
  const gqlInput: InitiativeCreateInput = input;
  const result = await client.request(CreateInitiativeDocument, {
    input: gqlInput,
  });

  return requireMutationEntity(
    result.initiativeCreate,
    "initiative",
    `Failed to create initiative "${input.name}"`,
  );
}

export async function updateInitiative(
  client: GraphQLClient,
  id: UUID,
  input: UpdateInitiativeInput,
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

  const gqlInput: InitiativeUpdateInput = input;
  const result = await client.request(UpdateInitiativeDocument, {
    id,
    input: gqlInput,
  });

  return requireMutationEntity(
    result.initiativeUpdate,
    "initiative",
    `Failed to update initiative "${id}"`,
  );
}

export async function archiveInitiative(
  client: GraphQLClient,
  id: UUID,
): Promise<ArchivedInitiative> {
  const result = await client.request(ArchiveInitiativeDocument, { id });

  return requireMutationEntity(
    result.initiativeArchive,
    "entity",
    `Failed to archive initiative "${id}"`,
  );
}

export async function unarchiveInitiative(
  client: GraphQLClient,
  id: UUID,
): Promise<UnarchivedInitiative> {
  const result = await client.request(UnarchiveInitiativeDocument, { id });

  return requireMutationEntity(
    result.initiativeUnarchive,
    "entity",
    `Failed to unarchive initiative "${id}"`,
  );
}

export async function deleteInitiative(
  client: GraphQLClient,
  id: UUID,
): Promise<DeletedInitiative> {
  const result = await client.request(DeleteInitiativeDocument, { id });

  const entityId = requireMutationEntity(
    result.initiativeDelete,
    "entityId",
    `Failed to delete initiative "${id}"`,
  );

  return {
    id: entityId,
    success: true,
  };
}
