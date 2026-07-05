#!/usr/bin/env node
//
// gen-demo-agent-cast.mjs — build the "agent" README demo.
//
// Renders a faithful Claude Code transcript into an asciinema v2 cast: an AI
// agent invoking the `linearis` skill and running discover-then-act to create
// an issue. It is the counterpart to the "human" wizard demo produced by
// rec-demo-interactive-cast.mjs; both appear at the top of README.md.
//
// WHY A RENDERER (not a raw recording): Claude Code's TUI redraws heavily and
// its output is non-deterministic, which records poorly. Instead we captured a
// real headless session and re-render its content in the recognisable Claude
// Code style (⏺ bullets, ⎿ result boxes). Every command, output snippet and the
// closing line in `steps` below is VERBATIM from that run — see PROVENANCE.
// The transcript is lightly trimmed for length (a `teams usage` probe and a
// `--fields` retry are omitted). This script is deterministic: no TTY, no
// network, no credentials.
//
// PROVENANCE — the source session was captured (from a neutral directory, with
// the `linearis` skill installed and Linear credentials available) via:
//
//   claude -p 'Using linearis, create a Linear issue in the data team titled \
//     "Backfill fct_orders after Airflow DAG failure (2026-07-04)", priority \
//     high, with label technical-debt. Report the created issue identifier.' \
//     --output-format stream-json --verbose --dangerously-skip-permissions \
//     > docs/assets/issue-create-agent.jsonl
//
//   The `.jsonl` capture is git-ignored (a raw artifact); re-run the command
//   above to refresh it, delete the demo issue it creates, then update `steps`.
//
// USAGE — regenerate the committed SVG (run from the repo root):
//
//   node scripts/gen-demo-agent-cast.mjs > docs/assets/issue-create-agent.cast
//   npx svg-term-cli --in docs/assets/issue-create-agent.cast \
//     --out docs/assets/issue-create-agent.svg --window --width 92 --height 33 --padding 14
//
//   The `.cast` is git-ignored (regenerable); only the `.svg` is committed.

const WIDTH = 92; // terminal columns (must match the svg-term --width above)
const HEIGHT = 33; // terminal rows (must match --height; tall enough to show it all)

// ANSI palette chosen to echo Claude Code's own colours.
const DIM = "\x1b[38;5;245m"; // muted gray — command output / hints
const R = "\x1b[0m"; // reset
const DOT = "\x1b[38;5;114m⏺\x1b[0m"; // green bullet that prefixes each agent step
const CORNER = `${DIM}⎿${R}`; // result connector under a tool call
const BOLD = "\x1b[1m";
const USER = "\x1b[38;5;110m"; // soft blue — the user's prompt marker

const CREATE_CMD =
  'linearis issues create "Backfill fct_orders after Airflow DAG failure\r\n         (2026-07-04)" --team DAT --priority 2 --labels technical-debt';

// [dot line, [result lines...]] — result lines are dimmed and indented under ⎿.
const steps = [
  [
    `${DOT} ${BOLD}linearis${R} ${DIM}(Skill)${R}`,
    [`${DIM}Launching skill: linearis${R}`],
  ],
  [`${DOT} I'll discover the command surface, then create the issue.`, []],
  [
    `${DOT} ${BOLD}Bash${R}(linearis usage)`,
    [
      `${DIM}linearis v2026.4.8 — CLI for Linear.app (JSON output)${R}`,
      `${DIM}domains: auth  issues  projects  cycles  teams  …          (+14 lines)${R}`,
    ],
  ],
  [
    `${DOT} ${BOLD}Bash${R}(linearis issues usage)`,
    [
      `${DIM}linearis issues — work items with status, priority, labels${R}`,
      `${DIM}create <title> --team <team> [--priority 1-4] [--labels …]   (+20 lines)${R}`,
    ],
  ],
  [
    `${DOT} ${BOLD}Bash${R}(linearis teams list)`,
    [
      `${DIM}{ "nodes": [ { "key": "DAT", "name": "data" },${R}`,
      `${DIM}             { "key": "ENE", "name": "energy" }, … ] }${R}`,
    ],
  ],
  [
    `${DOT} ${BOLD}Bash${R}(${CREATE_CMD})`,
    [
      `${DIM}{${R}`,
      `${DIM}  "identifier": "DAT-1219", "priority": 2, "state": { "name": "Triage" },${R}`,
      `${DIM}  "team": { "key": "DAT", "name": "data" },${R}`,
      `${DIM}  "labels": { "nodes": [ { "name": "technical-debt" } ] }${R}`,
      `${DIM}}${R}`,
    ],
  ],
  [
    `${DOT} Created ${BOLD}DAT-1219${R} — "Backfill fct_orders after Airflow DAG failure\r\n  (2026-07-04)" in the data team, priority High, labeled technical-debt.`,
    [],
  ],
];

const events = [];
let t = 0;
const push = (dt, data) => {
  t += dt;
  events.push([Number(t.toFixed(3)), "o", data]);
};

// The user's prompt, shown the way Claude Code echoes it.
const promptLines = [
  `${USER}>${R} Using linearis, create a Linear issue in the data team titled`,
  `  "Backfill fct_orders after Airflow DAG failure (2026-07-04)", priority`,
  `  high, with label technical-debt. Report the created issue identifier.`,
];
push(0.4, `${promptLines.join("\r\n")}\r\n`);

for (const [line, results] of steps) {
  push(0.9, `\r\n${line}\r\n`);
  for (let i = 0; i < results.length; i++) {
    const prefix = i === 0 ? `  ${CORNER}  ` : "     ";
    push(0.28, `${prefix}${results[i]}\r\n`);
  }
}
push(2.6, ""); // hold on the final frame

const header = {
  version: 2,
  width: WIDTH,
  height: HEIGHT,
  timestamp: 0,
  env: { SHELL: "/bin/zsh", TERM: "xterm-256color" },
};
process.stdout.write(`${JSON.stringify(header)}\n`);
for (const e of events) process.stdout.write(`${JSON.stringify(e)}\n`);
