import type { LinearDocument } from "@linear/sdk";
import type { GraphQLClient } from "../client/graphql-client.js";
import type { LinearSdkClient } from "../client/linear-client.js";
import { firstOrThrow } from "../common/array.js";
import { multipleMatchesError, notFoundError } from "../common/errors.js";
import { isUuid } from "../common/identifier.js";
import {
  FindInitiativeProjectLinkByPairDocument,
  FindInitiativeRelationByPairDocument,
} from "../gql/graphql.js";

export interface InitiativeResolveScope {
  teamId?: string;
  ownerId?: string;
}

export async function resolveInitiativeId(
  client: LinearSdkClient,
  nameOrId: string,
  scope: InitiativeResolveScope = {},
): Promise<string> {
  if (isUuid(nameOrId)) {
    return nameOrId;
  }

  const nameClause: LinearDocument.InitiativeFilter = {
    name: { eqIgnoreCase: nameOrId },
  };
  const scopeClauses: LinearDocument.InitiativeFilter[] = [];

  if (scope.teamId) {
    scopeClauses.push({ teams: { some: { id: { eq: scope.teamId } } } });
  }

  if (scope.ownerId) {
    scopeClauses.push({ owner: { id: { eq: scope.ownerId } } });
  }

  const filter: LinearDocument.InitiativeFilter =
    scopeClauses.length === 0
      ? nameClause
      : { and: [nameClause, ...scopeClauses] };

  const result = await client.sdk.initiatives({
    filter,
    first: 20,
  });

  if (result.nodes.length === 0) {
    throw notFoundError("Initiative", nameOrId);
  }

  if (result.nodes.length === 1) {
    return firstOrThrow(result.nodes, () =>
      notFoundError("Initiative", nameOrId),
    ).id;
  }

  const candidates = result.nodes.map((node) => `${node.name} (${node.id})`);

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
  parentId: string,
  childId: string,
): Promise<string> {
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
      return relation.id;
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
  initiativeId: string,
  projectId: string,
): Promise<string> {
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
      return link.id;
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
