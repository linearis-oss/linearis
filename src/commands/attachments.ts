import type { Command } from "commander";
import { createContext, getRootOpts } from "../common/context.js";
import { handleCommand, outputSuccess } from "../common/output.js";
import { type DomainMeta, formatDomainUsage } from "../common/usage.js";
import type { AttachmentFilter } from "../gql/graphql.js";
import { resolveIssueId } from "../resolvers/issue-resolver.js";
import {
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
  sourceType?: string;
  title?: string;
  createdAfter?: string;
  createdBefore?: string;
}

interface CreateOptions {
  title: string;
  url: string;
  subtitle?: string;
}

function buildAttachmentFilter(
  options: ListOptions,
): AttachmentFilter | undefined {
  const filters: AttachmentFilter[] = [];

  if (options.sourceType) {
    filters.push({ sourceType: { eq: options.sourceType } });
  }
  if (options.title) {
    filters.push({ title: { eqIgnoreCase: options.title } });
  }
  if (options.createdAfter) {
    filters.push({ createdAt: { gte: options.createdAfter } });
  }
  if (options.createdBefore) {
    filters.push({ createdAt: { lt: options.createdBefore } });
  }

  if (filters.length === 0) return undefined;
  if (filters.length === 1) return filters[0];
  return { and: filters };
}

export function setupAttachmentsCommands(program: Command): void {
  const attachments = program
    .command("attachments")
    .description("Attachment operations");

  attachments.action(() => attachments.help());

  attachments
    .command("list <issue>")
    .description("list attachments on an issue")
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
          string,
          ListOptions,
          Command,
        ];
        const ctx = createContext(getRootOpts(command));
        const issueId = await resolveIssueId(ctx.sdk, issue);
        const filter = buildAttachmentFilter(options);
        const result = await listAttachments(ctx.gql, issueId, filter);
        outputSuccess(result);
      }),
    );

  attachments
    .command("create <issue>")
    .description("create an attachment on an issue")
    .requiredOption("--title <title>", "attachment title")
    .requiredOption("--url <url>", "attachment URL")
    .option("--subtitle <text>", "attachment subtitle")
    .action(
      handleCommand(async (...args: unknown[]) => {
        const [issue, options, command] = args as [
          string,
          CreateOptions,
          Command,
        ];
        const ctx = createContext(getRootOpts(command));
        const issueId = await resolveIssueId(ctx.sdk, issue);
        const result = await createAttachment(ctx.gql, {
          issueId,
          title: options.title,
          url: options.url,
          ...(options.subtitle && { subtitle: options.subtitle }),
        });
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
        const result = await deleteAttachment(ctx.gql, id);
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
