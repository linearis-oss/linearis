import { Command } from "commander";
import { createLinearService } from "../utils/linear-service.js";
import { handleAsyncCommand, outputSuccess } from "../utils/output.js";
import {
  invalidParameterError,
  notFoundError,
  requiresParameterError,
} from "../utils/error-messages.js";
import { Cycle } from "../gql/graphql.js";

interface CycleListOptions {
  team?: string;
  active?: boolean;
  aroundActive?: string;
}

interface CycleReadOptions {
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
      handleAsyncCommand(
        async (options: CycleListOptions, command: Command) => {
          // around-active requires a team to determine the current team's active cycle
          // Validate this before authentication to provide better error messages
          if (options.aroundActive && !options.team) {
            throw requiresParameterError("--around-active", "--team");
          }

          const linearService = await createLinearService(
            command.parent!.parent!.opts(),
          );

          // Fetch cycles with automatic pagination
          const allCycles = await linearService.getCycles(
            options.team,
            options.active ? true : undefined,
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

            const activeNumber = Number(activeCycle.number || 0);
            const min = activeNumber - n;
            const max = activeNumber + n;

            const filtered = allCycles
              .filter((c: Cycle) =>
                typeof c.number === "number" && c.number >= min &&
                c.number <= max
              )
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
      handleAsyncCommand(
        async (
          cycleIdOrName: string,
          options: CycleReadOptions,
          command: Command,
        ) => {
          const linearService = await createLinearService(
            command.parent!.parent!.opts(),
          );

          // Resolve cycle ID (handles both UUID and name-based lookup)
          const cycleId = await linearService.resolveCycleId(
            cycleIdOrName,
            options.team,
          );

          // Fetch cycle with issues
          const cycle = await linearService.getCycleById(
            cycleId,
            parseInt(options.issuesFirst || "50"),
          );

          outputSuccess(cycle);
        },
      ),
    );
}
