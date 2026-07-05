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
import { asUuid, type UUID } from "../common/identifier.js";
import {
  documentChoices,
  issueChoices,
  optionalChoices,
  projectChoices,
  teamChoices,
} from "../common/interactive/choices.js";
import { maybeCollectInteractive } from "../common/interactive/engine.js";
import type { PromptIO, PromptSpec } from "../common/interactive/types.js";
import { omitUndefined } from "../common/object.js";
import { handleCommand, outputSuccess, parseLimit } from "../common/output.js";
import { type DomainMeta, formatDomainUsage } from "../common/usage.js";
import { resolveIssueId } from "../resolvers/issue-resolver.js";
import { resolveProjectId } from "../resolvers/project-resolver.js";
import { resolveTeamId } from "../resolvers/team-resolver.js";
import { listAttachments } from "../services/attachment-service.js";
import {
  buildIssueDocumentFilter,
  buildProjectDocumentFilter,
  createDocument,
  deleteDocument,
  getDocument,
  listDocuments,
  type UpdateDocumentInput,
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
  attachTo?: string;
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
function extractDocumentIdFromUrl(url: string): string | null {
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
    if (docSlug === undefined) {
      return null;
    }
    const lastHyphenIndex = docSlug.lastIndexOf("-");
    if (lastHyphenIndex === -1) {
      return docSlug || null;
    }

    return docSlug.substring(lastHyphenIndex + 1) || null;
  } catch {
    // URL constructor throws on malformed input — treat as unresolvable.
    return null;
  }
}

/** Create-wizard shape: the create options plus the `title` positional. */
type DocumentCreateWizardOptions = Partial<DocumentCreateOptions> &
  Record<string, unknown>;

/** Update-wizard shape: the update options with an index signature. */
type DocumentUpdateWizardOptions = DocumentUpdateOptions &
  Record<string, unknown>;

/**
 * Interactive wizard for `documents create`. `--title` is a required text
 * field; project/team choice values are UUIDs (see choices.ts), which the
 * `resolveProjectId`/`resolveTeamId` resolvers pass through unchanged.
 */
export const documentCreateSpec: PromptSpec<DocumentCreateWizardOptions> = {
  intro: "Create a new document",
  fields: [
    { name: "title", kind: "text", message: "Title", required: true },
    { name: "content", kind: "multiline", message: "Content (markdown)" },
    {
      name: "project",
      kind: "select",
      message: "Project",
      choices: optionalChoices(projectChoices, "None (no project)"),
    },
    {
      name: "team",
      kind: "select",
      message: "Team",
      choices: optionalChoices(teamChoices, "None (no team)"),
    },
    { name: "icon", kind: "text", message: "Icon" },
    { name: "color", kind: "text", message: "Icon color" },
    {
      name: "issue",
      kind: "select",
      message: "Attach to issue",
      searchable: true,
      choices: optionalChoices(issueChoices, "None (standalone document)"),
    },
  ],
};

/**
 * Interactive wizard for `documents update`. All fields optional; a field
 * already supplied by a flag is skipped, the rest are prompted fresh (the
 * wizard does not pre-load the document's current values).
 */
export const documentUpdateSpec: PromptSpec<DocumentUpdateWizardOptions> = {
  intro: "Update a document",
  fields: [
    { name: "title", kind: "text", message: "Title" },
    {
      name: "content",
      kind: "multiline",
      message: "Content (markdown)",
    },
    {
      name: "project",
      kind: "select",
      message: "Project",
      choices: optionalChoices(projectChoices, "Keep current"),
    },
    { name: "icon", kind: "text", message: "Icon" },
    {
      name: "color",
      kind: "text",
      message: "Icon color",
    },
  ],
};

/**
 * Entity picker for an absent `[document]` positional. Lists recent documents
 * and returns the selected document's UUID (which `asUuid` accepts).
 */
async function documentPicker(
  ctx: CommandContext,
  io: PromptIO,
): Promise<string> {
  const options = await documentChoices(ctx);
  if (options.length === 0) {
    throw invalidParameterError("document", "no documents are available");
  }
  const answer = await io.select({ message: "Document", options });
  if (io.isCancel(answer)) {
    throw new InteractiveCancelledError();
  }
  return answer as string;
}

const EMPTY_SPEC: PromptSpec<Record<string, never>> = { fields: [] };

/**
 * Fill an absent `[document]` positional via {@link documentPicker} when gating
 * allows, else preserve the old missing-argument error.
 */
async function resolveDocumentPositional(
  ctx: CommandContext,
  command: Command,
  document: string | undefined,
): Promise<string> {
  const filled = await maybeCollectInteractive<Record<string, never>, string>(
    ctx,
    getRootOpts(command),
    {
      spec: EMPTY_SPEC,
      options: {},
      missingRequired: document === undefined,
      positional: { name: "document", value: document, picker: documentPicker },
    },
  );
  if (filled.positional === undefined) {
    throw invalidParameterError("document", "is required");
  }
  return filled.positional;
}

