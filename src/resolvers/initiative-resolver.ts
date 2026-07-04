import type { GraphQLClient } from "../client/graphql-client.js";
import { firstOrThrow } from "../common/array.js";
import { multipleMatchesError, notFoundError } from "../common/errors.js";
import { asUuid, isUuid, type UUID } from "../common/identifier.js";
import {
  FindInitiativeProjectLinkByPairDocument,
  FindInitiativeRelationByPairDocument,
  FindInitiativesDocument,
  type InitiativeFilter,
} from "../gql/graphql.js";

export interface InitiativeResolveScope {
  teamId?: UUID;
  ownerId?: UUID;
}

export async function resolveInitiativeId(
  client: GraphQLClient,
  nameOrId: string,
  scope: InitiativeResolveScope = {},
): Promise<UUID> {
  if (isUuid(nameOrId)) {
    return asUuid(nameOrId);
  }

  const nameClause: InitiativeFilter = {
    name: { eqIgnoreCase: nameOrId },
  };
  const scopeClauses: InitiativeFilter[] = [];

  if (scope.teamId) {
    scopeClauses.push({ teams: { some: { id: { eq: scope.teamId } } } });
  }

  if (scope.ownerId) {
    scopeClauses.push({ owner: { id: { eq: scope.ownerId } } });
  }

  const filter: InitiativeFilter =
    scopeClauses.length === 0
      ? nameClause
      : { and: [nameClause, ...scopeClauses] };

  const { initiatives } = await client.request(FindInitiativesDocument, {
    filter,
    first: 20,
  });

  if (initiatives.nodes.length === 0) {
    throw notFoundError("Initiative", nameOrId);
  }

  if (initiatives.nodes.length === 1) {
    return asUuid(
      firstOrThrow(initiatives.nodes, () =>
        notFoundError("Initiative", nameOrId),
      ).id,
    );
  }

  const candidates = initiatives.nodes.map(
    (node) => `${node.name} (${node.id})`,
  );

  throw multipleMatchesError(
    "initiative",
    nameOrId,
    candidates,
    scope.teamId || scope.ownerId
      ? "use UUID to disambiguate"
      : "provide --team or --owner, or use UUID",
  );
}

export async function resolveInitiativeRelationId(
  client: GraphQLClient,
  parentId: UUID,
  childId: UUID,
): Promise<UUID> {
  let after: string | undefined;

  while (true) {
    const result = await client.request(FindInitiativeRelationByPairDocument, {
      parentId,
      childId,
      after,
    });

    const relation = result.initiativeRelations.nodes.find(
      (node) =>
        node.initiative.id === parentId &&
        node.relatedInitiative.id === childId,
    );

    if (relation) {
      return asUuid(relation.id);
    }

    if (!result.initiativeRelations.pageInfo.hasNextPage) {
      break;
    }

    after = result.initiativeRelations.pageInfo.endCursor ?? undefined;
  }

  throw notFoundError(
    "Initiative relation",
    `between ${parentId} and ${childId}`,
  );
}

export async function resolveInitiativeProjectLinkId(
  client: GraphQLClient,
  initiativeId: UUID,
  projectId: UUID,
): Promise<UUID> {
  let after: string | undefined;

  while (true) {
    const result = await client.request(
      FindInitiativeProjectLinkByPairDocument,
      { initiativeId, projectId, after },
    );

    const link = result.initiativeToProjects.nodes.find(
      (node) =>
        node.initiative.id === initiativeId && node.project.id === projectId,
    );

    if (link) {
      return asUuid(link.id);
    }

    if (!result.initiativeToProjects.pageInfo.hasNextPage) {
      break;
    }

    after = result.initiativeToProjects.pageInfo.endCursor ?? undefined;
  }

  throw notFoundError(
    "Initiative project link",
    `between ${initiativeId} and ${projectId}`,
  );
}
