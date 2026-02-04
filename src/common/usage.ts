import { Command } from "commander";

/**
 * Generate usage information for all individual subcommands
 * 
 * This utility traverses the entire command tree and outputs formatted help
 * for each leaf command. It collects commands recursively, sorts them
 * alphabetically, and outputs their help blocks separated by dividers.
 * 
 * @param program - Commander.js program instance with registered commands
 * @returns void (outputs help text to console)
 * 
 * @example
 * ```typescript
 * // In main.ts usage command setup
 * program
 *   .command("usage")
 *   .description("show usage info for all tools")
 *   .action(() => outputUsageInfo(program));
 * ```
 */
export function outputUsageInfo(program: Command) {
  const subcommands: { name: string; command: Command }[] = [];

  /**
   * Recursively collect all leaf subcommands (not parent commands)
   * 
   * @param cmd - Current command to process
   * @param prefix - Accumulated command name prefix
   */
  function collectSubcommands(cmd: Command, prefix: string = "") {
    const currentName = prefix ? `${prefix} ${cmd.name()}` : cmd.name();

    // Get all subcommands
    const commands = cmd.commands;

    if (commands.length === 0) {
      // This is a leaf command (actual subcommand)
      if (prefix) { // Only include commands with a prefix (exclude root)
        subcommands.push({ name: currentName, command: cmd });
      }
    } else {
      // This is a parent command, recurse into its subcommands
      commands.forEach((subcmd) => collectSubcommands(subcmd, currentName));
    }
  }

  // Start collection from root program
  collectSubcommands(program);

  // Sort subcommands alphabetically by full name
  subcommands.sort((a, b) => a.name.localeCompare(b.name));

  // Output full (incl. `.addHelpText()` blocks) help text for each subcommand
  subcommands.forEach(({ command }) => {
    command.outputHelp();
    console.log("\n---\n")
  });
}
