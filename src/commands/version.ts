import type { Command } from "commander";
import pkg from "../../package.json" with { type: "json" };
import { handleCommand, outputSuccess } from "../common/output.js";
import {
  channelFor,
  fetchLatestVersion,
  isNewer,
  writeCache,
} from "../common/update-notifier.js";
import { type DomainMeta, formatDomainUsage } from "../common/usage.js";

export const VERSION_META: DomainMeta = {
  name: "version",
  summary: "show the installed version and check for updates",
  context: [
    "reports the installed linearis version and its release channel (latest or",
    "next). `version check` queries the npm registry for the newest version on",
    "that channel and reports whether an update is available. interactive runs",
    "also print a one-line hint to stderr; set NO_UPDATE_NOTIFIER=1 to silence.",
  ].join("\n"),
  arguments: {},
  seeAlso: [],
};

export function setupVersionCommands(program: Command): void {
  const version = program
    .command("version")
    .description("show the installed version");

  version.action(
    handleCommand(async () => {
      outputSuccess({
        version: pkg.version,
        channel: channelFor(pkg.version),
      });
    }),
  );

  version
    .command("check")
    .description("check the npm registry for a newer version")
    .action(
      handleCommand(async () => {
        const channel = channelFor(pkg.version);
        const latest = await fetchLatestVersion(channel);
        const updateAvailable = latest ? isNewer(latest, pkg.version) : false;
        if (latest) {
          writeCache({ channel, latest, checkedAt: Date.now() });
        }
        outputSuccess({
          current: pkg.version,
          latest,
          channel,
          updateAvailable,
        });
      }),
    );

  version
    .command("usage")
    .description("show detailed usage for version")
    .action(() => {
      console.log(formatDomainUsage(version, VERSION_META));
    });
}
