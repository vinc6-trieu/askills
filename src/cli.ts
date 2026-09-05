#!/usr/bin/env node

import { Command } from "commander";
import pc from "picocolors";

import {
  resolveCommand
} from "./commands/resolve.js";

import {
  initCommand
} from "./commands/init.js";

import {
  bootstrapCommand
} from "./commands/bootstrap.js";

import {
  setupCommand
} from "./commands/setup.js";

import {
  syncCommand
} from "./commands/sync.js";

import {
  codexCommand
} from "./commands/codex.js";

const program = new Command();

program
  .name("askills")
  .description(
    "Portable coding-agent skill manager"
  )
  .version("0.3.0");

program
  .command("setup")
  .description(
    "Install the central skill registry"
  )
  .requiredOption(
    "--registry <url>",
    "Git repository containing agent skills"
  )
  .action(async options => {
    await setupCommand(options);
  });

program
  .command("sync")
  .description(
    "Update the installed skill registry"
  )
  .action(async () => {
    await syncCommand();
  });

program
  .command("init")
  .description(
    "Initialize askills for the current repository"
  )
  .option(
    "--auto",
    "Automatically detect the best profile"
  )
  .option(
    "--profile <profile>",
    "Use a specific profile"
  )
  .option(
    "--force",
    "Overwrite existing configuration"
  )
  .action(async options => {
    await initCommand(options);
  });

program
  .command("bootstrap")
  .description(
    "Prepare the project skill pool"
  )
  .action(async () => {
    await bootstrapCommand();
  });

program
  .command("resolve")
  .description(
    "Resolve relevant skills for a coding task"
  )
  .argument(
    "<task>",
    "Coding task description"
  )
  .option(
    "--profile <profile>",
    "Skill profile"
  )
  .action(
    async (
      task: string,
      options: { profile?: string }
    ) => {
      await resolveCommand(
        task,
        options
      );
    }
  );

program
  .command("codex")
  .description(
    "Resolve skills and launch Codex"
  )
  .argument(
    "<task>",
    "Coding task"
  )
  .option(
    "--exec",
    "Run Codex non-interactively"
  )
  .option(
    "--dry-run",
    "Resolve and prepare skills without launching Codex"
  )
  .action(
    async (
      task: string,
      options: {
        exec?: boolean;
        dryRun?: boolean;
      }
    ) => {
      await codexCommand(
        task,
        options
      );
    }
  );

program
  .parseAsync(process.argv)
  .catch(error => {
    console.error(
      pc.red(
        error instanceof Error
          ? error.message
          : String(error)
      )
    );

    process.exit(1);
  });
