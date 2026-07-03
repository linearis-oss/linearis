import type { GraphQLClient } from "../client/graphql-client.js";
import { firstOrThrow } from "../common/array.js";
import { multipleMatchesError, notFoundError } from "../common/errors.js";
import { asUuid, isUuid, type UUID } from "../common/identifier.js";
import {
  FindProjectLabelByNameDocument,
  FindProjectsByNameDocument,
} from "../gql/graphql.js";

export interface ResolveProjectIdOptions {
  includeArchived?: boolean;
}

export async function resolveProjectId(
  client: GraphQLClient,
  nameOrId: string,
  options: ResolveProjectIdOptions = {},
): Promise<UUID> {
  if (isUuid(nameOrId)) return asUuid(nameOrId);

  const { projects } = await client.request(FindProjectsByNameDocument, {
    name: nameOrId,
    includeArchived: options.includeArchived,
  });

  if (projects.nodes.length === 0) {
    throw notFoundError("Project", nameOrId);
  }

  if (projects.nodes.length > 1) {
    throw multipleMatchesError(
      "Project",
      nameOrId,
      projects.nodes.map((project) => project.id),
      "provide project UUID",
    );
  }

  return asUuid(
    firstOrThrow(projects.nodes, () => notFoundError("Project", nameOrId)).id,
  );
}

export async function resolveProjectLabelId(
  client: GraphQLClient,
  nameOrId: string,
): Promise<UUID> {
  if (isUuid(nameOrId)) return asUuid(nameOrId);

  const { projectLabels } = await client.request(
    FindProjectLabelByNameDocument,
    { name: nameOrId },
  );

  return asUuid(
    firstOrThrow(projectLabels.nodes, () =>
      notFoundError("Project label", nameOrId),
    ).id,
  );
}

export async function resolveProjectLabelIds(
  client: GraphQLClient,
  namesOrIds: string[],
): Promise<UUID[]> {
  return Promise.all(
    namesOrIds.map((nameOrId) => resolveProjectLabelId(client, nameOrId)),
  );
}
