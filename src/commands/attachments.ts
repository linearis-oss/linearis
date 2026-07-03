import type { Command } from "commander";
import {
  type CommandContext,
  createContext,
  getRootOpts,
} from "../common/context.js";
import {
  InteractiveCancelledError,
  invalidParameterError,
} from "../common/errors.js";
import { asUuid } from "../common/identifier.js";
import { issueChoices } from "../common/interactive/choices.js";
import { maybeCollectInteractive } from "../common/interactive/engine.js";
import type { PromptIO, PromptSpec } from "../common/interactive/types.js";
import { handleCommand, outputSuccess } from "../common/output.js";
import { type DomainMeta, formatDomainUsage } from "../common/usage.js";
import { resolveIssueId } from "../resolvers/issue-resolver.js";
import {
  buildAttachmentFilter,
  type CreateAttachmentInput,
  createAttachment,
  deleteAttachment,
  listAttachments,
} from "../services/attachment-service.js";

export const ATTACHMENTS_META: DomainMeta = {
  name: "attachments",
  summary: "linked external resources on issues (PRs, commits, URLs)",
  context: [
    "attachments link external resources to issues. they represent GitHub",
    "pull requests, commits, Slack messages, or arbitrary URLs. each has a",
    "title, subtitle, sourceType (e.g. 'github', 'slack'), and metadata",
    "with integration-specific data. creating an attachment with the same",
    "url on the same issue updates the existing record (idempotent).",
    "in a terminal, run with -i (or omit a required arg) to pick the issue",
    "or attachment and enter title/url interactively.",
  ].join("\n"),
  arguments: {
    issue: "issue identifier (UUID or ABC-123)",
    id: "attachment UUID",
  },
  seeAlso: ["issues read --with-attachments"],
};

interface ListOptions {
  issue?: string;
  sourceType?: string;
  title?: string;
  createdAfter?: string;
  createdBefore?: string;
}

interface CreateOptions {
  issue?: string;
  title: string;
  url: string;
  subtitle?: string;
  comment?: string;
  iconUrl?: string;
}

/** Create-wizard shape: create options with an index signature. */
type CreateWizardOptions = Partial<CreateOptions> & Record<string, unknown>;

/**
 * Interactive wizard for `attachments create`. `--title` and `--url` become
 * required text fields; the `[issue]` positional is filled by the issue picker.
 */
export const attachmentCreateSpec: PromptSpec<CreateWizardOptions> = {
  intro: "Create an attachment on an issue",
  fields: [
    { name: "title", kind: "text", message: "Title", required: true },
    { name: "url", kind: "text", message: "URL", required: true },
    { name: "subtitle", kind: "text", message: "Subtitle" },
  ],
};

/** Entity picker for an absent `[issue]` positional (shared loader). */
async function issuePicker(ctx: CommandContext, io: PromptIO): Promise<string> {
  const options = await issueChoices(ctx);
  const answer = await io.select({ message: "Issue", options });
  if (io.isCancel(answer)) {
    throw new InteractiveCancelledError();
  }
  return answer as string;
}

/**
 * Cross-field picker for an absent attachment `<id>`. First picks the parent
 * issue, then lists that issue's attachments and returns the selected
 * attachment's UUID (which `asUuid` accepts unchanged downstream).
 */
async function attachmentPicker(
  ctx: CommandContext,
  io: PromptIO,
): Promise<string> {
  const issueIdentifier = await issuePicker(ctx, io);
  const issueId = await resolveIssueId(ctx.gql, issueIdentifier);
  const attachments = await listAttachments(ctx.gql, issueId);
  const options = attachments.map((att) => ({
    value: att.id,
    label: att.title || att.url,
    ...(att.sourceType ? { hint: att.sourceType } : {}),
  }));
  if (options.length === 0) {
    throw invalidParameterError("id", "the selected issue has no attachments");
  }
  const answer = await io.select({ message: "Attachment", options });
  if (io.isCancel(answer)) {
    throw new InteractiveCancelledError();
  }
  return answer as string;
}

const EMPTY_SPEC: PromptSpec<Record<string, never>> = { fields: [] };

/** Fill an absent `[issue]` positional via the issue picker when gating allows. */
async function resolveIssuePositional(
  ctx: CommandContext,
  command: Command,
  issue: string | undefined,
): Promise<string | undefined> {
  const filled = await maybeCollectInteractive<Record<string, never>, string>(
    ctx,
    getRootOpts(command),
    {
      spec: EMPTY_SPEC,
      options: {},
      missingRequired: issue === undefined,
      positional: { name: "issue", value: issue, picker: issuePicker },
    },
  );
  return filled.positional;
}

/**
 * Fill an absent attachment `<id>` via {@link attachmentPicker} when gating
 * allows, else preserve the old missing-argument error.
 */
