import type { GraphQLClient } from "../client/graphql-client.js";
import { notFoundError } from "../common/errors.js";
import { asUuid, type UUID } from "../common/identifier.js";
import { requireMutationSuccess } from "../common/mutation-payload.js";
import {
  CreateIssueRelationDocument,
  type CreateIssueRelationMutation,
  DeleteIssueRelationDocument,
  GetIssueRelationsDocument,
  type GetIssueRelationsQuery,
  type IssueRelationType,
} from "../gql/graphql.js";

// Issue relation projection types
export type CreatedIssueRelation =
  CreateIssueRelationMutation["issueRelationCreate"]["issueRelation"];

type IssueRelationsIssue = NonNullable<GetIssueRelationsQuery["issue"]>;

export async function createIssueRelation(
  client: GraphQLClient,
  input: {
    issueId: UUID;
    relatedIssueId: UUID;
    type: IssueRelationType;
  },
): Promise<CreatedIssueRelation> {
  const result = await client.request(CreateIssueRelationDocument, { input });
  requireMutationSuccess(
    result.issueRelationCreate,
    "Failed to create issue relation",
  );
  return result.issueRelationCreate.issueRelation;
}

export async function listIssueRelations(
  client: GraphQLClient,
  issueId: UUID,
): Promise<{
  issueId: string;
  identifier: string;
  relations: Array<
    | IssueRelationsIssue["relations"]["nodes"][0]
    | IssueRelationsIssue["inverseRelations"]["nodes"][0]
  >;
}> {
  const result = await client.request(GetIssueRelationsDocument, { issueId });

  if (!result.issue) {
    throw notFoundError("Issue", issueId);
  }

  return {
    issueId: result.issue.id,
    identifier: result.issue.identifier,
    relations: [
      ...result.issue.relations.nodes,
      ...result.issue.inverseRelations.nodes,
    ],
  };
}

export async function findIssueRelation(
  client: GraphQLClient,
  issueId: UUID,
  relatedIssueId: UUID,
): Promise<UUID> {
  const result = await client.request(GetIssueRelationsDocument, { issueId });

  if (!result.issue) {
    throw notFoundError("Issue", issueId);
  }

  // Check forward relations
  const forwardMatch = result.issue.relations.nodes.find(
    (r) => r.relatedIssue.id === relatedIssueId,
  );
  if (forwardMatch) return asUuid(forwardMatch.id);

  // Check inverse relations
  const inverseMatch = result.issue.inverseRelations.nodes.find(
    (r) => r.issue.id === relatedIssueId,
  );
  if (inverseMatch) return asUuid(inverseMatch.id);

  throw notFoundError("Relation", `between ${issueId} and ${relatedIssueId}`);
}

export async function deleteIssueRelation(
  client: GraphQLClient,
  relationId: UUID,
): Promise<{ id: string; success: boolean }> {
  const result = await client.request(DeleteIssueRelationDocument, {
    id: relationId,
  });
  requireMutationSuccess(
    result.issueRelationDelete,
    "Failed to delete issue relation",
  );
  return { id: result.issueRelationDelete.entityId, success: true };
}
