# Deployment

Linearis is a CLI tool for Linear.app that compiles from TypeScript to JavaScript during installation. It runs on Node.js 22+ and outputs JSON for all commands.

## Installation

### From Git

Clone and install:

```bash
git clone https://github.com/czottmann/linearis.git
cd linearis
npm install
```

`npm install` handles the full setup automatically:

- `postinstall` runs `npm run generate` (GraphQL codegen)
- `prepare` is not used; build manually with `npm run build`

After building, link the CLI globally:

```bash
npm run build
npm link
```

This creates the `linearis` command, pointing to `dist/main.js`.

### Direct Git Install

```bash
npm install git+https://github.com/czottmann/linearis.git
```

This runs `postinstall` to generate GraphQL types. You still need to run `npm run build` separately to compile TypeScript.

## Build Scripts

| Command            | Description                                |
| ------------------ | ------------------------------------------ |
| `npm run generate` | Generate GraphQL types from schema         |
| `npm run build`    | Compile TypeScript and make entry executable |
| `npm run clean`    | Remove `dist/` directory (`rm -rf dist/`)  |
| `npm run start`    | Run in development mode via tsx             |
| `npm test`         | Run test suite                             |

The build script runs `tsc && chmod +x dist/main.js`. The clean script uses `rm -rf dist/`.

## Authentication

For interactive use (humans), run `linearis auth login` — it opens Linear in the browser and stores the token encrypted in `~/.linearis/token`.

Linearis checks for an API token in this order:

1. `--api-token` flag on the command line
2. `LINEAR_API_TOKEN` environment variable
3. `~/.linearis/token` (encrypted, set up via `linearis auth login`)
4. `~/.linear_api_token` (deprecated)

For automated environments (CI, containers), set the environment variable.

Authentication is handled in `src/common/auth.ts` and `src/common/token-storage.ts`.

## Platform Requirements

- Node.js >= 22.0.0
- ES modules support (package uses `"type": "module"`)
- Works on Linux, macOS, and Windows
- The token file path resolves via `os.homedir()`, so it works across platforms (`$HOME` on Unix, `%USERPROFILE%` on Windows)

## Container Deployment

Example Dockerfile:

```dockerfile
FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json tsconfig.json codegen.config.ts ./
COPY src/ ./src/
COPY graphql/ ./graphql/
RUN npm install
ENTRYPOINT ["node", "dist/main.js"]
```

`npm install` triggers `postinstall` (which runs `npm run generate`). The `graphql/` directory is required because codegen reads the query and mutation definitions from it. Run `npm run build` separately to compile TypeScript.

Pass the API token as an environment variable:

```bash
docker build -t linearis .
docker run -e LINEAR_API_TOKEN=lin_api_... linearis issue list
```

## Troubleshooting

**Missing `dist/` directory** -- Run `npm run build` to compile TypeScript.

**GraphQL type errors after schema changes** -- Run `npm run generate` to regenerate types.

**Node.js version mismatch** -- Verify you have Node.js 22.0.0 or later with `node --version`.

**Command not found after `npm link`** -- Make sure `npm run build` completed successfully and `dist/main.js` exists.

**Authentication failures** -- Confirm your Linear API token is valid and provided through one of the three supported methods.

## Version

Current version: 2025.12.3 (defined in `package.json`).
