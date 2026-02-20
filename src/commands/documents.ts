import type { Command } from "commander";
import { createContext } from "../common/context.js";
import { handleCommand, outputSuccess, parseLimit } from "../common/output.js";
import { type DomainMeta, formatDomainUsage } from "../common/usage.js";
import type { DocumentUpdateInput } from "../gql/graphql.js";
import { resolveIssueId } from "../resolvers/issue-resolver.js";
import { resolveProjectId } from "../resolvers/project-resolver.js";
import { resolveTeamId } from "../resolvers/team-resolver.js";
import {
  createAttachment,
  listAttachments,
} from "../services/attachment-service.js";
import {
  createDocument,
  deleteDocument,
  getDocument,
  listDocuments,
  listDocumentsBySlugIds,
  updateDocument,
} from "../services/document-service.js";

interface DocumentCreateOptions {
  title: string;
  content?: string;
  project?: string;
  team?: string;
  icon?: string;
  color?: string;
  issue?: string;
}

interface DocumentUpdateOptions {
  title?: string;
  content?: string;
  project?: string;
  icon?: string;
  color?: string;
}

interface DocumentListOptions {
  project?: string;
  issue?: string;
  limit?: string;
  after?: string;
}

/** Extracts slug ID from a Linear document URL (e.g. /workspace/document/title-slug-abc123 -> abc123). */
export function extractDocumentIdFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (!parsed.hostname.includes("linear.app")) {
      return null;
    }

    const pathParts = parsed.pathname.split("/");
    const docIndex = pathParts.indexOf("document");
    if (docIndex === -1 || docIndex >= pathParts.length - 1) {
      return null;
    }

    const docSlug = pathParts[docIndex + 1];
    const lastHyphenIndex = docSlug.lastIndexOf("-");
    if (lastHyphenIndex === -1) {
      return docSlug || null;
    }

    return docSlug.substring(lastHyphenIndex + 1) || null;
  } catch {
    return null;
  }
}

export const DOCUMENTS_META: DomainMeta = {
  name: "documents",
  summary: "long-form markdown docs attached to projects or issues",
  context: [
    "a document is a markdown page. it can belong to a project and/or be",
    "attached to an issue. documents support icons and colors.",
  ].join("\n"),
  arguments: {
    document: "document identifier (UUID)",
  },
  seeAlso: ["issues read <issue>", "projects list"],
};

