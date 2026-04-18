import type { GraphQLClient } from "../client/graphql-client.js";
import type {
  DeletedInitiativeRelation,
  InitiativeRelation,
} from "../common/types.js";
import {
  CreateInitiativeRelationDocument,
  type CreateInitiativeRelationMutation,
  DeleteInitiativeRelationDocument,
  type DeleteInitiativeRelationMutation,
} from "../gql/graphql.js";

export async function createInitiativeRelation(
  client: GraphQLClient,
  input: { parentId: string; initiativeId: string },
): Promise<InitiativeRelation> {
  const result = await client.request<CreateInitiativeRelationMutation>(
    CreateInitiativeRelationDocument,
    {
      input: {
        initiativeId: input.parentId,
        relatedInitiativeId: input.initiativeId,
      },
    },
  );

  if (
    !result.initiativeRelationCreate.success ||
    !result.initiativeRelationCreate.initiativeRelation
  ) {
    throw new Error(
      `Failed to create initiative relation from "${input.parentId}" to "${input.initiativeId}"`,
    );
  }

  return result.initiativeRelationCreate.initiativeRelation;
}

export async function deleteInitiativeRelation(
  client: GraphQLClient,
  id: string,
): Promise<DeletedInitiativeRelation> {
  const result = await client.request<DeleteInitiativeRelationMutation>(
    DeleteInitiativeRelationDocument,
    { id },
  );

  if (
    !result.initiativeRelationDelete.success ||
    !result.initiativeRelationDelete.entityId
  ) {
    throw new Error(`Failed to delete initiative relation "${id}"`);
  }

  return {
    id: result.initiativeRelationDelete.entityId,
    success: true,
  };
}
