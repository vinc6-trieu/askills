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

import {
  claudeCommand
} from "./commands/claude.js";

import {
  runCommand
} from "./commands/run.js";

const program = new Command();

program
  .name("askills")
  .description(
    "Portable coding-agent skill manager"
  )
  .version("0.4.0");

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
  .option(
    "-v, --verbose",
    "Show every scored candidate and why it was not selected"
  )
  .action(
    async (
      task: string,
      options: {
        profile?: string;
        verbose?: boolean;
      }
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
  .command("claude")
  .description(
    "Resolve skills and launch Claude Code"
  )
  .argument(
    "<task>",
    "Coding task"
  )
  .option(
    "-p, --print",
    "Run Claude non-interactively and exit"
  )
  .option(
    "--dry-run",
    "Resolve skills without launching Claude"
  )
  .action(
    async (
      task: string,
      options: {
        print?: boolean;
        dryRun?: boolean;
      }
    ) => {
      await claudeCommand(
        task,
        options
      );
    }
  );

program
  .command("run")
  .description(
    "Resolve skills and launch a coding agent"
  )
  .argument(
    "<agent>",
    "Agent: codex or claude"
  )
  .argument(
    "<task>",
    "Coding task"
  )
  .option(
    "--non-interactive",
    "Run agent non-interactively"
  )
  .option(
    "--dry-run",
    "Resolve without launching"
  )
  .action(
    async (
      agent: string,
      task: string,
      options: {
        nonInteractive?: boolean;
        dryRun?: boolean;
      }
    ) => {
      await runCommand(
        agent,
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
