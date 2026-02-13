#!/usr/bin/env tsx

/**
 * Command Coverage Report
 *
 * Analyzes which CLI commands have integration test coverage.
 * This is more meaningful than code coverage for CLI tools since
 * integration tests run in separate processes.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

interface Command {
  name: string;
  subcommands: string[];
  file: string;
}

/**
 * Extract commands from source files
 */
function extractCommands(commandsDir: string): Command[] {
  const commands: Command[] = [];
  const files = readdirSync(commandsDir).filter((f) => f.endsWith(".ts"));

  for (const file of files) {
    const content = readFileSync(join(commandsDir, file), "utf-8");

    // Extract main command name
    const mainCommandMatch = content.match(/\.command\("([^"]+)"\)/);
    if (!mainCommandMatch) continue;

    const commandName = mainCommandMatch[1];
    const subcommands: string[] = [];

    // Extract subcommands
    const subcommandMatches = content.matchAll(
      /(?:command|\.command)\("([^"]+)"\)/g,
    );
    for (const match of subcommandMatches) {
      const sub = match[1];
      // Skip the main command name
      if (sub !== commandName) {
        // Extract just the command word, remove parameters like <id>
        const subName = sub.split(" ")[0];
        subcommands.push(subName);
      }
    }

    commands.push({
      name: commandName,
      subcommands: subcommands.filter((v, i, a) => a.indexOf(v) === i), // unique
      file: file,
    });
  }

  return commands;
}

/**
 * Extract tested commands from integration tests
 */
function extractTestedCommands(testsDir: string): Set<string> {
  const tested = new Set<string>();
  const files = readdirSync(testsDir).filter((f) => f.endsWith(".test.ts"));

  for (const file of files) {
    const content = readFileSync(join(testsDir, file), "utf-8");

    // Find all CLI command executions - match various formats
    // Examples:
    //   node ./dist/main.js cycles list
    //   node ${CLI_PATH} cycles list
    //   node ${CLI_PATH} cycles read ${cycleId}
    //   linearis cycles list
    const patterns = [
      /(?:node\s+(?:\$\{CLI_PATH\}|\.\/dist\/main\.js)|linearis)\s+([a-z-]+)\s+([a-z-]+)/g,
    ];

    for (const pattern of patterns) {
      const commandMatches = content.matchAll(pattern);
      for (const match of commandMatches) {
        const command = match[1];
        const subcommand = match[2];

        // Skip if it looks like a flag
        if (command?.startsWith("-")) continue;
        if (subcommand?.startsWith("-")) continue;

        if (command === "help") continue; // Skip help command itself

        if (subcommand && !subcommand.startsWith("--")) {
          tested.add(`${command} ${subcommand}`);
        } else if (command) {
          tested.add(`${command} --help`);
        }
      }
    }
  }

  return tested;
}

/**
 * Generate coverage report
 */
function generateReport() {
  const commandsDir = join(process.cwd(), "src/commands");
  const testsDir = join(process.cwd(), "tests/integration");

  const commands = extractCommands(commandsDir);
  const tested = extractTestedCommands(testsDir);

  console.log("\n📊 CLI Command Coverage Report\n");
  console.log("=".repeat(70));
  console.log();

  let totalCommands = 0;
  let testedCommands = 0;
  let totalSubcommands = 0;
  let testedSubcommands = 0;

  for (const cmd of commands.sort((a, b) => a.name.localeCompare(b.name))) {
    totalCommands++;
    const cmdTested =
      tested.has(`${cmd.name} --help`) ||
      cmd.subcommands.some((sub) => tested.has(`${cmd.name} ${sub}`));

    if (cmdTested) testedCommands++;

    const status = cmdTested ? "✅" : "❌";
    console.log(`${status} ${cmd.name.padEnd(20)} (${cmd.file})`);

    if (cmd.subcommands.length > 0) {
      for (const sub of cmd.subcommands.sort()) {
        totalSubcommands++;
        const subTested = tested.has(`${cmd.name} ${sub}`);
        if (subTested) testedSubcommands++;

        const subStatus = subTested ? "  ✅" : "  ⚠️ ";
        console.log(`${subStatus}  ├─ ${sub}`);
      }
    }
    console.log();
  }

  console.log("=".repeat(70));
  console.log("\n📈 Summary\n");

  const cmdCoverage =
    totalCommands > 0
      ? ((testedCommands / totalCommands) * 100).toFixed(1)
      : "0.0";
  const subCoverage =
    totalSubcommands > 0
      ? ((testedSubcommands / totalSubcommands) * 100).toFixed(1)
      : "0.0";
  const totalTests = testedCommands + testedSubcommands;
  const total = totalCommands + totalSubcommands;
  const overallCoverage =
    total > 0 ? ((totalTests / total) * 100).toFixed(1) : "0.0";

  console.log(
    `Commands:     ${testedCommands}/${totalCommands} tested (${cmdCoverage}%)`,
  );
  console.log(
    `Subcommands:  ${testedSubcommands}/${totalSubcommands} tested (${subCoverage}%)`,
  );
  console.log(
    `Overall:      ${totalTests}/${total} tested (${overallCoverage}%)`,
  );
  console.log();

  // Show what's not tested
  const untested: string[] = [];
  for (const cmd of commands) {
    for (const sub of cmd.subcommands) {
      if (!tested.has(`${cmd.name} ${sub}`)) {
        untested.push(`${cmd.name} ${sub}`);
      }
    }
  }

  if (untested.length > 0) {
    console.log("⚠️  Commands without integration tests:\n");
    for (const cmd of untested) {
      console.log(`   • ${cmd}`);
    }
    console.log();
  }

  // Show tested commands
  console.log("✅ Commands with integration tests:\n");
  const testedList = Array.from(tested)
    .filter((t) => !t.endsWith("--help"))
    .sort();

  for (const cmd of testedList) {
    console.log(`   • ${cmd}`);
  }
  console.log();

  console.log("=".repeat(70));
  console.log();

  // Exit with error if coverage is too low (optional)
  if (parseFloat(overallCoverage) < 50) {
    console.log("⚠️  Command coverage is below 50%");
    console.log("   Consider adding more integration tests\n");
  } else {
    console.log(`✅ Command coverage is ${overallCoverage}%\n`);
  }
}

// Run the report
generateReport();
