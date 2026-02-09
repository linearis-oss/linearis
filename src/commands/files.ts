import type { Command } from "commander";
import { type CommandOptions, getApiToken } from "../common/auth.js";
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

  files.action(() => files.help());

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
        const apiToken = getApiToken(command.parent!.parent!.opts());
        const fileService = new FileService(apiToken);
        const result = await fileService.downloadFile(url, {
          output: options.output,
          overwrite: options.overwrite,
        });

        if (result.success) {
          outputSuccess({
            success: true,
            filePath: result.filePath,
            message: `File downloaded successfully to ${result.filePath}`,
          });
        } else {
          outputSuccess({
            success: false,
            error: result.error || "Download failed",
            statusCode: result.statusCode,
          });
        }
      }),
    );

  files
    .command("upload <file>")
    .description("upload a file to Linear storage")
    .action(
      handleCommand(async (...args: unknown[]) => {
        const [filePath, , command] = args as [string, CommandOptions, Command];
        const apiToken = getApiToken(command.parent!.parent!.opts());
        const fileService = new FileService(apiToken);
        const result = await fileService.uploadFile(filePath);

        if (result.success) {
          outputSuccess({
            success: true,
            assetUrl: result.assetUrl,
            filename: result.filename,
            message: `File uploaded successfully: ${result.assetUrl}`,
          });
        } else {
          outputSuccess({
            success: false,
            error: result.error || "Upload failed",
            statusCode: result.statusCode,
          });
        }
      }),
    );

  files
    .command("usage")
    .description("show detailed usage for files")
    .action(() => {
      console.log(formatDomainUsage(files, FILES_META));
    });
}
