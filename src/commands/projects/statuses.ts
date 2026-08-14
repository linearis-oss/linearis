import type { Command } from "commander";
import { createContext, getRootOpts } from "../../common/context.js";
import { invalidParameterError } from "../../common/errors.js";
import type { UUID } from "../../common/identifier.js";
import { commandAction, outputSuccess } from "../../common/output.js";
import type { ProjectStatusType } from "../../gql/graphql.js";
import { resolveProjectStatusId } from "../../resolvers/project-status-resolver.js";
import {
  type ArchivedProjectStatus,
  archiveProjectStatus,
  type CreateProjectStatusInput,
  createProjectStatus,
  getProjectStatus,
  listProjectStatuses,
  reassignProjectStatus,
  type UpdateProjectStatusInput,
  unarchiveProjectStatus,
  updateProjectStatus,
} from "../../services/project-status-service.js";

const STATUS_TYPES = [
  "backlog",
  "planned",
  "started",
  "paused",
  "completed",
  "canceled",
] as const satisfies readonly ProjectStatusType[];

interface StatusesListOptions {
  includeArchived?: boolean;
}

// `--type` and `--color` are requiredOption, so commander guarantees them.
interface StatusesCreateOptions {
  type: string;
  color: string;
  description?: string;
  position?: string;
  indefinite?: boolean;
}

interface StatusesUpdateOptions {
  name?: string;
  type?: string;
  color?: string;
  description?: string;
  position?: string;
  indefinite?: boolean;
  notIndefinite?: boolean;
}

interface StatusesArchiveOptions {
  reassignTo?: string;
}

function parseStatusType(value: string): ProjectStatusType {
  const match = STATUS_TYPES.find((type) => type === value);
  if (!match) {
    throw invalidParameterError(
      "--type",
      `must be one of: ${STATUS_TYPES.join(", ")}`,
    );
  }
  return match;
}

function parsePosition(value: string): number {
  // Number.parseFloat stops at the first non-numeric character, so "1O" would
  // silently become position 1. Match the whole string before converting.
  if (!/^-?\d+(\.\d+)?$/.test(value)) {
    throw invalidParameterError("--position", "must be a number");
  }
  return Number.parseFloat(value);
}

/**
 * Archives a status whose projects have just been moved elsewhere.
 *
 * The reassignment is already committed by the time the archive runs, and
 * Linear offers no transaction to tie the two together — it will still refuse
 * to archive, for instance, the last status of a type. Rolling the projects
 * back would be a second guess at what the caller wanted, so the error says
 * plainly where they ended up instead of leaving the caller to discover it.
 */
async function archiveAfterReassign(
  ctx: ReturnType<typeof createContext>,
  statusId: UUID,
  reassignTo: string,
): Promise<ArchivedProjectStatus> {
  try {
    return await archiveProjectStatus(ctx.gql, statusId);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);

    throw new Error(
      `${reason} — projects were already moved to "${reassignTo}" and were not moved back`,
    );
  }
}

