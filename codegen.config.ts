import type { CodegenConfig } from "@graphql-codegen/cli";

const config: CodegenConfig = {
  schema: "https://api.linear.app/graphql", // or download schema locally
  documents: ["graphql/**/*.graphql"],
  generates: {
    "./src/gql/": {
      preset: "client",
      presetConfig: {
        fragmentMasking: false,
      },
      config: {
        // Any custom scalar reachable from our operations that is not mapped
        // below falls back to `unknown` (safe) instead of the codegen default
        // `any`.
        defaultScalarType: "unknown",
        scalars: {
          DateTime: { input: "string", output: "string" },
          DateTimeOrDuration: { input: "string", output: "string" },
          TimelessDate: { input: "string", output: "string" },
          TimelessDateOrDuration: { input: "string", output: "string" },
          Duration: { input: "string | number", output: "string" },
          UUID: { input: "string", output: "string" },
          JSON: { input: "unknown", output: "unknown" },
          JSONObject: {
            input: "Record<string, unknown>",
            output: "Record<string, unknown>",
          },
        },
      },
    },
  },
};

export default config;
