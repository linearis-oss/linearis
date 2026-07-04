import type { GraphQLClient } from "../client/graphql-client.js";
import type { UUID } from "../common/identifier.js";
import { requireMutationEntity } from "../common/mutation-payload.js";
import {
  CreateInitiativeRelationDocument,
  type CreateInitiativeRelationMutation,
  DeleteInitiativeRelationDocument,
  type DeleteInitiativeRelationMutation,
} from "../gql/graphql.js";

// Initiative relation projection types
export type InitiativeRelation = NonNullable<
  CreateInitiativeRelationMutation["initiativeRelationCreate"]["initiativeRelation"]
>;
export type DeletedInitiativeRelation = {
  id: NonNullable<
    DeleteInitiativeRelationMutation["initiativeRelationDelete"]["entityId"]
  >;
  success: true;
};

export async function createInitiativeRelation(
  client: GraphQLClient,
  input: { parentId: UUID; childId: UUID },
): Promise<InitiativeRelation> {
  const result = await client.request(CreateInitiativeRelationDocument, {
    input: {
      initiativeId: input.parentId,
      relatedInitiativeId: input.childId,
    },
  });

  return requireMutationEntity(
    result.initiativeRelationCreate,
    "initiativeRelation",
    `Failed to create initiative relation from "${input.parentId}" to "${input.childId}"`,
  );
}

export async function deleteInitiativeRelation(
  client: GraphQLClient,
  id: UUID,
): Promise<DeletedInitiativeRelation> {
  const result = await client.request(DeleteInitiativeRelationDocument, { id });

  const entityId = requireMutationEntity(
    result.initiativeRelationDelete,
    "entityId",
    `Failed to delete initiative relation "${id}"`,
  );

  return {
    id: entityId,
    success: true,
  };
}
