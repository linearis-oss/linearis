import type { Command } from "commander";
import type { CommandContext } from "../common/context.js";
import {
  type CommandOptions,
  createContext,
  getRootOpts,
} from "../common/context.js";
import {
  InteractiveCancelledError,
  invalidParameterError,
  notFoundError,
  requiresParameterError,
} from "../common/errors.js";
import {
  allCycleChoices,
  teamChoices,
  withNoneChoice,
} from "../common/interactive/choices.js";
import { maybeCollectInteractive } from "../common/interactive/engine.js";
import type { PromptIO, PromptSpec } from "../common/interactive/types.js";
import { handleCommand, outputSuccess, parseLimit } from "../common/output.js";
import { buildPaginationOptions } from "../common/types.js";
import { type DomainMeta, formatDomainUsage } from "../common/usage.js";
import { resolveCycleId } from "../resolvers/cycle-resolver.js";
import { resolveTeamId } from "../resolvers/team-resolver.js";
import { type Cycle, getCycle, listCycles } from "../services/cycle-service.js";

interface CycleListOptions extends CommandOptions {
  team?: string;
  active?: boolean;
  window?: string;
  limit: string;
  after?: string;
}

interface CycleReadOptions extends CommandOptions {
  team?: string;
  limit?: string;
}

/** List-wizard shape: offers a team select to fill `--team` when interactive. */
interface CycleListWizardOptions extends Record<string, unknown> {
  team?: string;
}

/**
 * Interactive spec for `cycles list`. Cycles are team-scoped, so offering a team
 * select lets an interactive user narrow the listing. The team choice value is a
 * UUID (see choices.ts) which the resolver passes through via `isUuid(...)`.
 */
export const cycleListSpec: PromptSpec<CycleListWizardOptions> = {
  intro: "List cycles",
  fields: [
    {
      name: "team",
      kind: "select",
      message: "Team",
      choices: async (ctx) =>
        withNoneChoice(await teamChoices(ctx), "— all teams —"),
    },
  ],
};

/**
 * Entity picker for an absent `[cycle]` positional. Cycles are team-scoped, so
 * this first resolves/prompts the parent team (via `--team` or a team select),
 * then loads that team's cycles via `allCycleChoices({ team })` — the unfiltered
 * loader, since reading a cycle is retrospective and must reach ended cycles too.
 * This is the cross-field-dependency case for the cycles domain: the cycle list
 * is only fetched once the parent team UUID is known.
 *
 * Returns the selected cycle UUID (which the resolver accepts).
 */
function makeCyclePicker(
  teamHint: string | undefined,
): (ctx: CommandContext, io: PromptIO) => Promise<string> {
  return async (ctx, io) => {
    let teamId = teamHint;
    if (teamId === undefined) {
      const teamAnswer = await io.select({
        message: "Team",
        options: await teamChoices(ctx),
      });
      if (io.isCancel(teamAnswer)) {
        throw new InteractiveCancelledError();
      }
      teamId = teamAnswer as string;
    } else {
      teamId = await resolveTeamId(ctx.gql, teamId);
    }

    const options = await allCycleChoices(ctx, { team: teamId });
    const answer = await io.select({ message: "Cycle", options });
    if (io.isCancel(answer)) {
      throw new InteractiveCancelledError();
    }
    return answer as string;
  };
}

export const CYCLES_META: DomainMeta = {
  name: "cycles",
  summary: "time-boxed iterations (sprints) per team",
  context: [
    "a cycle is a sprint belonging to one team. each team can have one",
    "active cycle at a time. cycles contain issues and have start/end dates.",
  ].join("\n"),
  arguments: {
    cycle: "cycle identifier (UUID or name)",
  },
  seeAlso: ["issues create --cycle", "issues update --cycle"],
};

export function setupCyclesCommands(program: Command): void {
  const cycles = program.command("cycles").description("Cycle operations");

  cycles.action(() => cycles.help());

  cycles
    .command("list")
    .description("list cycles")
    .option("--team <team>", "filter by team (key, name, or UUID)")
    .option("--active", "only show active cycles")
    .option("--window <n>", "active cycle +/- n neighbors (requires --team)")
    .option("-l, --limit <n>", "max results", "50")
    .option("--after <cursor>", "cursor for next page")
    .action(
      handleCommand(async (...args: unknown[]) => {
        const [options, command] = args as [CycleListOptions, Command];
        if (options.window && !options.team) {
          throw requiresParameterError("--window", "--team");
        }
        if (options.window && options.after) {
          throw invalidParameterError(
            "--after",
            "cannot be used with --window",
          );
        }

        const ctx = createContext(getRootOpts(command));

        // Offer a team select when interactive to narrow the listing. `--window`
        // already requires a team, so only prompt when it was not requested.
        const filled = options.window
          ? { options }
          : await maybeCollectInteractive<CycleListWizardOptions, never>(
              ctx,
              getRootOpts(command),
              {
                spec: cycleListSpec,
                options: { ...options } as CycleListWizardOptions,
                missingRequired: false,
              },
            );
        const listOptions = filled.options as CycleListOptions;

        // Resolve team filter if provided
        const teamId = listOptions.team
          ? await resolveTeamId(ctx.gql, listOptions.team)
          : undefined;

        // Fetch cycles
        const result = await listCycles(
          ctx.gql,
          teamId,
          options.active || false,
          buildPaginationOptions(parseLimit(options.limit), options.after),
        );

        if (options.window) {
          const n = parseInt(options.window, 10);
          if (Number.isNaN(n) || n < 0) {
            throw invalidParameterError(
              "--window",
              "requires a non-negative integer",
            );
          }

          const activeCycle = result.nodes.find((c: Cycle) => c.isActive);
          if (!activeCycle) {
            throw notFoundError("Active cycle", options.team ?? "", "for team");
          }

          const activeNumber = activeCycle.number;
          const min = activeNumber - n;
          const max = activeNumber + n;

          const filteredNodes = result.nodes
            .filter((c: Cycle) => c.number >= min && c.number <= max)
            .sort((a: Cycle, b: Cycle) => a.number - b.number);

          outputSuccess({
            nodes: filteredNodes,
            pageInfo: { hasNextPage: false, endCursor: null },
          });
          return;
        }

        outputSuccess(result);
      }),
    );

  cycles
    .command("read [cycle]")
    .description("get cycle details including issues")
    .option("--team <team>", "scope name lookup to team")
    .option("--limit <n>", "max issues to fetch", "50")
    .action(
      handleCommand(async (...args: unknown[]) => {
        const [cycleArg, options, command] = args as [
          string | undefined,
          CycleReadOptions,
          Command,
        ];
        const ctx = createContext(getRootOpts(command));

        const filled = await maybeCollectInteractive<
          Record<string, never>,
          string
        >(ctx, getRootOpts(command), {
          spec: { fields: [] },
          options: {},
          missingRequired: cycleArg === undefined,
          positional: {
            name: "cycle",
            value: cycleArg,
            picker: makeCyclePicker(options.team),
          },
        });
        if (filled.positional === undefined) {
          throw invalidParameterError("cycle", "is required");
        }
        const cycle = filled.positional;

        const cycleId = await resolveCycleId(ctx.gql, cycle, options.team);

        const cycleResult = await getCycle(
          ctx.gql,
          cycleId,
          parseLimit(options.limit || "50"),
        );

        outputSuccess(cycleResult);
      }),
    );

  cycles
    .command("usage")
    .description("show detailed usage for cycles")
    .action(() => {
      console.log(formatDomainUsage(cycles, CYCLES_META));
    });
}
