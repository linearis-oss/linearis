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

interface CycleListOptions extends CommandOptions {
  team?: string;
  active?: boolean;
  aroundActive?: string;
}

interface CycleReadOptions extends CommandOptions {
  team?: string;
  issuesFirst?: string;
}

export function setupCyclesCommands(program: Command): void {
  const cycles = program.command("cycles").description("Cycle operations");

  cycles.action(() => cycles.help());

  cycles.command("list")
    .description("List cycles")
    .option("--team <team>", "team key, name, or ID")
    .option("--active", "only active cycles")
    .option(
      "--around-active <n>",
      "return active +/- n cycles (requires --team)",
    )
    .action(
      handleCommand(
        async (...args: unknown[]) => {
          const [options, command] = args as [CycleListOptions, Command];
          // around-active requires a team to determine the current team's active cycle
          // Validate this before authentication to provide better error messages
          if (options.aroundActive && !options.team) {
            throw requiresParameterError("--around-active", "--team");
          }

          const ctx = await createContext(command.parent!.parent!.opts());

          // Resolve team filter if provided
          const teamId = options.team
            ? await resolveTeamId(ctx.sdk, options.team)
            : undefined;

          // Fetch cycles
          const allCycles = await listCycles(
            ctx.sdk,
            teamId,
            options.active || false,
          );

          // If around-active is requested, filter by cycle number range
          if (options.aroundActive) {
            const n = parseInt(options.aroundActive);
            if (isNaN(n) || n < 0) {
              throw invalidParameterError(
                "--around-active",
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

  cycles.command("read <cycleIdOrName>")
    .description(
      "Get cycle details including issues. Accepts UUID or cycle name (optionally scoped by --team)",
    )
    .option("--team <team>", "team key, name, or ID to scope name lookup")
    .option("--issues-first <n>", "how many issues to fetch (default 50)", "50")
    .action(
      handleCommand(
        async (...args: unknown[]) => {
          const [cycleIdOrName, options, command] = args as [string, CycleReadOptions, Command];
          const ctx = await createContext(command.parent!.parent!.opts());

          // Resolve cycle ID (handles both UUID and name-based lookup)
          const cycleId = await resolveCycleId(
            ctx.sdk,
            cycleIdOrName,
            options.team,
          );

          // Fetch cycle with issues
          const cycle = await getCycle(
            ctx.sdk,
            cycleId,
            parseInt(options.issuesFirst || "50"),
          );

          outputSuccess(cycle);
        },
      ),
    );
}