export function setupDocumentsCommands(program: Command): void {
  const documents = program
    .command("documents")
    .description("Document operations (project-level documentation)");

  documents.action(() => documents.help());

  documents
    .command("list")
    .description("list documents")
    .option("--project <project>", "filter by project name or ID")
    .option(
      "--issue <issue>",
      "filter by issue (shows documents attached to the issue)",
    )
    .option("-l, --limit <n>", "max results", "50")
    .option("--after <cursor>", "cursor for next page")
    .action(
      handleCommand(async (...args: unknown[]) => {
        const [options, command] = args as [DocumentListOptions, Command];
        if (options.project && options.issue) {
          throw new Error(
            "Cannot use --project and --issue together. Choose one filter.",
          );
        }

        const rootOpts = command.parent!.parent!.opts();
        const ctx = createContext(rootOpts);

        const limit = parseLimit(options.limit || "50");

        if (options.issue) {
          const issueId = await resolveIssueId(ctx.sdk, options.issue);
          const attachments = await listAttachments(ctx.gql, issueId);

          const documentSlugIds = [
            ...new Set(
              attachments
                .map((att) => extractDocumentIdFromUrl(att.url))
                .filter((id): id is string => id !== null),
            ),
          ];

          if (documentSlugIds.length === 0) {
            outputSuccess({
              nodes: [],
              pageInfo: { hasNextPage: false, endCursor: null },
            });
            return;
          }

          const documents = await listDocumentsBySlugIds(
            ctx.gql,
            documentSlugIds,
          );
          outputSuccess({
            nodes: documents,
            pageInfo: { hasNextPage: false, endCursor: null },
          });
          return;
        }

        let projectId: string | undefined;
        if (options.project) {
          projectId = await resolveProjectId(ctx.sdk, options.project);
        }

        const documents = await listDocuments(ctx.gql, {
          limit,
          after: options.after,
          filter: projectId
            ? { project: { id: { eq: projectId } } }
            : undefined,
        });

        outputSuccess(documents);
      }),
    );

  documents
    .command("read <document>")
    .description("get document content")
    .action(
      handleCommand(async (...args: unknown[]) => {
        const [document, , command] = args as [string, unknown, Command];
        const rootOpts = command.parent!.parent!.opts();
        const ctx = createContext(rootOpts);

        const documentResult = await getDocument(ctx.gql, document);
        outputSuccess(documentResult);
      }),
    );

  documents
    .command("create")
    .description("create a new document")
    .requiredOption("--title <title>", "document title (required)")
    .option("--content <text>", "document content (markdown)")
    .option("--project <project>", "project name or ID")
    .option("--team <team>", "team key or name")
    .option("--icon <icon>", "document icon")
    .option("--color <color>", "icon color")
    .option("--issue <issue>", "also attach document to issue (e.g., ABC-123)")
    .action(
      handleCommand(async (...args: unknown[]) => {
        const [options, command] = args as [DocumentCreateOptions, Command];
        const rootOpts = command.parent!.parent!.opts();
        const ctx = createContext(rootOpts);

        const projectId = options.project
          ? await resolveProjectId(ctx.sdk, options.project)
          : undefined;
        const teamId = options.team
          ? await resolveTeamId(ctx.sdk, options.team)
          : undefined;

        const document = await createDocument(ctx.gql, {
          title: options.title,
          content: options.content,
          projectId,
          teamId,
          icon: options.icon,
          color: options.color,
        });

        if (options.issue) {
          const issueId = await resolveIssueId(ctx.sdk, options.issue);

          try {
            await createAttachment(ctx.gql, {
              issueId,
              url: document.url,
              title: document.title,
            });
          } catch (attachError) {
            const errorMessage =
              attachError instanceof Error
                ? attachError.message
                : String(attachError);
            throw new Error(
              `Document created (${document.id}) but failed to attach to issue "${options.issue}": ${errorMessage}.`,
            );
          }
        }

        outputSuccess(document);
      }),
    );

  documents
    .command("update <document>")
    .description("update an existing document")
    .option("--title <title>", "new title")
    .option("--content <text>", "new content (markdown)")
    .option("--project <project>", "move to project")
    .option("--icon <icon>", "new icon")
    .option("--color <color>", "new icon color")
    .action(
      handleCommand(async (...args: unknown[]) => {
        const [document, options, command] = args as [
          string,
          DocumentUpdateOptions,
          Command,
        ];
        const rootOpts = command.parent!.parent!.opts();
        const ctx = createContext(rootOpts);

        const input: DocumentUpdateInput = {};
        if (options.title) input.title = options.title;
        if (options.content) input.content = options.content;
        if (options.project) {
          input.projectId = await resolveProjectId(ctx.sdk, options.project);
        }
        if (options.icon) input.icon = options.icon;
        if (options.color) input.color = options.color;

        const updatedDocument = await updateDocument(ctx.gql, document, input);
        outputSuccess(updatedDocument);
      }),
    );

  documents
    .command("delete <document>")
    .description("trash a document")
    .action(
      handleCommand(async (...args: unknown[]) => {
        const [document, , command] = args as [string, unknown, Command];
        const rootOpts = command.parent!.parent!.opts();
        const ctx = createContext(rootOpts);

        await deleteDocument(ctx.gql, document);
        outputSuccess({ success: true, message: "Document moved to trash" });
      }),
    );

  documents
    .command("usage")
    .description("show detailed usage for documents")
    .action(() => {
      console.log(formatDomainUsage(documents, DOCUMENTS_META));
    });
}
