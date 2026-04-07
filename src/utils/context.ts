import type { Command } from "commander";
import type { CommandOptions } from "./auth.js";

/**
 * Walk up the Commander tree and return the root command options.
 */
export function getRootOpts(command: Command): CommandOptions {
  let current: Command = command;

  while (current.parent) {
    current = current.parent;
  }

  return current.opts<CommandOptions>();
}
