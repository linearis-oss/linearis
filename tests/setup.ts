import { afterEach } from "vitest";

// Error output sets process.exitCode instead of calling process.exit().
// Reset it so one test's failure code does not leak into the next test or
// become the exit status of the Vitest worker.
afterEach(() => {
  process.exitCode = undefined;
});