export function setupProjectStatusCommands(projects: Command): void {
  const statuses = projects
    .command("statuses")
    .description("workspace project status flow operations")
    .addHelpText(
      "after",
      "\nProject statuses are workspace-scoped, not per-team: every project\n" +
        "in the workspace draws its status from this one ordered list.",
    );

  statuses
    .command("list")
    .description("list the workspace project statuses")
    .option("--include-archived", "include archived statuses")
    .addHelpText(
      "after",
      "\nThe flow is read in one page of 250, with `truncated` set when the\n" +
        "workspace holds more than that.",
    )
    .action(
      commandAction<[StatusesListOptions, Command]>(
        async (options, command) => {
          const ctx = createContext(getRootOpts(command));
          const result = await listProjectStatuses(
            ctx.gql,
            options.includeArchived ?? false,
          );
          outputSuccess(result);
        },
      ),
    );

  statuses
    .command("read <status>")
    .description("get a project status with its project count")
    .action(
      commandAction<[string, unknown, Command]>(
        async (status, _unused1, command) => {
          const ctx = createContext(getRootOpts(command));
          const statusId = await resolveProjectStatusId(ctx.gql, status, {
            includeArchived: true,
          });
          const result = await getProjectStatus(ctx.gql, statusId);
          outputSuccess(result);
        },
      ),
    );

  statuses
    .command("create <name>")
    .description("create a project status")
    .requiredOption("--type <type>", STATUS_TYPES.join(" | "))
    .requiredOption("--color <hex>", "status color as a hex string")
    .option("--description <text>", "status description")
    .option("--position <n>", "position in the flow; default is last")
    .option("--indefinite", "projects may stay in this status indefinitely")
    .action(
      commandAction<[string, StatusesCreateOptions, Command]>(
        async (name, options, command) => {
          const ctx = createContext(getRootOpts(command));

          const input: CreateProjectStatusInput = {
            name,
            type: parseStatusType(options.type),
            color: options.color,
          };

          if (options.description !== undefined) {
            input.description = options.description;
          }

          if (options.position !== undefined) {
            input.position = parsePosition(options.position);
          }

          if (options.indefinite) {
            input.indefinite = true;
          }

          const result = await createProjectStatus(ctx.gql, input);
          outputSuccess(result);
        },
      ),
    );

  statuses
    .command("update <status>")
    .description("update a project status")
    .option("--name <name>", "new name")
    .option("--type <type>", STATUS_TYPES.join(" | "))
    .option("--color <hex>", "new color as a hex string")
    .option("--description <text>", "new description")
    .option("--position <n>", "new position in the flow")
    .option("--indefinite", "projects may stay in this status indefinitely")
    .option("--not-indefinite", "projects may not stay in this status forever")
    .action(
      commandAction<[string, StatusesUpdateOptions, Command]>(
        async (status, options, command) => {
          const ctx = createContext(getRootOpts(command));

          const input: UpdateProjectStatusInput = {};

          if (options.name !== undefined) {
            input.name = options.name;
          }

          if (options.type !== undefined) {
            input.type = parseStatusType(options.type);
          }

          if (options.color !== undefined) {
            input.color = options.color;
          }

          if (options.description !== undefined) {
            input.description = options.description;
          }

          if (options.position !== undefined) {
            input.position = parsePosition(options.position);
          }

          if (options.indefinite && options.notIndefinite) {
            throw invalidParameterError(
              "--indefinite",
              "cannot be combined with --not-indefinite",
            );
          }

          if (options.indefinite) {
            input.indefinite = true;
          } else if (options.notIndefinite) {
            input.indefinite = false;
          }

          if (Object.keys(input).length === 0) {
            throw invalidParameterError(
              "update options",
              "at least one option must be provided",
            );
          }

          const statusId = await resolveProjectStatusId(ctx.gql, status, {
            includeArchived: true,
          });
          const result = await updateProjectStatus(ctx.gql, statusId, input);
          outputSuccess(result);
        },
      ),
    );

  statuses
    .command("archive <status>")
    .description("archive a project status")
    .addHelpText(
      "after",
      "\nLinear refuses to archive a status that still has projects in it.\n" +
        "--reassign-to moves them first, which is the only way to make that\n" +
        "failure recoverable in one step.",
    )
    .option(
      "--reassign-to <status>",
      "move projects onto this status before archiving",
    )
    .action(
      commandAction<[string, StatusesArchiveOptions, Command]>(
        async (status, options, command) => {
          const ctx = createContext(getRootOpts(command));

          const statusId = await resolveProjectStatusId(ctx.gql, status);

          if (options.reassignTo !== undefined) {
            const newStatusId = await resolveProjectStatusId(
              ctx.gql,
              options.reassignTo,
            );

            if (newStatusId === statusId) {
              throw invalidParameterError(
                "--reassign-to",
                "must name a different status than the one being archived",
              );
            }

            await reassignProjectStatus(ctx.gql, statusId, newStatusId);

            outputSuccess(
              await archiveAfterReassign(ctx, statusId, options.reassignTo),
            );
            return;
          }

          const result = await archiveProjectStatus(ctx.gql, statusId);
          outputSuccess(result);
        },
      ),
    );

  statuses
    .command("unarchive <status>")
    .description("unarchive a project status")
    .action(
      commandAction<[string, unknown, Command]>(
        async (status, _unused1, command) => {
          const ctx = createContext(getRootOpts(command));
          const statusId = await resolveProjectStatusId(ctx.gql, status, {
            includeArchived: true,
          });
          const result = await unarchiveProjectStatus(ctx.gql, statusId);
          outputSuccess(result);
        },
      ),
    );
}
