import type { Command } from "commander";
import { type CommandOptions, getApiToken } from "../common/auth.js";
import { getRootOpts } from "../common/context.js";
import { omitUndefined } from "../common/object.js";
import { handleCommand, outputSuccess } from "../common/output.js";
import { type DomainMeta, formatDomainUsage } from "../common/usage.js";
import { FileService } from "../services/file-service.js";

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

  files
    .command("download <url>")
    .description("download a file from Linear storage")
    .option("--output <path>", "output file path")
    .option("--overwrite", "overwrite existing file", false)
    .action(
      handleCommand(async (...args: unknown[]) => {
        const [url, options, command] = args as [
          string,
          CommandOptions & { output?: string; overwrite?: boolean },
          Command,
        ];
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
    .command("upload <file>")
    .description("upload a file to Linear storage")
    .action(
      handleCommand(async (...args: unknown[]) => {
        const [filePath, , command] = args as [string, CommandOptions, Command];
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
