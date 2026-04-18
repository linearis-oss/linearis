import type { GraphQLClient } from "../client/graphql-client.js";
import type {
  DeletedInitiativeProjectLink,
  InitiativeProjectLink,
} from "../common/types.js";
import {
  CreateInitiativeToProjectDocument,
  type CreateInitiativeToProjectMutation,
  DeleteInitiativeToProjectDocument,
  type DeleteInitiativeToProjectMutation,
} from "../gql/graphql.js";

export async function createInitiativeProjectLink(
  client: GraphQLClient,
  input: { initiativeId: string; projectId: string },
): Promise<InitiativeProjectLink> {
  const result = await client.request<CreateInitiativeToProjectMutation>(
    CreateInitiativeToProjectDocument,
    {
      input,
    },
  );

  if (
    !result.initiativeToProjectCreate.success ||
    !result.initiativeToProjectCreate.initiativeToProject
  ) {
    throw new Error(
      `Failed to create initiative-project link for initiative "${input.initiativeId}" and project "${input.projectId}"`,
    );
  }

  return result.initiativeToProjectCreate.initiativeToProject;
}

export async function deleteInitiativeProjectLink(
  client: GraphQLClient,
  id: string,
): Promise<DeletedInitiativeProjectLink> {
  const result = await client.request<DeleteInitiativeToProjectMutation>(
    DeleteInitiativeToProjectDocument,
    { id },
  );

  if (
    !result.initiativeToProjectDelete.success ||
    !result.initiativeToProjectDelete.entityId
  ) {
    throw new Error(`Failed to delete initiative-project link "${id}"`);
  }

  return {
    id: result.initiativeToProjectDelete.entityId,
    success: true,
  };
}