async function resolveAttachmentPositional(
  ctx: CommandContext,
  command: Command,
  id: string | undefined,
): Promise<string> {
  const filled = await maybeCollectInteractive<Record<string, never>, string>(
    ctx,
    getRootOpts(command),
    {
      spec: EMPTY_SPEC,
      options: {},
      missingRequired: id === undefined,
      positional: { name: "id", value: id, picker: attachmentPicker },
    },
  );
  if (filled.positional === undefined) {
    throw invalidParameterError("id", "is required");
  }
  return filled.positional;
}

function resolveIssueArgument(
  positionalIssue: string | undefined,
  optionIssue: string | undefined,
): string {
  if (positionalIssue && optionIssue) {
    throw invalidParameterError(
      "--issue",
      "cannot be combined with positional issue",
    );
  }

  const issue = positionalIssue ?? optionIssue;
  if (!issue) {
    throw invalidParameterError("issue", "is required");
  }

  return issue;
}

export function setupAttachmentsCommands(program: Command): void {
  const attachments = program
    .command("attachments")
    .description("Attachment operations");

  attachments.action(() => attachments.help());

  attachments
    .command("list [issue]")
    .description("list attachments on an issue")
    .option("--issue <issue>", "issue identifier (alias for positional issue)")
    .option(
      "--source-type <type>",
      "filter by source type (e.g. github, slack)",
    )
    .option("--title <title>", "filter by title (case-insensitive)")
    .option("--created-after <date>", "created after date (YYYY-MM-DD)")
    .option("--created-before <date>", "created before date (YYYY-MM-DD)")
    .action(
      handleCommand(async (...args: unknown[]) => {
        const [issueArg, options, command] = args as [
          string | undefined,
          ListOptions,
          Command,
        ];
        const ctx = createContext(getRootOpts(command));
        const issue =
          issueArg === undefined && options.issue === undefined
            ? await resolveIssuePositional(ctx, command, issueArg)
            : issueArg;
        const issueIdentifier = resolveIssueArgument(issue, options.issue);
        const issueId = await resolveIssueId(ctx.gql, issueIdentifier);
        const filter = buildAttachmentFilter(options);
        const result = await listAttachments(ctx.gql, issueId, filter);
        outputSuccess(result);
      }),
    );

  attachments
    .command("create [issue]")
    .description("create an attachment on an issue")
    .option("--issue <issue>", "issue identifier (alias for positional issue)")
    .option("--title <title>", "attachment title (required)")
    .option("--url <url>", "attachment URL (required)")
    .option("--subtitle <text>", "attachment subtitle")
    .option("--comment <text>", "comment body to create with the attachment")
    .option("--icon-url <url>", "attachment icon URL")
    .action(
      handleCommand(async (...args: unknown[]) => {
        const [issueArg, rawOptions, command] = args as [
          string | undefined,
          Partial<CreateOptions>,
          Command,
        ];
        const ctx = createContext(getRootOpts(command));

        const filled = await maybeCollectInteractive<
          CreateWizardOptions,
          string
        >(ctx, getRootOpts(command), {
          spec: attachmentCreateSpec,
          options: rawOptions as CreateWizardOptions,
          missingRequired:
            (issueArg === undefined && rawOptions.issue === undefined) ||
            rawOptions.title === undefined ||
            rawOptions.url === undefined,
          // Only offer the issue picker when the issue was not already supplied
          // via --issue; otherwise the picked value would collide with
          // options.issue in resolveIssueArgument.
          ...(rawOptions.issue === undefined
            ? {
                positional: {
                  name: "issue",
                  value: issueArg,
                  picker: issuePicker,
                },
              }
            : {}),
        });
        const options = filled.options as CreateOptions;
        const issue = filled.positional;

        if (options.title === undefined) {
          throw invalidParameterError("--title", "is required");
        }
        if (options.url === undefined) {
          throw invalidParameterError("--url", "is required");
        }

        const issueIdentifier = resolveIssueArgument(issue, options.issue);
        const issueId = await resolveIssueId(ctx.gql, issueIdentifier);
        const input: CreateAttachmentInput = {
          issueId,
          title: options.title,
          url: options.url,
          ...(options.subtitle && { subtitle: options.subtitle }),
          ...(options.comment && { commentBody: options.comment }),
          ...(options.iconUrl && { iconUrl: options.iconUrl }),
        };
        const result = await createAttachment(ctx.gql, input);
        outputSuccess(result);
      }),
    );

  attachments
    .command("delete [id]")
    .description("delete an attachment by UUID")
    .action(
      handleCommand(async (...args: unknown[]) => {
        const [idArg, , command] = args as [
          string | undefined,
          unknown,
          Command,
        ];
        const ctx = createContext(getRootOpts(command));
        const id = await resolveAttachmentPositional(ctx, command, idArg);
        const result = await deleteAttachment(ctx.gql, asUuid(id));
        outputSuccess(result);
      }),
    );

  attachments
    .command("usage")
    .description("show detailed usage for attachments")
    .action(() => {
      console.log(formatDomainUsage(attachments, ATTACHMENTS_META));
    });
}
