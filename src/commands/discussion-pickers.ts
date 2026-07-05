import type { Command } from "commander";
import type { GraphQLClient } from "../client/graphql-client.js";
import type { CommandContext } from "../common/context.js";
import { getRootOpts } from "../common/context.js";
import {
  InteractiveCancelledError,
  invalidParameterError,
} from "../common/errors.js";
import { asUuid, type UUID } from "../common/identifier.js";
import { emojiChoices } from "../common/interactive/choices.js";
import { maybeCollectInteractive } from "../common/interactive/engine.js";
import {
  type ChoicePicker,
  makeChoicePicker,
} from "../common/interactive/pickers.js";
import type {
  Choice,
  PromptIO,
  PromptSpec,
} from "../common/interactive/types.js";
import type { PaginatedResult, PaginationOptions } from "../common/types.js";
import {
  type DiscussionEntityKind,
  type DiscussionThread,
  listDiscussionReplies,
} from "../services/discussion-service.js";

const EMPTY_SPEC: PromptSpec<Record<string, never>> = { fields: [] };

/**
 * Fill an absent required positional via `picker` when interactive gating
 * allows, else require it (preserving the missing-argument error for
 * agents/pipes). Shared by every discussion command that takes a
 * `[thread]`/`[comment]`/`[reply]` across the issue/project/initiative domains.
 */
export async function resolvePickedPositional(
  ctx: CommandContext,
  command: Command,
  name: string,
  value: string | undefined,
  picker: ChoicePicker,
): Promise<string> {
  const filled = await maybeCollectInteractive<Record<string, never>, string>(
    ctx,
    getRootOpts(command),
    {
      spec: EMPTY_SPEC,
      options: {},
      missingRequired: value === undefined,
      positional: { name, value, picker },
    },
  );
  if (filled.positional === undefined) {
    throw invalidParameterError(name, "is required");
  }
  return filled.positional;
}

/** Options shape for the shared discussion-body wizard. */
interface BodyWizardOptions extends Record<string, unknown> {
  body?: string;
}

const discussionBodySpec: PromptSpec<BodyWizardOptions> = {
  intro: "Enter the comment body",
  fields: [
    { name: "body", kind: "multiline", message: "Body", required: true },
  ],
};

/**
 * Collect the discussion `--body` interactively when it is missing and gating
 * allows, else preserve the "--body is required" error for agents/pipes. Shared
 * by the reply/edit/discuss commands across the issue/project/initiative
 * domains so the body is prompted after the positional picker rather than
 * dead-ending on a missing flag.
 */
export async function resolveDiscussionBody(
  ctx: CommandContext,
  command: Command,
  options: { body?: string },
): Promise<string> {
  const filled = await maybeCollectInteractive<BodyWizardOptions, never>(
    ctx,
    getRootOpts(command),
    {
      spec: discussionBodySpec,
      options: options as BodyWizardOptions,
      missingRequired: options.body === undefined,
    },
  );
  const body = filled.options.body;
  if (body === undefined) {
    throw invalidParameterError("--body", "is required");
  }
  return body;
}

/** Emoji picker for an absent `[emoji]` reaction positional. */
const emojiPicker = makeChoicePicker("Reaction", async () => emojiChoices());

/**
 * Fill an absent `[emoji]` positional via the emoji picker when gating allows.
 * Returns the (possibly still-undefined) emoji so the caller's existing
 * `resolveReactionEmojiInput` keeps ownership of the emoji-or-shortcode
 * validation for the non-interactive path.
 */
export async function resolveEmojiPositional(
  ctx: CommandContext,
  command: Command,
  emoji: string | undefined,
  shortcode: string | undefined,
): Promise<string | undefined> {
  // A --shortcode already fully determines the emoji, so never offer the
  // picker in that case: it would force the user to pick a glyph and then
  // collide with the shortcode in resolveReactionEmojiInput ("cannot provide
  // both"). Only prompt for a genuinely absent emoji.
  if (shortcode !== undefined) {
    return emoji;
  }
  const filled = await maybeCollectInteractive<Record<string, never>, string>(
    ctx,
    getRootOpts(command),
    {
      spec: EMPTY_SPEC,
      options: {},
      missingRequired: emoji === undefined,
      positional: { name: "emoji", value: emoji, picker: emojiPicker },
    },
  );
  return filled.positional;
}

/**
 * How many root threads / replies to offer in a picker. The selects are
 * {@link PromptIO.autocomplete searchable}, so this is a soft cap on breadth
 * rather than a hard limit a user must scroll — typing filters the list.
 */
const PICKER_LIMIT = 50;

/**
 * Configuration for {@link makeDiscussionPickers}. The three content domains
 * (issue/project/initiative) expose an identical discussion subsystem
 * parameterized only by `entityKind` plus the domain's entity picker, resolver,
 * and root-thread list service — so one builder produces the pickers for all
 * three.
 *
 * This builder lives in `commands/` (not `common/interactive/`) on purpose: it
 * resolves entity ids, and the `common/interactive/` layer is deliberately kept
 * resolver-free (see the invariant documented in `choices.ts`). It mirrors where
 * the pre-existing `commentPicker` (comments.ts) already lives.
 */
