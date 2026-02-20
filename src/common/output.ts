import {
  AUTH_ERROR_CODE,
  AuthenticationError,
  invalidParameterError,
} from "./errors.js";

export function outputSuccess(data: unknown): void {
  console.log(JSON.stringify(data, null, 2));
}

export function outputError(error: Error): void {
  console.error(JSON.stringify({ error: error.message }, null, 2));
  process.exit(1);
}

export function outputAuthError(error: AuthenticationError): void {
  console.error(
    JSON.stringify(
      {
        error: "AUTHENTICATION_REQUIRED",
        message: error.message,
        details: error.details,
        action: "USER_ACTION_REQUIRED",
        instruction:
          "Run 'linearis auth' to set up or refresh your authentication token.",
        exit_code: AUTH_ERROR_CODE,
      },
      null,
      2,
    ),
  );
  process.exit(AUTH_ERROR_CODE);
}

export function parseLimit(value: string): number {
  const limit = parseInt(value, 10);
  if (Number.isNaN(limit) || limit < 1) {
    throw invalidParameterError("--limit", "must be a positive integer");
  }
  return limit;
}

export function handleCommand(
  asyncFn: (...args: unknown[]) => Promise<void>,
): (...args: unknown[]) => Promise<void> {
  return async (...args: unknown[]) => {
    try {
      await asyncFn(...args);
    } catch (error) {
      if (error instanceof AuthenticationError) {
        outputAuthError(error);
        return;
      }
      outputError(error instanceof Error ? error : new Error(String(error)));
    }
  };
}
