import { chmodSync, existsSync } from "fs";
import { join } from "path";

const entrypoint = join(process.cwd(), "dist", "main.js");

if (existsSync(entrypoint)) {
  chmodSync(entrypoint, 0o755);
}
