import type { Command } from "commander";
import { createContext, getRootOpts } from "../../common/context.js";
import { invalidParameterError } from "../../common/errors.js";
import type { UUID } from "../../common/identifier.js";
import { commandAction, outputSuccess } from "../../common/output.js";
import { resolveMilestoneId } from "../../resolvers/milestone-resolver.js";
import { resolveProjectRelationId } from "../../resolvers/project-relation-resolver.js";
import { resolveProjectId } from "../../resolvers/project-resolver.js";
import {
  type CreateProjectRelationInput,
  createProjectRelation,
  deleteProjectRelation,
  listProjectRelations,
  PROJECT_RELATION_ANCHORS,
  type ProjectRelationAnchor,
  type UpdateProjectRelationInput,
  updateProjectRelation,
} from "../../services/project-relation-service.js";

const ANCHOR_HELP =
  "\nA project relation joins a point on one project to a point on another.\n" +
  'The default, `--from end --to start`, reads as "this project must\n' +
  "finish before that one starts\" — the shape Linear's UI creates.\n" +
  "\n" +
  "`--from-milestone`/`--to-milestone` anchor an end at a specific\n" +
  "milestone instead of the project's own start or end date.\n" +
  "\n" +
  "Linear declares the relation type and both anchors as plain strings\n" +
  "with no enum, so `start` and `end` are validated here against the\n" +
  "values the live API is known to use.";

interface RelationAddOptions {
  blocks: string;
  from?: string;
  to?: string;
  fromMilestone?: string;
  toMilestone?: string;
}

interface RelationUpdateOptions {
  blocks?: string;
  from?: string;
  to?: string;
  fromMilestone?: string;
  toMilestone?: string;
  clearFromMilestone?: boolean;
  clearToMilestone?: boolean;
}

interface RelationRemoveOptions {
  blocks?: string;
}

function parseAnchor(flag: string, value: string): ProjectRelationAnchor {
  const match = PROJECT_RELATION_ANCHORS.find((anchor) => anchor === value);
  if (!match) {
    throw invalidParameterError(
      flag,
      `must be one of: ${PROJECT_RELATION_ANCHORS.join(", ")}`,
    );
  }
  return match;
}

function rejectContradictoryMilestoneFlags(
  options: RelationUpdateOptions,
): void {
  if (options.fromMilestone && options.clearFromMilestone) {
    throw invalidParameterError(
      "--from-milestone",
      "cannot be combined with --clear-from-milestone",
    );
  }

  if (options.toMilestone && options.clearToMilestone) {
    throw invalidParameterError(
      "--to-milestone",
      "cannot be combined with --clear-to-milestone",
    );
  }
}

