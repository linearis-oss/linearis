#!/usr/bin/env node
//
// anonymize-demo-cast.mjs — scrub PII from a recorded demo cast.
//
// The interactive wizard demo (rec-demo-interactive-cast.mjs) is a real pty
// recording, so its Team and Assignee pickers capture real workspace member
// names, the company email domain, and internal team names. This filter rewrites
// those to stable pseudonyms so no personal data lands in the committed SVG.
//
// It contains NO real names itself: it fetches the current workspace users and
// teams from the live API (`linearis users/teams list`) at run time, builds a
// deterministic real→pseudonym map, and applies it to every output chunk of the
// cast. One identity is preserved so the demo still shows a real assignee — by
// default "Fabian Jocks" (override with DEMO_KEEP_NAME), whose company email
// domain is still scrubbed. One team name is preserved as the demo subject — by
// default "data" (override with DEMO_KEEP_TEAM).
//
// Integration/bot members (Codex, Cursor, GitHub Copilot, Linear) are product
// names, not PII, and are left as-is.
//
// USAGE (needs Linear credentials, same as recording):
//   node scripts/rec-demo-interactive-cast.mjs \
//     | node scripts/anonymize-demo-cast.mjs > docs/assets/issue-create-interactive.cast
//   # or filter an existing cast in place:
//   node scripts/anonymize-demo-cast.mjs < raw.cast > clean.cast

import { execFileSync } from "node:child_process";

const KEEP_NAME = process.env.DEMO_KEEP_NAME ?? "Fabian Jocks";
const KEEP_TEAM = process.env.DEMO_KEEP_TEAM ?? "data";

// Deterministic pseudonym pools (gender-neutral names; generic team names).
const FAKE_NAMES = [
  "Alex Carter",
  "Jordan Lee",
  "Sam Rivera",
  "Morgan Reed",
  "Riley Quinn",
  "Casey Brooks",
  "Taylor Fox",
  "Jamie Cole",
  "Drew Ellis",
  "Robin Shaw",
  "Avery Hart",
  "Quinn Diaz",
  "Reese Park",
  "Skyler Nash",
  "Emerson Wells",
  "Harper Vance",
  "Rowan Frost",
  "Sage Bello",
  "Micah Lund",
  "Noa Behr",
];
const FAKE_TEAMS = [
  ["platform", "PLT"],
  ["growth", "GRW"],
  ["mobile", "MOB"],
  ["billing", "BIL"],
  ["insights", "INS"],
  ["support", "SUP"],
];

function fetchJson(domain) {
  const out = execFileSync("linearis", [domain, "list", "--limit", "200"], {
    encoding: "utf8",
  });
  return JSON.parse(out).nodes;
}

// A member is a real person (vs. an integration bot) when their email is not on
// a Linear integration domain.
const isBot = (email = "") =>
  /@oauthapp\.linear\.app$|@linear\.linear\.app$/i.test(email);

const users = fetchJson("users");
const teams = fetchJson("teams");

// Replacement rules, applied longest-source-first. Full strings (names, emails,
// teams) match literally; individual name tokens match on word boundaries so a
// name split across two output chunks (redraw) is still caught.
const rules = [];
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const add = (find, replace, { token = false } = {}) => {
  if (!find || replace === undefined || find === replace) return;
  const body = esc(find);
  rules.push({
    len: find.length,
    re: new RegExp(token ? `\\b${body}\\b` : body, "g"),
    to: replace,
  });
};
// Replace each whitespace-separated token of a full name with the matching
// token of its pseudonym (catches chunk-split renders of the name).
const addTokens = (realName, fakeName) => {
  const rp = realName.split(/\s+/);
  const fp = fakeName.split(/\s+/);
  rp.forEach((tok, i) => {
    if (tok.length >= 3) add(tok, fp[i] ?? fp[fp.length - 1], { token: true });
  });
};

// Company email domains (from real members) → example.com, and the domain's
// bare label (e.g. "viadukt") → "acme" to catch bot usernames / stragglers.
const domains = new Set();
for (const u of users) {
  if (u.email && !isBot(u.email)) domains.add(u.email.split("@")[1]);
}
for (const d of domains) {
  add(d, "example.com");
  const label = d.split(".")[0];
  if (label.length > 3) add(label, "acme");
}

// Humans → pseudonyms (stable: sorted by name), keeping KEEP_NAME.
const humans = users
  .filter((u) => !isBot(u.email) && u.name !== KEEP_NAME)
  .sort((a, b) => a.name.localeCompare(b.name));
humans.forEach((u, i) => {
  const fake = FAKE_NAMES[i % FAKE_NAMES.length];
  add(u.email, `${fake.split(" ")[1].toLowerCase()}@example.com`);
  add(u.name, fake);
  addTokens(u.name, fake);
});
// Preserve KEEP_NAME but still scrub its email.
const me = users.find((u) => u.name === KEEP_NAME);
if (me?.email)
  add(me.email, `${KEEP_NAME.split(" ")[1].toLowerCase()}@example.com`);

// Teams → generic names + keys (in the "name (KEY)" form), keeping KEEP_TEAM.
teams
  .filter((t) => t.name !== KEEP_TEAM)
  .sort((a, b) => a.name.localeCompare(b.name))
  .forEach((t, i) => {
    const [name, key] = FAKE_TEAMS[i % FAKE_TEAMS.length];
    add(`(${t.key})`, `(${key})`);
    add(t.name, name);
  });

rules.sort((a, b) => b.len - a.len);

function scrub(text) {
  let out = text;
  for (const { re, to } of rules) out = out.replace(re, to);
  return out;
}

// Stream the cast. The pty delivers a single screen redraw as several chunks
// microseconds apart, which can split a name across events and defeat scrubbing.
// So first coalesce consecutive "o" events that arrive within one frame
// (GAP seconds) into a single event — this reunites split names while leaving
// the deliberate typing/pauses (tens to hundreds of ms) untouched — then scrub.
const GAP = 0.04;
const input = await readStdin();
const raw = [];
for (const line of input.split("\n")) {
  if (!line) continue;
  try {
    raw.push(JSON.parse(line));
  } catch {
    process.stdout.write(`${line}\n`); // header (object, not array)
  }
}

let pending = null; // { t, data } accumulator for a coalesced frame
const flush = () => {
  if (!pending) return;
  process.stdout.write(
    `${JSON.stringify([pending.t, "o", scrub(pending.data)])}\n`,
  );
  pending = null;
};
for (const ev of raw) {
  if (ev[1] === "o" && pending && ev[0] - pending.last <= GAP) {
    pending.data += ev[2];
    pending.last = ev[0];
  } else if (ev[1] === "o") {
    flush();
    pending = { t: ev[0], last: ev[0], data: ev[2] };
  } else {
    flush();
    process.stdout.write(`${JSON.stringify(ev)}\n`);
  }
}
flush();

function readStdin() {
  return new Promise((resolve) => {
    let d = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (c) => (d += c));
    process.stdin.on("end", () => resolve(d));
  });
}
