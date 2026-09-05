import {
  spawn
} from "node:child_process";

import pc from "picocolors";

import {
  projectConfigExists,
  loadProjectConfig
} from "../core/project-config.js";

import {
  initCommand
} from "./init.js";

import {
  bootstrapCommand
} from "./bootstrap.js";

import {
  resolveSkills
} from "../core/skill-resolver.js";

import {
  materializeActiveSkills
} from "../core/active-skills.js";

interface CodexOptions {
  exec?: boolean;
  dryRun?: boolean;
}

async function runCodex(
  args: string[]
): Promise<void> {
  await new Promise<void>(
    (resolve, reject) => {
      const child = spawn(
        "codex",
        args,
        {
          cwd: process.cwd(),
          stdio: "inherit",
          env: process.env
        }
      );

      child.on(
        "error",
        error => {
          if (
            "code" in error &&
            error.code === "ENOENT"
          ) {
            reject(
              new Error(
                [
                  "Codex CLI not found.",
                  "",
                  "Install it with:",
                  "  npm install -g @openai/codex"
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
              `Codex exited with code ${code}`
            )
          );
        }
      );
    }
  );
}

export async function codexCommand(
  task: string,
  options: CodexOptions
): Promise<void> {
  const root = process.cwd();

  /*
   * Zero-friction behavior:
   * initialize automatically when this repo
   * has never used askills.
   */
  if (
    !(await projectConfigExists(root))
  ) {
    await initCommand({
      auto: true
    });
  }

  /*
   * Refresh the project candidate pool.
   */
  await bootstrapCommand();

  const config =
    await loadProjectConfig(root);

  const result =
    await resolveSkills(
      task,
      config.profile,
      root,
      {
        include:
          config.skills?.include ?? [],
        exclude:
          config.skills?.exclude ?? []
      }
    );

  const ids = [
    ...new Set([
      ...result.always,
      ...result.selected.map(
        skill => skill.id
      )
    ])
  ];

  const active =
    await materializeActiveSkills(
      ids,
      root
    );

  console.log();
  console.log(
    pc.bold("Askills → Codex")
  );

  console.log(
    `Profile: ${pc.cyan(
      config.profile
    )}`
  );

  console.log();
  console.log(
    pc.bold("Active skills")
  );

  for (const skill of active) {
    console.log(
      `  ${pc.green("✓")} ${skill.id}`
    );
  }

  const skillMarkers =
    active
      .map(
        skill => `$${skill.name}`
      )
      .join(" ");

  const prompt = [
    skillMarkers,
    "",
    task
  ]
    .filter(
      (value, index) =>
        index !== 0 ||
        value.length > 0
    )
    .join("\n");

  if (options.dryRun) {
    console.log();
    console.log(
      pc.bold("Codex prompt")
    );

    console.log();
    console.log(prompt);

    return;
  }

  console.log();
  console.log(
    pc.dim("Launching Codex...")
  );
  console.log();

  if (options.exec) {
    await runCodex([
      "exec",
      prompt
    ]);

    return;
  }

  await runCodex([
    prompt
  ]);
}
