import type { Command } from "commander";
import { createContext, getRootOpts } from "../../common/context.js";
import { parseHealth } from "../../common/domain-values.js";
import { invalidParameterError } from "../../common/errors.js";
import { asUuid } from "../../common/identifier.js";
import {
  commandAction,
  outputSuccess,
  parseLimit,
} from "../../common/output.js";
import { buildPaginationOptions } from "../../common/types.js";
import { resolveProjectId } from "../../resolvers/project-resolver.js";
import { resolveUserId } from "../../resolvers/user-resolver.js";
import {
  archiveProjectUpdate,
  type CreateProjectUpdateInput,
  createProjectUpdate,
  type EditProjectUpdateInput,
  editProjectUpdate,
  getProjectUpdate,
  listProjectUpdates,
  remindProjectUpdate,
  unarchiveProjectUpdate,
} from "../../services/project-update-service.js";

interface ProjectUpdatesListOptions {
  project: string;
  limit: string;
  after?: string;
  includeArchived?: boolean;
}

interface ProjectUpdatesCreateOptions {
  project: string;
  body?: string;
  health?: string;
  hideDiff?: boolean;
}

interface ProjectUpdatesUpdateOptions {
  body?: string;
  health?: string;
}

interface ProjectUpdatesRemindOptions {
  project: string;
  user?: string;
}

export function setupProjectUpdateCommands(projects: Command): void {
  const updates = projects
    .command("updates")
    .description("project status update operations");

  updates
    .command("list")
    .description("list project status updates")
    .requiredOption("--project <project>", "project name or UUID")
    .option("-l, --limit <n>", "max results", "50")
    .option("--after <cursor>", "cursor for next page")
    .option("--include-archived", "include archived updates")
    .action(
      commandAction<[ProjectUpdatesListOptions, Command]>(
        async (options, command) => {
          const ctx = createContext(getRootOpts(command));

          const projectId = await resolveProjectId(ctx.gql, options.project);

          const result = await listProjectUpdates(ctx.gql, {
            projectId,
            ...buildPaginationOptions(parseLimit(options.limit), options.after),
            includeArchived: options.includeArchived ?? false,
          });

          outputSuccess(result);
        },
      ),
    );

  updates
    .command("read <update>")
    .description("get project status update details")
    .action(
      commandAction<[string, unknown, Command]>(
        async (updateId, _unused1, command) => {
          const ctx = createContext(getRootOpts(command));
          const result = await getProjectUpdate(ctx.gql, asUuid(updateId));
          outputSuccess(result);
        },
      ),
    );

  updates
    .command("create")
    .description("post a project status update")
    .requiredOption("--project <project>", "project name or UUID")
    .option("--body <text>", "update body (markdown)")
    .option("--health <health>", "onTrack, atRisk, offTrack")
    .option("--hide-diff", "hide the diff against the previous update")
    .action(
      commandAction<[ProjectUpdatesCreateOptions, Command]>(
        async (options, command) => {
          const ctx = createContext(getRootOpts(command));

          const projectId = await resolveProjectId(ctx.gql, options.project);

          const input: CreateProjectUpdateInput = { projectId };

          if (options.body !== undefined) {
            input.body = options.body;
          }

          const health = parseHealth(options.health);
          if (health) {
            input.health = health;
          }

          if (options.hideDiff) {
            input.isDiffHidden = true;
          }

          const result = await createProjectUpdate(ctx.gql, input);
          outputSuccess(result);
        },
      ),
    );

  updates
    .command("update <update>")
    .description("edit a project status update")
    .option("--body <text>", "new body (markdown)")
    .option("--health <health>", "onTrack, atRisk, offTrack")
    .action(
      commandAction<[string, ProjectUpdatesUpdateOptions, Command]>(
        async (updateId, options, command) => {
          const ctx = createContext(getRootOpts(command));

          const input: EditProjectUpdateInput = {};

          if (options.body !== undefined) {
            input.body = options.body;
          }

          const health = parseHealth(options.health);
          if (health) {
            input.health = health;
          }

          if (Object.keys(input).length === 0) {
            throw invalidParameterError(
              "update options",
              "at least one option must be provided",
            );
          }

          const result = await editProjectUpdate(
            ctx.gql,
            asUuid(updateId),
            input,
          );
          outputSuccess(result);
        },
      ),
    );

  updates
    .command("archive <update>")
    .description("archive a project status update")
    .action(
      commandAction<[string, unknown, Command]>(
        async (updateId, _unused1, command) => {
          const ctx = createContext(getRootOpts(command));
          const result = await archiveProjectUpdate(ctx.gql, asUuid(updateId));
          outputSuccess(result);
        },
      ),
    );

  updates
    .command("unarchive <update>")
    .description("unarchive a project status update")
    .action(
      commandAction<[string, unknown, Command]>(
        async (updateId, _unused1, command) => {
          const ctx = createContext(getRootOpts(command));
          const result = await unarchiveProjectUpdate(
            ctx.gql,
            asUuid(updateId),
          );
          outputSuccess(result);
        },
      ),
    );

  updates
    .command("remind")
    .description("notify someone that the project is due an update")
    .requiredOption("--project <project>", "project name or UUID")
    .option("--user <user>", "user to remind; omitted, Linear picks the target")
    .action(
      commandAction<[ProjectUpdatesRemindOptions, Command]>(
        async (options, command) => {
          const ctx = createContext(getRootOpts(command));

          const projectId = await resolveProjectId(ctx.gql, options.project);
          const userId = options.user
            ? await resolveUserId(ctx.gql, options.user)
            : undefined;

          const result = await remindProjectUpdate(ctx.gql, projectId, userId);
          outputSuccess(result);
        },
      ),
    );
}
