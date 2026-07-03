import type { GraphQLClient } from "../client/graphql-client.js";
import { firstOrThrow } from "../common/array.js";
import { normalizeReactionEmojiInput } from "../common/emoji.js";
import { requireMutationSuccess } from "../common/mutation-payload.js";
import {
  CreateReactionDocument,
  type CreateReactionMutation,
  DeleteReactionDocument,
  GetCommentReactionsDocument,
  GetIssueReactionsDocument,
  GetViewerDocument,
  type ReactionCreateInput,
  type ReactionReadFieldsFragment,
} from "../gql/graphql.js";

type ReactionNode = ReactionReadFieldsFragment;

interface NormalizedReactionUser {
  id: string;
  displayName: string;
  type: "user" | "external";
}

interface NormalizedReactionGroup {
  emoji: string;
  count: number;
  users: NormalizedReactionUser[];
  reactionIds: string[];
}

interface ReactionLookupInput {
  kind: "issue" | "comment";
  id: string;
}

interface DeleteOwnReactionByEmojiInput extends ReactionLookupInput {
  emoji: string;
}

interface DeleteOwnReactionByIdInput extends ReactionLookupInput {
  reactionId: string;
}

function compareNormalizedUsers(
  a: NormalizedReactionUser,
  b: NormalizedReactionUser,
): number {
  const nameComparison = a.displayName.localeCompare(b.displayName);

  if (nameComparison !== 0) {
    return nameComparison;
  }

  const typeComparison = a.type.localeCompare(b.type);

  if (typeComparison !== 0) {
    return typeComparison;
  }

  return a.id.localeCompare(b.id);
}

function normalizeReactionUser(
  reaction: ReactionNode,
): NormalizedReactionUser | undefined {
  if (reaction.user) {
    return {
      id: reaction.user.id,
      displayName: reaction.user.displayName,
      type: "user",
    };
  }

  if (reaction.externalUser) {
    return {
      id: reaction.externalUser.id,
      displayName: reaction.externalUser.name,
      type: "external",
    };
  }

  return undefined;
}

async function getViewerId(client: GraphQLClient): Promise<string> {
  const result = await client.request(GetViewerDocument);
  return result.viewer.id;
}

async function getTargetReactions(
  client: GraphQLClient,
  input: ReactionLookupInput,
): Promise<ReactionNode[]> {
  if (input.kind === "issue") {
    const result = await client.request(GetIssueReactionsDocument, {
      id: input.id,
    });

    if (!result.issue) {
      throw new Error(`Issue with ID "${input.id}" not found`);
    }

    return result.issue.reactions;
  }

  const result = await client.request(GetCommentReactionsDocument, {
    id: input.id,
  });

  if (!result.comment) {
    throw new Error(`Discussion comment ID "${input.id}" not found`);
  }

  return result.comment.reactions;
}

async function createReaction(
  client: GraphQLClient,
  input: ReactionCreateInput,
  duplicateLookup: ReactionLookupInput,
): Promise<CreateReactionMutation["reactionCreate"]["reaction"]> {
  const normalizedEmoji = normalizeReactionEmojiInput(input.emoji);
  const normalizedInput = { ...input, emoji: normalizedEmoji };
  const viewerId = await getViewerId(client);
  const existingReactions = await getTargetReactions(client, duplicateLookup);

  const duplicateReaction = existingReactions.find(
    (reaction) =>
      reaction.emoji === normalizedEmoji && reaction.user?.id === viewerId,
  );

  if (duplicateReaction) {
    throw new Error(`Already reacted with emoji ${normalizedEmoji}`);
  }

  const result = await client.request(CreateReactionDocument, {
    input: normalizedInput,
  });

  requireMutationSuccess(result.reactionCreate, "Failed to create reaction");

  return result.reactionCreate.reaction;
}

