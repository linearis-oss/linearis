#!/usr/bin/env node
//
// rec-demo-interactive-cast.mjs — build the "human" README demo.
//
// Records the real interactive `linearis issues create` wizard into an
// asciinema v2 cast. It is the counterpart to the "agent" demo produced by
// gen-demo-agent-cast.mjs; both appear at the top of README.md.
//
// HOW IT WORKS: `@clack/prompts` renders a raw-mode TUI that only runs on a real
// terminal, so we spawn the CLI inside a pseudo-terminal via node-pty and drive
// it with an event-driven keystroke script. Each turn it reads the screen,
// finds the active clack prompt by its `◆  <Label>` marker (see `activeLabel`),
// and runs that label's handler from the `handlers` map. Because it reacts to
// whichever prompt is on screen rather than following a fixed sequence, it stays
// correct when optional fields appear or are skipped depending on team config
// (project / cycle / estimate). Every keystroke and its timing are captured, so
// the resulting SVG is a genuine recording, not a re-render.
//
// REQUIREMENTS:
//   - a built CLI: `npm run build` (this drives ./dist/main.js)
//   - Linear credentials: LINEAR_API_TOKEN or ~/.linearis/token (the wizard's
//     pickers load teams/labels/users from the live API)
//   - node-pty, which is NOT a project dependency: `npm i node-pty`
//     (if it fails to spawn with "posix_spawnp failed", the prebuilt helper is
//      missing its exec bit:
//      `chmod +x node_modules/node-pty/prebuilds/darwin-*/spawn-helper`)
//   - `CI` unset (interactive prompts are hard-gated off under CI)
//
// SIDE EFFECT: a successful run creates ONE real issue in the target team.
// Delete it afterwards: `linearis issues delete <identifier>`.
//
// PII: the pickers capture real workspace names, so the raw cast is piped
// through anonymize-demo-cast.mjs (pseudonymises everyone but the assignee)
// before rendering. Never render/commit an SVG from the un-anonymised cast.
//
// USAGE — regenerate the committed SVG (run from the repo root):
//
//   node scripts/rec-demo-interactive-cast.mjs \
//     | node scripts/anonymize-demo-cast.mjs > docs/assets/issue-create-interactive.cast
//   npx svg-term-cli --in docs/assets/issue-create-interactive.cast \
//     --out docs/assets/issue-create-interactive.svg --window --width 92 --height 30 --padding 14
//   linearis issues delete <identifier>   # remove the demo issue this created
//
//   The `.cast` is git-ignored (regenerable); only the `.svg` is committed.
//
// TUNING: edit TITLE/DESC and the per-prompt `handlers` below to change what
// the demo fills in. COLS/ROWS must match the svg-term --width/--height above.
import pty from "node-pty";

const COLS = 92; // pty columns (must match svg-term --width)
const ROWS = 30; // pty rows (must match svg-term --height)
const TITLE = "Backfill fct_orders after Airflow DAG failure (2026-07-04)";
const DESC =
  "dbt_daily DAG failed 03:12 UTC; fct_orders missing 2 days. Re-run models + verify row counts.";

const env = { ...process.env, TERM: "xterm-256color" };
delete env.CI; // gating.ts refuses to prompt when CI is set
delete env.LINEARIS_NO_INTERACTIVE;

const term = pty.spawn("node", ["dist/main.js", "issues", "create"], {
  name: "xterm-256color",
  cols: COLS,
  rows: ROWS,
  cwd: process.cwd(),
  env,
});

// ---- cast recording ----
const start = Date.now();
const events = [];
let raw = "";
term.onData((d) => {
  events.push([(Date.now() - start) / 1000, "o", d]);
  raw += d;
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// biome-ignore-start lint/suspicious/noControlCharactersInRegex: stripping raw ANSI/VT escapes requires matching the ESC (\x1b) and BEL (\x07) control chars.
const strip = (s) =>
  s
    .replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "")
    .replace(/\x1b[()][AB012]/g, "")
    .replace(/\x1b[=>]/g, "")
    .replace(/\x1b\].*?\x07/g, "");
