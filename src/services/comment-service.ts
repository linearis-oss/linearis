import type { GraphQLClient } from "../client/graphql-client.js";
import {
  requireMutationEntity,
  requireMutationSuccess,
} from "../common/mutation-payload.js";
import type { PaginatedResult, PaginationOptions } from "../common/types.js";
import {
  type CommentCreateInput,
  type CommentUpdateInput,
  CreateCommentDocument,
  type CreateCommentMutation,
  DeleteCommentDocument,
  ListCommentsDocument,
  type ListCommentsQuery,
  UpdateCommentDocument,
  type UpdateCommentMutation,
} from "../gql/graphql.js";

// Comment projection types
export type CreatedComment = NonNullable<
  CreateCommentMutation["commentCreate"]["comment"]
>;
export type UpdatedComment = NonNullable<
  UpdateCommentMutation["commentUpdate"]["comment"]
>;
export type CommentListItem =
  ListCommentsQuery["issue"]["comments"]["nodes"][0];

export async function createComment(
  client: GraphQLClient,
  input: CommentCreateInput,
): Promise<CreatedComment> {
  const result = await client.request(CreateCommentDocument, { input });

  return requireMutationEntity(
    result.commentCreate,
    "comment",
    "Failed to create comment",
  );
}

export async function updateComment(
  client: GraphQLClient,
  id: string,
  input: CommentUpdateInput,
): Promise<UpdatedComment> {
  const result = await client.request(UpdateCommentDocument, { id, input });

  return requireMutationEntity(
    result.commentUpdate,
    "comment",
    "Failed to update comment",
  );
}

export async function listComments(
  client: GraphQLClient,
  issueId: string,
  options: PaginationOptions = {},
): Promise<PaginatedResult<CommentListItem>> {
  const { limit = 25, after } = options;

  const result = await client.request(ListCommentsDocument, {
    issueId,
    first: limit,
    after,
  });

  if (!result.issue) {
    throw new Error(`Issue with ID "${issueId}" not found`);
  }

  return {
    nodes: result.issue.comments?.nodes ?? [],
    pageInfo: result.issue.comments?.pageInfo ?? {
      hasNextPage: false,
      endCursor: null,
    },
  };
}

export async function replyToComment(
  client: GraphQLClient,
  input: { parentId: string; body: string },
): Promise<CreatedComment> {
  const result = await client.request(CreateCommentDocument, {
    input: { parentId: input.parentId, body: input.body },
  });

  return requireMutationEntity(
    result.commentCreate,
    "comment",
    "Failed to create reply",
  );
}

export async function deleteComment(
  client: GraphQLClient,
  id: string,
): Promise<{ id: string; success: boolean }> {
  const result = await client.request(DeleteCommentDocument, { id });

  requireMutationSuccess(result.commentDelete, "Failed to delete comment");

  return {
    id: result.commentDelete.entityId,
    success: true,
  };
}