async function deleteReaction(
  client: GraphQLClient,
  reactionId: string,
): Promise<{ id: string; success: boolean }> {
  const result = await client.request(DeleteReactionDocument, {
    id: reactionId,
  });

  requireMutationSuccess(result.reactionDelete, "Failed to delete reaction");

  return { id: result.reactionDelete.entityId, success: true };
}

export function normalizeReactions(
  reactions: readonly ReactionNode[],
): NormalizedReactionGroup[] {
  const reactionsByEmoji = new Map<string, ReactionNode[]>();

  for (const reaction of reactions) {
    const existing = reactionsByEmoji.get(reaction.emoji);

    if (existing) {
      existing.push(reaction);
      continue;
    }

    reactionsByEmoji.set(reaction.emoji, [reaction]);
  }

  return [...reactionsByEmoji.entries()]
    .sort((leftEntry, rightEntry) => {
      const [leftEmoji, leftReactions] = leftEntry;
      const [rightEmoji, rightReactions] = rightEntry;
      const countComparison = rightReactions.length - leftReactions.length;

      if (countComparison !== 0) {
        return countComparison;
      }

      return leftEmoji.localeCompare(rightEmoji);
    })
    .map(([emoji, groupedReactions]) => {
      const users = groupedReactions
        .map(normalizeReactionUser)
        .filter((user): user is NormalizedReactionUser => user !== undefined)
        .sort(compareNormalizedUsers);

      const reactionIds = groupedReactions
        .map((reaction) => reaction.id)
        .sort((left, right) => left.localeCompare(right));

      return {
        emoji,
        count: groupedReactions.length,
        users,
        reactionIds,
      };
    });
}

export async function createReactionForIssue(
  client: GraphQLClient,
  input: {
    issueId: string;
    emoji: string;
  },
): Promise<CreateReactionMutation["reactionCreate"]["reaction"]> {
  return createReaction(
    client,
    { issueId: input.issueId, emoji: input.emoji },
    { kind: "issue", id: input.issueId },
  );
}

export async function createReactionForComment(
  client: GraphQLClient,
  input: {
    commentId: string;
    emoji: string;
  },
): Promise<CreateReactionMutation["reactionCreate"]["reaction"]> {
  return createReaction(
    client,
    { commentId: input.commentId, emoji: input.emoji },
    { kind: "comment", id: input.commentId },
  );
}

export async function deleteOwnReactionByEmoji(
  client: GraphQLClient,
  input: DeleteOwnReactionByEmojiInput,
): Promise<{ id: string; success: boolean }> {
  const normalizedEmoji = normalizeReactionEmojiInput(input.emoji);
  const viewerId = await getViewerId(client);
  const existingReactions = await getTargetReactions(client, input);

  const matchingReactions = existingReactions.filter(
    (reaction) =>
      reaction.emoji === normalizedEmoji && reaction.user?.id === viewerId,
  );

  if (matchingReactions.length === 0) {
    throw new Error(`No own reaction found with emoji ${normalizedEmoji}`);
  }

  if (matchingReactions.length > 1) {
    throw new Error(
      `Multiple own reactions found with emoji ${normalizedEmoji}`,
    );
  }

  return deleteReaction(
    client,
    firstOrThrow(
      matchingReactions,
      `No own reaction found with emoji ${normalizedEmoji}`,
    ).id,
  );
}

export async function deleteOwnReactionById(
  client: GraphQLClient,
  input: DeleteOwnReactionByIdInput,
): Promise<{ id: string; success: boolean }> {
  const viewerId = await getViewerId(client);
  const existingReactions = await getTargetReactions(client, input);

  const reaction = existingReactions.find(
    (candidate) => candidate.id === input.reactionId,
  );

  if (!reaction) {
    throw new Error(`Reaction "${input.reactionId}" not found`);
  }

  if (reaction.user?.id !== viewerId) {
    throw new Error(`Reaction "${input.reactionId}" is not owned by viewer`);
  }

  return deleteReaction(client, reaction.id);
}
