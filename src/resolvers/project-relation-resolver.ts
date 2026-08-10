import type { GraphQLClient } from "../client/graphql-client.js";
import { notFoundError } from "../common/errors.js";
import { asUuid, isUuid, type UUID } from "../common/identifier.js";
import { GetProjectRelationsDocument } from "../gql/graphql.js";

/**
 * Resolves a project relation to its UUID.
 *
 * Accepts a UUID (returned as-is) or, given both endpoints, finds the
 * relation between them. Relation IDs never appear in a project read, so
 * without the pair lookup the only way to name a relation for `update` or
 * `remove` would be to run `relations list` first and copy an opaque UUID.
 *
 * ARCHITECTURAL EXCEPTION: Linear exposes no lean lookup for project
 * relations — the connections hang off `Project`, and there is no
 * `projectRelations` root query to filter. This resolver therefore reads the
 * same `GetProjectRelations` document the service uses. Both directions are
 * searched because "the relation between A and B" is one relation regardless
 * of which project declared it.
 *
 * @throws Error if no relation links the two projects
 */
export async function resolveProjectRelationId(
  client: GraphQLClient,
  relationOrProjectId: string,
  relatedProjectId?: UUID,
): Promise<UUID> {
  if (isUuid(relationOrProjectId) && relatedProjectId === undefined) {
    return asUuid(relationOrProjectId);
  }

  if (relatedProjectId === undefined) {
    throw notFoundError("Project relation", relationOrProjectId);
  }

  const projectId = asUuid(relationOrProjectId);
  const result = await client.request(GetProjectRelationsDocument, {
    projectId,
  });

  if (!result.project) {
    throw notFoundError("Project", projectId);
  }

  const forward = result.project.relations.nodes.find(
    (relation) => relation.relatedProject.id === relatedProjectId,
  );
  if (forward) return asUuid(forward.id);

  const inverse = result.project.inverseRelations.nodes.find(
    (relation) => relation.project.id === relatedProjectId,
  );
  if (inverse) return asUuid(inverse.id);

  throw notFoundError(
    "Project relation",
    `between ${projectId} and ${relatedProjectId}`,
  );
}
