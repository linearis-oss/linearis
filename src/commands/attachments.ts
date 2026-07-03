import type { Command } from "commander";
import { createContext, getRootOpts } from "../common/context.js";
import { invalidParameterError } from "../common/errors.js";
import { asUuid } from "../common/identifier.js";
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
        const [issue, options, command] = args as [
          string | undefined,
          ListOptions,
          Command,
        ];
        const issueIdentifier = resolveIssueArgument(issue, options.issue);
        const ctx = createContext(getRootOpts(command));
        const issueId = await resolveIssueId(ctx.sdk, issueIdentifier);
        const filter = buildAttachmentFilter(options);
        const result = await listAttachments(ctx.gql, issueId, filter);
        outputSuccess(result);
      }),
    );

  attachments
    .command("create [issue]")
    .description("create an attachment on an issue")
    .option("--issue <issue>", "issue identifier (alias for positional issue)")
    .requiredOption("--title <title>", "attachment title")
    .requiredOption("--url <url>", "attachment URL")
    .option("--subtitle <text>", "attachment subtitle")
    .option("--comment <text>", "comment body to create with the attachment")
    .option("--icon-url <url>", "attachment icon URL")
    .action(
      handleCommand(async (...args: unknown[]) => {
        const [issue, options, command] = args as [
          string | undefined,
          CreateOptions,
          Command,
        ];
        const issueIdentifier = resolveIssueArgument(issue, options.issue);
        const ctx = createContext(getRootOpts(command));
        const issueId = await resolveIssueId(ctx.sdk, issueIdentifier);
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
    .command("delete <id>")
    .description("delete an attachment by UUID")
    .action(
      handleCommand(async (...args: unknown[]) => {
        const [id, , command] = args as [string, unknown, Command];
        const ctx = createContext(getRootOpts(command));
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
