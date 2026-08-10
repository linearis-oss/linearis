import type { Command } from "commander";
import { createContext, getRootOpts } from "../../common/context.js";
import { invalidParameterError } from "../../common/errors.js";
import type { UUID } from "../../common/identifier.js";
import {
  commandAction,
  outputSuccess,
  parseLimit,
} from "../../common/output.js";
import { buildPaginationOptions } from "../../common/types.js";
import { resolveMilestoneId } from "../../resolvers/milestone-resolver.js";
import { resolveProjectRelation } from "../../resolvers/project-relation-resolver.js";
import { resolveProjectId } from "../../resolvers/project-resolver.js";
import {
  type CreateProjectRelationInput,
  createProjectRelation,
  deleteProjectRelation,
  getProjectRelation,
  listAllProjectRelations,
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

interface RelationListOptions {
  limit: string;
  after?: string;
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
    .command("list [project]")
    .description("list dependencies for a project, or across the workspace")
    .addHelpText(
      "after",
      "\nWith a project, both directions are returned separately.\n" +
        "Without one, the workspace-wide connection is paged instead — it\n" +
        "takes no filter, so -l/--after are the only knobs it has.",
    )
    .option("-l, --limit <n>", "max results (workspace-wide only)", "50")
    .option("--after <cursor>", "cursor for next page (workspace-wide only)")
    .action(
      commandAction<[string | undefined, RelationListOptions, Command]>(
        async (project, options, command) => {
          const ctx = createContext(getRootOpts(command));

          if (project === undefined) {
            outputSuccess(
              await listAllProjectRelations(
                ctx.gql,
                buildPaginationOptions(
                  parseLimit(options.limit),
                  options.after,
                ),
              ),
            );
            return;
          }

          const projectId = await resolveProjectId(ctx.gql, project);
          outputSuccess(await listProjectRelations(ctx.gql, projectId));
        },
      ),
    );

  relations
    .command("read <relation>")
    .description("read one dependency by UUID")
    .action(
      commandAction<[string, unknown, Command]>(
        async (relation, _unused1, command) => {
          const ctx = createContext(getRootOpts(command));
          const { id } = await resolveProjectRelation(ctx.gql, relation);
          outputSuccess(await getProjectRelation(ctx.gql, id));
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

          const ends: RelationEnds = {};

          if (options.from !== undefined) {
            ends.from = parseAnchor("--from", options.from);
          }

          if (options.to !== undefined) {
            ends.to = parseAnchor("--to", options.to);
          }

          if (options.clearFromMilestone) {
            ends.fromMilestoneId = null;
          }

          if (options.clearToMilestone) {
            ends.toMilestoneId = null;
          }

          const { relationId, inverted, projectId, relatedProjectId } =
            await resolveRelation(ctx, relation, options.blocks);

          if (options.fromMilestone) {
            ends.fromMilestoneId = await resolveMilestoneId(
              ctx.gql,
              options.fromMilestone,
              projectId,
            );
          }

          if (options.toMilestone) {
            ends.toMilestoneId = await resolveMilestoneId(
              ctx.gql,
              options.toMilestone,
              relatedProjectId,
            );
          }

          if (Object.keys(ends).length === 0) {
            throw invalidParameterError(
              "update options",
              "at least one option must be provided",
            );
          }

          outputSuccess(
            await updateProjectRelation(
              ctx.gql,
              relationId,
              orientToRelation(ends, inverted),
            ),
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
 * The two ends of a relation as the caller named them: `from` is the project
 * given as the argument, `to` is the one given as `--blocks`.
 */
interface RelationEnds {
  from?: ProjectRelationAnchor;
  to?: ProjectRelationAnchor;
  fromMilestoneId?: UUID | null;
  toMilestoneId?: UUID | null;
}

/**
 * Turn caller-oriented ends into the mutation's relation-oriented fields.
 *
 * `anchorType`/`projectMilestoneId` belong to the relation's own `project`,
 * which is not necessarily the project the caller named first: a relation
 * found through `inverseRelations` is stored the other way round. Writing the
 * flags through unswapped would silently re-anchor the wrong project.
 */
function orientToRelation(
  ends: RelationEnds,
  inverted: boolean,
): UpdateProjectRelationInput {
  const [ownAnchor, farAnchor] = inverted
    ? [ends.to, ends.from]
    : [ends.from, ends.to];
  const [ownMilestoneId, farMilestoneId] = inverted
    ? [ends.toMilestoneId, ends.fromMilestoneId]
    : [ends.fromMilestoneId, ends.toMilestoneId];

  const input: UpdateProjectRelationInput = {};

  if (ownAnchor !== undefined) input.anchorType = ownAnchor;
  if (farAnchor !== undefined) input.relatedAnchorType = farAnchor;
  if (ownMilestoneId !== undefined) input.projectMilestoneId = ownMilestoneId;
  if (farMilestoneId !== undefined) {
    input.relatedProjectMilestoneId = farMilestoneId;
  }

  return input;
}

/**
 * Accepts either a relation UUID or a project pair.
 *
 * Relation IDs appear nowhere but `relations list`, so requiring one would
 * make every edit a two-step operation. `--blocks` lets callers name the
 * relation the same way they created it.
 *
 * The milestone flags must be scoped to the right project, so the endpoint IDs
 * come back too, alongside `inverted` — the relation may be stored with the
 * endpoints the other way round. On the UUID path the IDs are undefined and
 * `resolveMilestoneId` searches the workspace, which is all it can do when the
 * caller addressed the relation itself rather than naming its two ends; there
 * is nothing to invert on that path either.
 */
async function resolveRelation(
  ctx: ReturnType<typeof createContext>,
  relation: string,
  blocks: string | undefined,
): Promise<{
  relationId: UUID;
  inverted: boolean;
  projectId?: UUID;
  relatedProjectId?: UUID;
}> {
  if (blocks === undefined) {
    const resolved = await resolveProjectRelation(ctx.gql, relation);
    return { relationId: resolved.id, inverted: resolved.inverted };
  }

  const [projectId, relatedProjectId] = await Promise.all([
    resolveProjectId(ctx.gql, relation),
    resolveProjectId(ctx.gql, blocks),
  ]);

  const resolved = await resolveProjectRelation(
    ctx.gql,
    projectId,
    relatedProjectId,
  );

  return {
    relationId: resolved.id,
    inverted: resolved.inverted,
    projectId,
    relatedProjectId,
  };
}