// biome-ignore-end lint/suspicious/noControlCharactersInRegex: end ANSI-strip suppression.

// Type visibly, char by char.
async function type(text) {
  for (const ch of text) {
    term.write(ch);
    await sleep(45 + Math.random() * 40);
  }
}
// Press a control key after a readable pause.
async function press(seq, pause = 320) {
  await sleep(pause);
  term.write(seq);
}
const KEY = {
  enter: "\r",
  down: "\x1b[B",
  up: "\x1b[A",
  left: "\x1b[D",
  right: "\x1b[C",
  tab: "\t",
  space: " ",
};

// Per-prompt handlers, keyed by the clack message label.
const handlers = {
  Team: async () => {
    await sleep(400);
    await type("data");
    await press(KEY.enter, 550);
  },
  Title: async () => {
    await sleep(350);
    await type(TITLE);
    await press(KEY.enter, 450);
  },
  Description: async () => {
    await sleep(350);
    await type(DESC);
    await press(KEY.enter, 450); // newline
    await press(KEY.enter, 250); // blank line submits
  },
  Assignee: async () => {
    await sleep(400);
    await type("jocks");
    await press(KEY.enter, 550);
  },
  Priority: async () => {
    await press(KEY.down, 450);
    await press(KEY.down, 300);
    await press(KEY.enter, 350);
  },
  Project: async () => {
    await press(KEY.enter, 450);
  }, // None (no project)
  Milestone: async () => {
    await press(KEY.enter, 450);
  }, // safety
  Cycle: async () => {
    await press(KEY.enter, 450);
  }, // None (no cycle)
  Status: async () => {
    await press(KEY.enter, 450);
  }, // None (team default)
  Labels: async () => {
    await sleep(400);
    await type("technical");
    await press(KEY.tab, 550);
    await press(KEY.enter, 450);
  }, // Tab toggles, Enter confirms
  Estimate: async () => {
    await press(KEY.enter, 450);
  }, // None (no estimate)
  "Set a due date?": async () => {
    await press(KEY.left, 500);
    await press(KEY.enter, 350);
  }, // Yes
  "Due date": async () => {
    await sleep(400);
    await type("07072026");
    await press(KEY.enter, 600);
  }, // mm/dd/yyyy
};

// Find the currently active prompt label (last `◆  <Label>` in the screen).
function activeLabel() {
  const lines = strip(raw).split("\n");
  let label = null;
  for (const line of lines) {
    const m = line.match(/◆\s+(.+?)\s*$/);
    if (m) label = m[1].trim();
  }
  return label;
}

let finished = false;
term.onExit(() => {
  finished = true;
});

(async () => {
  const handled = new Set();
  let last = null;
  let lastChangeAt = Date.now();
  const deadline = Date.now() + 90_000;

  while (!finished && Date.now() < deadline) {
    await sleep(200);
    // Final JSON on stdout means the wizard completed.
    if (/\{"id":"[0-9a-f-]{36}"/.test(strip(raw))) {
      await sleep(600);
      break;
    }
    const label = activeLabel();
    if (!label) continue;
    if (label !== last) {
      last = label;
      lastChangeAt = Date.now();
    }
    const h = handlers[label];
    if (h && !handled.has(label)) {
      handled.add(label);
      await h();
    } else if (handled.has(label) && Date.now() - lastChangeAt > 5000) {
      // Stuck on an already-handled prompt (e.g. multiline didn't submit):
      // escalate with Tab -> Enter (submit button) once.
      lastChangeAt = Date.now();
      await press(KEY.tab, 200);
      await press(KEY.enter, 200);
    }
  }
  await sleep(400);
  term.kill();

  // Emit the cast.
  const header = {
    version: 2,
    width: COLS,
    height: ROWS,
    timestamp: 0,
    env: { SHELL: "/bin/zsh", TERM: "xterm-256color" },
  };
  process.stdout.write(`${JSON.stringify(header)}\n`);
  for (const e of events)
    process.stdout.write(
      `${JSON.stringify([Number(e[0].toFixed(3)), e[1], e[2]])}\n`,
    );
  process.exit(0);
})();
