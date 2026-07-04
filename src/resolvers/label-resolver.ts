import type { GraphQLClient } from "../client/graphql-client.js";
import { firstOrThrow } from "../common/array.js";
import { notFoundError } from "../common/errors.js";
import { asUuid, isUuid, type UUID } from "../common/identifier.js";
import {
  FindIssueLabelsDocument,
  type IssueLabelFilter,
} from "../gql/graphql.js";

export type LabelResolverScope = "workspace" | "team";

export interface ResolveLabelOptions {
  teamId?: string;
  scope?: LabelResolverScope;
}

function buildLabelFilter(
  nameOrId: string,
  options: ResolveLabelOptions,
): IssueLabelFilter {
  if (options.scope === "workspace") {
    return {
      name: { eqIgnoreCase: nameOrId },
      team: { null: true },
    };
  }

  if (options.scope === "team" && options.teamId) {
    return {
      name: { eqIgnoreCase: nameOrId },
      team: { id: { eq: options.teamId }, null: false },
    };
  }

  if (options.teamId) {
    return {
      name: { eqIgnoreCase: nameOrId },
      team: { id: { eq: options.teamId } },
    };
  }

  return { name: { eqIgnoreCase: nameOrId } };
}

export async function resolveLabelId(
  client: GraphQLClient,
  nameOrId: string,
  options: ResolveLabelOptions = {},
): Promise<UUID> {
  if (isUuid(nameOrId)) return asUuid(nameOrId);

  const { issueLabels } = await client.request(FindIssueLabelsDocument, {
    filter: buildLabelFilter(nameOrId, options),
    first: 1,
  });

  return asUuid(
    firstOrThrow(issueLabels.nodes, () => notFoundError("Label", nameOrId)).id,
  );
}

export async function resolveLabelIds(
  client: GraphQLClient,
  namesOrIds: string[],
): Promise<UUID[]> {
  return Promise.all(namesOrIds.map((id) => resolveLabelId(client, id)));
}