export function setupProjectRelationCommands(projects: Command): void {
  const relations = projects
    .command("relations")
    .description("project dependency operations")
    .addHelpText("after", ANCHOR_HELP);

  relations
    .command("list <project>")
    .description("list a project's dependencies in both directions")
    .action(
      commandAction<[string, unknown, Command]>(
        async (project, _unused1, command) => {
          const ctx = createContext(getRootOpts(command));
          const projectId = await resolveProjectId(ctx.gql, project);
          const result = await listProjectRelations(ctx.gql, projectId);
          outputSuccess(result);
        },
      ),
    );

  relations
    .command("add <project>")
    .description("make a project a dependency of another")
    .addHelpText("after", ANCHOR_HELP)
    .requiredOption("--blocks <project>", "the dependent project")
    .option("--from <anchor>", "start | end of <project>", "end")
    .option("--to <anchor>", "start | end of the dependent project", "start")
    .option("--from-milestone <milestone>", "anchor this end at a milestone")
    .option("--to-milestone <milestone>", "anchor the far end at a milestone")
    .action(
      commandAction<[string, RelationAddOptions, Command]>(
        async (project, options, command) => {
          const ctx = createContext(getRootOpts(command));

          const anchorType = parseAnchor("--from", options.from ?? "end");
          const relatedAnchorType = parseAnchor("--to", options.to ?? "start");

          const [projectId, relatedProjectId] = await Promise.all([
            resolveProjectId(ctx.gql, project),
            resolveProjectId(ctx.gql, options.blocks),
          ]);

          if (projectId === relatedProjectId) {
            throw invalidParameterError(
              "--blocks",
              "a project cannot depend on itself",
            );
          }

          const input: CreateProjectRelationInput = {
            projectId,
            relatedProjectId,
            anchorType,
            relatedAnchorType,
          };

          if (options.fromMilestone) {
            input.projectMilestoneId = await resolveMilestoneId(
              ctx.gql,
              options.fromMilestone,
              projectId,
            );
          }

          if (options.toMilestone) {
            input.relatedProjectMilestoneId = await resolveMilestoneId(
              ctx.gql,
              options.toMilestone,
              relatedProjectId,
            );
          }

          outputSuccess(await createProjectRelation(ctx.gql, input));
        },
      ),
    );

  relations
    .command("update <relation>")
    .description("re-anchor an existing dependency")
    .addHelpText("after", ANCHOR_HELP)
    .option(
      "--blocks <project>",
      "treat <relation> as a project and find its relation to this one",
    )
    .option("--from <anchor>", "start | end")
    .option("--to <anchor>", "start | end")
    .option("--from-milestone <milestone>", "anchor this end at a milestone")
    .option("--clear-from-milestone", "anchor this end at the project again")
    .option("--to-milestone <milestone>", "anchor the far end at a milestone")
    .option("--clear-to-milestone", "anchor the far end at the project again")
    .action(
      commandAction<[string, RelationUpdateOptions, Command]>(
        async (relation, options, command) => {
          const ctx = createContext(getRootOpts(command));

          rejectContradictoryMilestoneFlags(options);

          const input: UpdateProjectRelationInput = {};

          if (options.from !== undefined) {
            input.anchorType = parseAnchor("--from", options.from);
          }

          if (options.to !== undefined) {
            input.relatedAnchorType = parseAnchor("--to", options.to);
          }

          if (options.clearFromMilestone) {
            input.projectMilestoneId = null;
          }

          if (options.clearToMilestone) {
            input.relatedProjectMilestoneId = null;
          }

          const { relationId, projectId, relatedProjectId } =
            await resolveRelation(ctx, relation, options.blocks);

          if (options.fromMilestone) {
            input.projectMilestoneId = await resolveMilestoneId(
              ctx.gql,
              options.fromMilestone,
              projectId,
            );
          }

          if (options.toMilestone) {
            input.relatedProjectMilestoneId = await resolveMilestoneId(
              ctx.gql,
              options.toMilestone,
              relatedProjectId,
            );
          }

          if (Object.keys(input).length === 0) {
            throw invalidParameterError(
              "update options",
              "at least one option must be provided",
            );
          }

          outputSuccess(
            await updateProjectRelation(ctx.gql, relationId, input),
          );
        },
      ),
    );

  relations
    .command("remove <relation>")
    .description("remove a dependency")
    .option(
      "--blocks <project>",
      "treat <relation> as a project and find its relation to this one",
    )
    .action(
      commandAction<[string, RelationRemoveOptions, Command]>(
        async (relation, options, command) => {
          const ctx = createContext(getRootOpts(command));
          const { relationId } = await resolveRelation(
            ctx,
            relation,
            options.blocks,
          );
          outputSuccess(await deleteProjectRelation(ctx.gql, relationId));
        },
      ),
    );
}

/**
 * Accepts either a relation UUID or a project pair.
 *
 * Relation IDs appear nowhere but `relations list`, so requiring one would
 * make every edit a two-step operation. `--blocks` lets callers name the
 * relation the same way they created it.
 *
 * The milestone flags read better when scoped to the right project, so the
 * endpoint IDs come back too. On the UUID path they are undefined, and
 * `resolveMilestoneId` falls back to a workspace-wide milestone lookup.
 */
async function resolveRelation(
  ctx: ReturnType<typeof createContext>,
  relation: string,
  blocks: string | undefined,
): Promise<{
  relationId: UUID;
  projectId?: UUID;
  relatedProjectId?: UUID;
}> {
  if (blocks === undefined) {
    return { relationId: await resolveProjectRelationId(ctx.gql, relation) };
  }

  const [projectId, relatedProjectId] = await Promise.all([
    resolveProjectId(ctx.gql, relation),
    resolveProjectId(ctx.gql, blocks),
  ]);

  return {
    relationId: await resolveProjectRelationId(
      ctx.gql,
      projectId,
      relatedProjectId,
    ),
    projectId,
    relatedProjectId,
  };
}
