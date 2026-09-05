import {
  spawn
} from "node:child_process";

import pc from "picocolors";

import {
  prepareAgentTask
} from "./agent-task.js";

import type {
  AgentAdapter,
  AgentRunOptions
} from "../adapters/types.js";

async function spawnAgent(
  binary: string,
  args: string[],
  root: string
): Promise<void> {
  await new Promise<void>(
    (
      resolve,
      reject
    ) => {
      const child =
        spawn(
          binary,
          args,
          {
            cwd: root,

            stdio:
              "inherit",

            env:
              process.env
          }
        );

      child.on(
        "error",
        error => {
          if (
            "code" in error &&
            error.code ===
              "ENOENT"
          ) {
            reject(
              new Error(
                [
                  `${binary} command not found.`,
                  "",
                  `Check:`,
                  `  ${binary} --version`
                ].join("\n")
              )
            );

            return;
          }

          reject(error);
        }
      );

      child.on(
        "exit",
        code => {
          if (
            code === 0 ||
            code === null
          ) {
            resolve();
            return;
          }

          reject(
            new Error(
              `${binary} exited with code ${code}`
            )
          );
        }
      );
    }
  );
}

export async function runAgent(
  adapter: AgentAdapter,
  task: string,
  options:
    AgentRunOptions = {}
): Promise<void> {

  const prepared =
    await prepareAgentTask(
      task
    );

  console.log();

  console.log(
    pc.bold(
      `Askills → ${adapter.displayName}`
    )
  );

  console.log(
    `Profile: ${pc.cyan(
      prepared.config.profile
    )}`
  );

  console.log();

  console.log(
    pc.bold(
      "Selected skills"
    )
  );

  for (
    const skill of
      prepared.activeSkills
  ) {
    console.log(
      `  ${pc.green(
        "✓"
      )} ${skill.name}`
    );
  }

  const invocation =
    adapter.createInvocation(
      prepared,
      options
    );

  if (
    options.dryRun
  ) {
    console.log();

    console.log(
      pc.bold(
        "Invocation preview"
      )
    );

    console.log();

    console.log(
      invocation.preview
    );

    return;
  }

  console.log();

  console.log(
    pc.dim(
      `Launching ${adapter.displayName}...`
    )
  );

  console.log();

  await spawnAgent(
    adapter.binary,
    invocation.args,
    prepared.root
  );
}
