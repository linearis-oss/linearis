import type { LinearSdkClient } from "../client/linear-client.js";

export interface Comment {
  id: string;
  body: string;
  createdAt: string;
}

export interface CreateCommentInput {
  issueId: string;
  body: string;
}

export async function createComment(
  client: LinearSdkClient,
  input: CreateCommentInput,
): Promise<Comment> {
  const result = await client.sdk.createComment(input);

  if (!result.success || !result.comment) {
    throw new Error("Failed to create comment");
  }

  const comment = await result.comment;

  return {
    id: comment.id,
    body: comment.body,
    createdAt: new Date(comment.createdAt).toISOString(),
  };
}
