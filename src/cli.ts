#!/usr/bin/env node

import { Command } from "commander";
import pc from "picocolors";

import {
  VERSION
} from "./version.js";

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

import {
  addCommand,
  doctorCommand,
  listCommand,
  openCommand,
  removeCommand,
  searchCommand
} from "./commands/skills.js";

const program = new Command();

program
  .name("askills")
  .description(
    "Portable coding-agent skill manager"
  )
  .version(VERSION);

program
  .command("setup")
  .description(
    "Install the central skill registry"
  )
  .requiredOption(
    "--registry <url>",
    "Git repository containing agent skills"
  )
  .option("--name <name>", "Registry name (default: default)")
  .option("--ref <ref>", "Branch or tag to clone")
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

program.command("doctor")
  .description("Validate registry, lock, and skill metadata")
  .action(async () => { await doctorCommand(); });

program.command("list")
  .description("List skills from configured registries")
  .action(async () => { await listCommand(); });

program.command("search")
  .description("Search skill names and descriptions")
  .argument("<query>", "Search query")
  .action(async (query: string) => { await searchCommand(query); });

program.command("add")
  .description("Force-include a skill in the current project")
  .argument("<skill>", "Skill ID, optionally registry:skill")
  .option("--pool", "Add a candidate without forcing selection; explicitly moves a legacy include entry")
  .action(async (skill: string, options: { pool?: boolean }) => { await addCommand(skill, options); });

program.command("remove")
  .description("Exclude a skill from the current project")
  .argument("<skill>", "Skill ID, optionally registry:skill")
  .action(async (skill: string) => { await removeCommand(skill); });

program.command("open")
  .description("Print a skill's SKILL.md")
  .argument("<skill>", "Skill ID, optionally registry:skill")
  .option("--path", "Print the resolved SKILL.md path only")
  .action(async (skill: string, options: { path?: boolean }) => {
    await openCommand(skill, options);
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
  .option("--update-lock", "Refresh the project registry lock to current commits")
  .action(async (options: { updateLock?: boolean }) => {
    await bootstrapCommand(options);
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
  .option("--path <path>", "Task file or directory (repeatable)", (value: string, previous: string[]) => [...previous, value], [])
  .option("--skill <skill>", "Require a skill for this invocation (repeatable)", (value: string, previous: string[]) => [...previous, value], [])
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
        path?: string[];
        skill?: string[];
      }
    ) => {
      await resolveCommand(
        task,
        { ...options, paths: options.path, skills: options.skill }
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
  .option("--profile <profile>", "Override the profile for this invocation")
  .option("--path <path>", "Task file or directory (repeatable)", (value: string, previous: string[]) => [...previous, value], [])
  .option("--skill <skill>", "Require a skill for this invocation (repeatable)", (value: string, previous: string[]) => [...previous, value], [])
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
        profile?: string;
        path?: string[];
        skill?: string[];
      }
    ) => {
      await codexCommand(
        task,
        { ...options, paths: options.path, skills: options.skill }
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
  .option("--profile <profile>", "Override the profile for this invocation")
  .option("--path <path>", "Task file or directory (repeatable)", (value: string, previous: string[]) => [...previous, value], [])
  .option("--skill <skill>", "Require a skill for this invocation (repeatable)", (value: string, previous: string[]) => [...previous, value], [])
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
        profile?: string;
        path?: string[];
        skill?: string[];
      }
    ) => {
      await claudeCommand(
        task,
        { ...options, paths: options.path, skills: options.skill }
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
  .option("--profile <profile>", "Override the profile for this invocation")
  .option("--path <path>", "Task file or directory (repeatable)", (value: string, previous: string[]) => [...previous, value], [])
  .option("--skill <skill>", "Require a skill for this invocation (repeatable)", (value: string, previous: string[]) => [...previous, value], [])
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
        profile?: string;
        path?: string[];
        skill?: string[];
      }
    ) => {
      await runCommand(
        agent,
        task,
        { ...options, paths: options.path, skills: options.skill }
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
