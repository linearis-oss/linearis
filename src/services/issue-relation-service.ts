import type { GraphQLClient } from "../client/graphql-client.js";
import { notFoundError } from "../common/errors.js";
import type { CreatedIssueRelation } from "../common/types.js";
import {
  CreateIssueRelationDocument,
  type CreateIssueRelationMutation,
  DeleteIssueRelationDocument,
  type DeleteIssueRelationMutation,
  GetIssueRelationsDocument,
  type GetIssueRelationsQuery,
  type IssueRelationType,
} from "../gql/graphql.js";

type IssueRelationsIssue = NonNullable<GetIssueRelationsQuery["issue"]>;

export async function createIssueRelation(
  client: GraphQLClient,
  input: {
    issueId: string;
    relatedIssueId: string;
    type: IssueRelationType;
  },
): Promise<CreatedIssueRelation> {
  const result = await client.request<CreateIssueRelationMutation>(
    CreateIssueRelationDocument,
    { input },
  );
  if (!result.issueRelationCreate.success) {
    throw new Error("Failed to create issue relation");
  }
  return result.issueRelationCreate.issueRelation;
}

export async function listIssueRelations(
  client: GraphQLClient,
  issueId: string,
): Promise<{
  issueId: string;
  identifier: string;
  relations: Array<
    | IssueRelationsIssue["relations"]["nodes"][0]
    | IssueRelationsIssue["inverseRelations"]["nodes"][0]
  >;
}> {
  const result = await client.request<GetIssueRelationsQuery>(
    GetIssueRelationsDocument,
    { issueId },
  );

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
  issueId: string,
  relatedIssueId: string,
): Promise<string> {
  const result = await client.request<GetIssueRelationsQuery>(
    GetIssueRelationsDocument,
    { issueId },
  );

  if (!result.issue) {
    throw notFoundError("Issue", issueId);
  }

  // Check forward relations
  const forwardMatch = result.issue.relations.nodes.find(
    (r) => r.relatedIssue.id === relatedIssueId,
  );
  if (forwardMatch) return forwardMatch.id;

  // Check inverse relations
  const inverseMatch = result.issue.inverseRelations.nodes.find(
    (r) => r.issue.id === relatedIssueId,
  );
  if (inverseMatch) return inverseMatch.id;

  throw notFoundError("Relation", `between ${issueId} and ${relatedIssueId}`);
}

export async function deleteIssueRelation(
  client: GraphQLClient,
  relationId: string,
): Promise<{ id: string; success: boolean }> {
  const result = await client.request<DeleteIssueRelationMutation>(
    DeleteIssueRelationDocument,
    { id: relationId },
  );
  if (!result.issueRelationDelete.success) {
    throw new Error("Failed to delete issue relation");
  }
  return { id: result.issueRelationDelete.entityId, success: true };
}
