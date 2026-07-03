import type { Command } from "commander";
import { type CommandOptions, getApiToken } from "../common/auth.js";
import {
  type CommandContext,
  createContext,
  getRootOpts,
} from "../common/context.js";
import {
  InteractiveCancelledError,
  invalidParameterError,
} from "../common/errors.js";
import { maybeCollectInteractive } from "../common/interactive/engine.js";
import type { PromptIO, PromptSpec } from "../common/interactive/types.js";
import { omitUndefined } from "../common/object.js";
import { handleCommand, outputSuccess } from "../common/output.js";
import { type DomainMeta, formatDomainUsage } from "../common/usage.js";
import { FileService } from "../services/file-service.js";

const EMPTY_SPEC: PromptSpec<Record<string, never>> = { fields: [] };

/**
 * A text picker for a free-form positional (local file path or storage URL).
 * There is no entity list to enumerate, so — unlike the entity pickers in other
 * domains — this simply prompts for the value with a `text` field when gating
 * passes, preserving the old missing-argument error otherwise.
 */
function makeTextPicker(
  message: string,
): (ctx: CommandContext, io: PromptIO) => Promise<string> {
  return async (_ctx, io) => {
    const answer = await io.text({ message });
    if (io.isCancel(answer)) {
      throw new InteractiveCancelledError();
    }
    return answer as string;
  };
}

/**
 * Fill an absent free-form positional via a text prompt when gating allows,
 * else preserve the old missing-argument error.
 */
async function resolveTextPositional(
  command: Command,
  name: string,
  value: string | undefined,
  message: string,
): Promise<string> {
  const ctx = createContext(getRootOpts(command));
  const filled = await maybeCollectInteractive<Record<string, never>, string>(
    ctx,
    getRootOpts(command),
    {
      spec: EMPTY_SPEC,
      options: {},
      missingRequired: value === undefined,
      positional: { name, value, picker: makeTextPicker(message) },
    },
  );
  if (filled.positional === undefined) {
    throw invalidParameterError(name, "is required");
  }
  return filled.positional;
}

export const FILES_META: DomainMeta = {
  name: "files",
  summary: "upload/download file attachments",
  context: [
    "files are binary attachments stored in Linear's storage. upload returns",
    "a URL that can be referenced in issue descriptions or comments.",
  ].join("\n"),
  arguments: {
    url: "Linear storage URL",
    file: "local file path",
  },
  seeAlso: [],
};

export function setupFilesCommands(program: Command): void {
  const files = program
    .command("files")
    .description("Upload and download files from Linear storage.");

  files.action(() => files.help());

  files
    .command("download [url]")
    .description("download a file from Linear storage")
    .option("--output <path>", "output file path")
    .option("--overwrite", "overwrite existing file", false)
    .action(
      handleCommand(async (...args: unknown[]) => {
        const [urlArg, options, command] = args as [
          string | undefined,
          CommandOptions & { output?: string; overwrite?: boolean },
          Command,
        ];
        const url = await resolveTextPositional(
          command,
          "url",
          urlArg,
          "Linear storage URL",
        );
        const apiToken = getApiToken(getRootOpts(command));
        const fileService = new FileService(apiToken);
        const result = await fileService.downloadFile(
          url,
          omitUndefined({
            output: options.output,
            overwrite: options.overwrite,
          }),
        );

        if (!result.success) {
          throw new Error(result.error || "Download failed");
        }

        outputSuccess({
          filePath: result.filePath,
          message: `File downloaded successfully to ${result.filePath}`,
        });
      }),
    );

  files
    .command("upload [file]")
    .description("upload a file to Linear storage")
    .action(
      handleCommand(async (...args: unknown[]) => {
        const [fileArg, , command] = args as [
          string | undefined,
          CommandOptions,
          Command,
        ];
        const filePath = await resolveTextPositional(
          command,
          "file",
          fileArg,
          "Local file path",
        );
        const apiToken = getApiToken(getRootOpts(command));
        const fileService = new FileService(apiToken);
        const result = await fileService.uploadFile(filePath);

        if (!result.success) {
          throw new Error(result.error || "Upload failed");
        }

        outputSuccess({
          assetUrl: result.assetUrl,
          filename: result.filename,
          message: `File uploaded successfully: ${result.assetUrl}`,
        });
      }),
    );

  files
    .command("usage")
    .description("show detailed usage for files")
    .action(() => {
      console.log(formatDomainUsage(files, FILES_META));
    });
}