export const DOCUMENTS_META: DomainMeta = {
  name: "documents",
  summary: "long-form markdown docs attached to projects or issues",
  context: [
    "a document is a markdown page. it can belong to a project and/or be",
    "attached to an issue. documents support icons and colors.",
    "in a terminal, run with -i (or omit a required arg) to pick the",
    "document and enter fields interactively.",
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

        const rootOpts = getRootOpts(command);
        const ctx = createContext(rootOpts);

        const limit = parseLimit(options.limit || "50");

        let projectId: UUID | undefined;
        if (options.project) {
          projectId = await resolveProjectId(ctx.gql, options.project);
        }

        let issueId: UUID | undefined;
        if (options.issue) {
          issueId = await resolveIssueId(ctx.gql, options.issue);
        }

        let filter: ReturnType<typeof buildIssueDocumentFilter> | undefined;
        if (projectId) {
          filter = buildProjectDocumentFilter(projectId);
        } else if (issueId) {
          const attachments = await listAttachments(ctx.gql, issueId);
          const legacyDocumentSlugIds = [
            ...new Set(
              attachments
                .map((att) => extractDocumentIdFromUrl(att.url))
                .filter((id): id is string => id !== null),
            ),
          ];
          filter = buildIssueDocumentFilter(issueId, legacyDocumentSlugIds);
        }

        const documents = await listDocuments(
          ctx.gql,
          omitUndefined({
            limit,
            after: options.after,
            filter,
          }),
        );

        outputSuccess(documents);
      }),
    );

  documents
    .command("read [document]")
    .description("get document content")
    .action(
      handleCommand(async (...args: unknown[]) => {
        const [documentArg, , command] = args as [
          string | undefined,
          unknown,
          Command,
        ];
        const rootOpts = getRootOpts(command);
        const ctx = createContext(rootOpts);
        const document = await resolveDocumentPositional(
          ctx,
          command,
          documentArg,
        );

        const documentResult = await getDocument(ctx.gql, asUuid(document));
        outputSuccess(documentResult);
      }),
    );

  documents
    .command("create")
    .description("create a new document")
    .option("--title <title>", "document title (required)")
    .option("--content <text>", "document content (markdown)")
    .option("--project <project>", "project name or ID")
    .option("--team <team>", "team key or name")
    .option("--icon <icon>", "document icon")
    .option("--color <color>", "icon color")
    .option("--issue <issue>", "also attach document to issue (e.g., ABC-123)")
    .option("--attach-to <issue>", "alias for --issue")
    .action(
      handleCommand(async (...args: unknown[]) => {
        const [rawOptions, command] = args as [
          Partial<DocumentCreateOptions>,
          Command,
        ];
        const rootOpts = getRootOpts(command);
        const ctx = createContext(rootOpts);

        const filled = await maybeCollectInteractive<
          DocumentCreateWizardOptions,
          never
        >(ctx, rootOpts, {
          spec: documentCreateSpec,
          options: rawOptions as DocumentCreateWizardOptions,
          missingRequired: rawOptions.title === undefined,
        });
        const options = filled.options as DocumentCreateOptions;

        if (options.title === undefined) {
          throw invalidParameterError("--title", "is required");
        }

        if (options.issue && options.attachTo) {
          throw invalidParameterError(
            "--attach-to",
            "cannot be combined with --issue",
          );
        }

        const issueIdentifier = options.issue ?? options.attachTo;

        const projectId = options.project
          ? await resolveProjectId(ctx.gql, options.project)
          : undefined;
        const teamId = options.team
          ? await resolveTeamId(ctx.gql, options.team)
          : undefined;
        const issueId = issueIdentifier
          ? await resolveIssueId(ctx.gql, issueIdentifier)
          : undefined;

        const document = await createDocument(ctx.gql, {
          title: options.title,
          content: options.content,
          projectId,
          teamId,
          issueId,
          icon: options.icon,
          color: options.color,
        });

        outputSuccess(document);
      }),
    );

  documents
    .command("update [document]")
    .description("update an existing document")
    .option("--title <title>", "new title")
    .option("--content <text>", "new content (markdown)")
    .option("--project <project>", "move to project")
    .option("--icon <icon>", "new icon")
    .option("--color <color>", "new icon color")
    .action(
      handleCommand(async (...args: unknown[]) => {
        const [documentArg, rawOptions, command] = args as [
          string | undefined,
          DocumentUpdateOptions,
          Command,
        ];
        const rootOpts = getRootOpts(command);
        const ctx = createContext(rootOpts);

        const filled = await maybeCollectInteractive<
          DocumentUpdateWizardOptions,
          string
        >(ctx, rootOpts, {
          spec: documentUpdateSpec,
          options: rawOptions as DocumentUpdateWizardOptions,
          missingRequired: documentArg === undefined,
          positional: {
            name: "document",
            value: documentArg,
            picker: documentPicker,
          },
        });
        if (filled.positional === undefined) {
          throw invalidParameterError("document", "is required");
        }
        const document = filled.positional;
        const options = filled.options as DocumentUpdateOptions;

        const input: UpdateDocumentInput = {};
        if (options.title) input.title = options.title;
        if (options.content) input.content = options.content;
        if (options.project) {
          input.projectId = await resolveProjectId(ctx.gql, options.project);
        }
        if (options.icon) input.icon = options.icon;
        if (options.color) input.color = options.color;

        const updatedDocument = await updateDocument(
          ctx.gql,
          asUuid(document),
          input,
        );
        outputSuccess(updatedDocument);
      }),
    );

  documents
    .command("delete [document]")
    .description("trash a document")
    .action(
      handleCommand(async (...args: unknown[]) => {
        const [documentArg, , command] = args as [
          string | undefined,
          unknown,
          Command,
        ];
        const rootOpts = getRootOpts(command);
        const ctx = createContext(rootOpts);
        const document = await resolveDocumentPositional(
          ctx,
          command,
          documentArg,
        );

        const result = await deleteDocument(ctx.gql, asUuid(document));
        outputSuccess(result);
      }),
    );

  documents
    .command("usage")
    .description("show detailed usage for documents")
    .action(() => {
      console.log(formatDomainUsage(documents, DOCUMENTS_META));
    });
}
