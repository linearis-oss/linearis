import type { GraphQLClient } from "../client/graphql-client.js";
import { notFoundError } from "../common/errors.js";
import { asUuid, isUuid, type UUID } from "../common/identifier.js";
import { GetProjectRelationsDocument } from "../gql/graphql.js";

/** A resolved relation, plus which way round it is stored. */
export interface ResolvedProjectRelation {
  id: UUID;
  /**
   * True when the relation was found through `inverseRelations`, i.e. the
   * project named first is the relation's `relatedProject` and the second is
   * its `project`. Callers that write per-end fields must swap the two ends.
   */
  inverted: boolean;
}

/**
 * Resolves a project relation to its UUID.
 *
 * Accepts a UUID (returned as-is) or, given both endpoints, finds the
 * relation between them. Relation IDs never appear in a project read, so
 * without the pair lookup the only way to name a relation for `update` or
 * `remove` would be to run `relations list` first and copy an opaque UUID.
 *
 * ARCHITECTURAL EXCEPTION: Linear exposes no lean lookup for project
 * relations. The `projectRelations` root connection accepts no filter
 * argument at all, so it cannot be narrowed to a project; the only scoped
 * view is the pair of connections hanging off `Project`. This resolver
 * therefore reads the same `GetProjectRelations` document the service uses.
 * Both directions are searched because "the relation between A and B" is one
 * relation regardless of which project declared it — but the direction that
 * matched is reported back, because the relation's own fields (`anchorType`,
 * `projectMilestoneId`) are anchored to its `project`, not to whichever
 * endpoint the caller happened to type first.
 *
 * @throws Error if no relation links the two projects
 */
export async function resolveProjectRelation(
  client: GraphQLClient,
  relationOrProjectId: string,
  relatedProjectId?: UUID,
): Promise<ResolvedProjectRelation> {
  if (isUuid(relationOrProjectId) && relatedProjectId === undefined) {
    return { id: asUuid(relationOrProjectId), inverted: false };
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
  if (forward) return { id: asUuid(forward.id), inverted: false };

  const inverse = result.project.inverseRelations.nodes.find(
    (relation) => relation.project.id === relatedProjectId,
  );
  if (inverse) return { id: asUuid(inverse.id), inverted: true };

  throw notFoundError(
    "Project relation",
    `between ${projectId} and ${relatedProjectId}`,
  );
}
