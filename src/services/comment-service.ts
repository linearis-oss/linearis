import type { GraphQLClient } from "../client/graphql-client.js";
import {
  CreateCommentDocument,
  type CreateCommentMutation,
  type CommentCreateInput,
} from "../gql/graphql.js";

export interface Comment {
  id: string;
  body: string;
  createdAt: string;
}

export async function createComment(
  client: GraphQLClient,
  input: CommentCreateInput,
): Promise<Comment> {
  const result = await client.request<CreateCommentMutation>(
    CreateCommentDocument,
    { input },
  );

  if (!result.commentCreate.success || !result.commentCreate.comment) {
    throw new Error("Failed to create comment");
  }

  const comment = result.commentCreate.comment;

  return {
    id: comment.id,
    body: comment.body,
    createdAt: comment.createdAt,
  };
}
