import type { GraphQLClient } from "../client/graphql-client.js";
import { requireMutationEntity } from "../common/mutation-payload.js";
import {
  CreateInitiativeToProjectDocument,
  type CreateInitiativeToProjectMutation,
  DeleteInitiativeToProjectDocument,
  type DeleteInitiativeToProjectMutation,
} from "../gql/graphql.js";

// Initiative-project link projection types
export type InitiativeProjectLink = NonNullable<
  CreateInitiativeToProjectMutation["initiativeToProjectCreate"]["initiativeToProject"]
>;
export type DeletedInitiativeProjectLink = {
  id: NonNullable<
    DeleteInitiativeToProjectMutation["initiativeToProjectDelete"]["entityId"]
  >;
  success: true;
};

export async function createInitiativeProjectLink(
  client: GraphQLClient,
  input: { initiativeId: string; projectId: string },
): Promise<InitiativeProjectLink> {
  const result = await client.request(CreateInitiativeToProjectDocument, {
    input,
  });

  return requireMutationEntity(
    result.initiativeToProjectCreate,
    "initiativeToProject",
    `Failed to create initiative-project link for initiative "${input.initiativeId}" and project "${input.projectId}"`,
  );
}

export async function deleteInitiativeProjectLink(
  client: GraphQLClient,
  id: string,
): Promise<DeletedInitiativeProjectLink> {
  const result = await client.request(DeleteInitiativeToProjectDocument, {
    id,
  });

  const entityId = requireMutationEntity(
    result.initiativeToProjectDelete,
    "entityId",
    `Failed to delete initiative-project link "${id}"`,
  );

  return {
    id: entityId,
    success: true,
  };
}
