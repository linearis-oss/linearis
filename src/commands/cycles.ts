import { Command } from "commander";
import { createContext, type CommandOptions } from "../common/context.js";
import { handleCommand, outputSuccess } from "../common/output.js";
import {
  invalidParameterError,
  notFoundError,
  requiresParameterError,
} from "../common/errors.js";
import { resolveTeamId } from "../resolvers/team-resolver.js";
import { resolveCycleId } from "../resolvers/cycle-resolver.js";
import { listCycles, getCycle, type Cycle } from "../services/cycle-service.js";
import { formatDomainUsage, type DomainMeta } from "../common/usage.js";

interface CycleListOptions extends CommandOptions {
  team?: string;
  active?: boolean;
  window?: string;
}

interface CycleReadOptions extends CommandOptions {
  team?: string;
  limit?: string;
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

  cycles.command("list")
    .description("list cycles")
    .option("--team <team>", "filter by team (key, name, or UUID)")
    .option("--active", "only show active cycles")
    .option(
      "--window <n>",
      "active cycle +/- n neighbors (requires --team)",
    )
    .action(
      handleCommand(
        async (...args: unknown[]) => {
          const [options, command] = args as [CycleListOptions, Command];
          if (options.window && !options.team) {
            throw requiresParameterError("--window", "--team");
          }

          const ctx = createContext(command.parent!.parent!.opts());

          // Resolve team filter if provided
          const teamId = options.team
            ? await resolveTeamId(ctx.sdk, options.team)
            : undefined;

          // Fetch cycles
          const allCycles = await listCycles(
            ctx.gql,
            teamId,
            options.active || false,
          );

          if (options.window) {
            const n = parseInt(options.window);
            if (isNaN(n) || n < 0) {
              throw invalidParameterError(
                "--window",
                "requires a non-negative integer",
              );
            }

            const activeCycle = allCycles.find((c: Cycle) => c.isActive);
            if (!activeCycle) {
              throw notFoundError("Active cycle", options.team!, "for team");
            }

            const activeNumber = activeCycle.number;
            const min = activeNumber - n;
            const max = activeNumber + n;

            const filtered = allCycles
              .filter((c: Cycle) => c.number >= min && c.number <= max)
              .sort((a: Cycle, b: Cycle) => a.number - b.number);

            outputSuccess(filtered);
            return;
          }

          outputSuccess(allCycles);
        },
      ),
    );

  cycles.command("read <cycle>")
    .description("get cycle details including issues")
    .option("--team <team>", "scope name lookup to team")
    .option("--limit <n>", "max issues to fetch", "50")
    .action(
      handleCommand(
        async (...args: unknown[]) => {
          const [cycle, options, command] = args as [string, CycleReadOptions, Command];
          const ctx = createContext(command.parent!.parent!.opts());

          const cycleId = await resolveCycleId(
            ctx.sdk,
            cycle,
            options.team,
          );

          const cycleResult = await getCycle(
            ctx.gql,
            cycleId,
            parseInt(options.limit || "50"),
          );

          outputSuccess(cycleResult);
        },
      ),
    );

  cycles
    .command("usage")
    .description("show detailed usage for cycles")
    .action(() => {
      console.log(formatDomainUsage(cycles, CYCLES_META));
    });
}