export interface DiscussionPickerConfig {
  entityKind: DiscussionEntityKind;
  /** Domain entity picker (issue/project/initiative); returns a human id or UUID. */
  entityPicker: ChoicePicker;
  /** Normalize the entity picker's return value to a UUID. */
  resolveEntityId(ctx: CommandContext, human: string): Promise<UUID>;
  /** The domain's `listDiscussionsFor<Entity>` root-thread service. */
  listThreads(
    client: GraphQLClient,
    entityId: UUID,
    options: PaginationOptions,
  ): Promise<PaginatedResult<DiscussionThread>>;
}

/**
 * Build the three discussion positional pickers for one content domain:
 *
 * - `rootThreadPicker` — pick a **root thread** (for `reply`, `resolve`,
 *   `unresolve`, and thread-level reactions).
 * - `commentOrReplyPicker` — pick a root thread **or one of its replies** (for
 *   `edit` / `delete-comment`, which the non-interactive CLI accepts for either;
 *   a root-only picker would silently drop reply targets).
 * - `replyPicker` — pick a **reply within a chosen thread** (for `edit-reply`,
 *   `delete-reply`, and reply-level reactions).
 *
 * Every picker gates through the caller's `maybeCollectInteractive` wrapper, so
 * none of the loads here run in non-TTY/CI/piped contexts.
 */
export function makeDiscussionPickers(cfg: DiscussionPickerConfig): {
  rootThreadPicker: ChoicePicker;
  commentOrReplyPicker: ChoicePicker;
  replyPicker: ChoicePicker;
} {
  /**
   * Pick a root thread node. Loops the entity selection: an entity with no
   * threads shows a non-fatal notice and re-prompts rather than aborting the
   * whole command. Cancelling (at the entity or thread step) throws
   * {@link InteractiveCancelledError}.
   */
  async function pickThreadNode(
    ctx: CommandContext,
    io: PromptIO,
  ): Promise<DiscussionThread> {
    for (;;) {
      const human = await cfg.entityPicker(ctx, io);
      const entityId = await cfg.resolveEntityId(ctx, human);
      const { nodes } = await cfg.listThreads(ctx.gql, entityId, {
        limit: PICKER_LIMIT,
      });
      if (nodes.length === 0) {
        io.intro?.(
          `That ${cfg.entityKind} has no discussion threads — choose another.`,
        );
        continue;
      }
      return selectNode(io, "Thread", nodes, (node) => threadChoice(node));
    }
  }

  async function fetchReplies(
    ctx: CommandContext,
    threadId: string,
  ): Promise<DiscussionThread[]> {
    const { nodes } = await listDiscussionReplies(
      ctx.gql,
      asUuid(threadId),
      { limit: PICKER_LIMIT },
      cfg.entityKind,
    );
    return nodes;
  }

  const rootThreadPicker: ChoicePicker = async (ctx, io) =>
    (await pickThreadNode(ctx, io)).id;

  const commentOrReplyPicker: ChoicePicker = async (ctx, io) => {
    const thread = await pickThreadNode(ctx, io);
    const replies = await fetchReplies(ctx, thread.id);
    const chosen = await selectNode(
      io,
      "Comment",
      [thread, ...replies],
      (node) => threadChoice(node, node.parentId ? "reply" : "root"),
    );
    return chosen.id;
  };

  const replyPicker: ChoicePicker = async (ctx, io) => {
    for (;;) {
      const thread = await pickThreadNode(ctx, io);
      const replies = await fetchReplies(ctx, thread.id);
      if (replies.length === 0) {
        io.intro?.("That thread has no replies — choose another.");
        continue;
      }
      const chosen = await selectNode(io, "Reply", replies, (node) =>
        threadChoice(node),
      );
      return chosen.id;
    }
  };

  return { rootThreadPicker, commentOrReplyPicker, replyPicker };
}

/**
 * Render a searchable single-select over `nodes` and return the chosen node.
 * Throws {@link InteractiveCancelledError} on cancel. The returned value is
 * always one of `nodes` (the autocomplete only yields a provided option value).
 */
async function selectNode<T extends { id: string }>(
  io: PromptIO,
  message: string,
  nodes: T[],
  toChoice: (node: T) => Choice,
): Promise<T> {
  const answer = await io.autocomplete({
    message,
    options: nodes.map(toChoice),
  });
  if (io.isCancel(answer)) {
    throw new InteractiveCancelledError();
  }
  const chosen = nodes.find((node) => node.id === answer);
  if (chosen === undefined) {
    throw new InteractiveCancelledError();
  }
  return chosen;
}

/**
 * Map a discussion comment (root thread or reply) to a picker choice. The label
 * is the first line of the body; the hint carries the author and, for resolved
 * threads, a resolved marker (plus an optional `role` prefix so a combined
 * root+reply list stays legible).
 */
function threadChoice(
  comment: DiscussionThread,
  role?: "root" | "reply",
): Choice {
  const firstLine = comment.body.split("\n")[0]?.slice(0, 72) || comment.id;
  const hintParts: string[] = [];
  if (role) hintParts.push(role);
  if (comment.user?.displayName) hintParts.push(comment.user.displayName);
  if (comment.resolvedAt) hintParts.push("resolved");
  return {
    value: comment.id,
    label: firstLine,
    ...(hintParts.length > 0 ? { hint: hintParts.join(" · ") } : {}),
  };
}
