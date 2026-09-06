import pc from "picocolors";

import {
  detectProfile
} from "../core/profile-detector.js";

import {
  projectConfigExists,
  projectConfigPath,
  writeProjectConfig
} from "../core/project-config.js";

import {
  ensureAskillsGitignore
} from "../core/gitignore.js";

export interface InitOptions {
  auto?: boolean;
  profile?: string;
  force?: boolean;
}

export async function initCommand(
  options: InitOptions
): Promise<void> {
  const root = process.cwd();

  if (
    await projectConfigExists(root)
  ) {
    if (!options.force) {
      console.log(
        pc.yellow(
          ".agent-skills.yaml already exists."
        )
      );

      console.log(
        pc.dim(
          "Use --force to regenerate it."
        )
      );

      return;
    }
  }

  let profile: string;

  if (options.profile) {
    profile = options.profile;
  } else {
    profile = await detectProfile(root);
  }

  await writeProjectConfig(
    {
      version: 1,
      profile,
      skills: {
        include: [],
        exclude: []
      },
      agent_instructions: true
    },
    root
  );

  await ensureAskillsGitignore(root);

  console.log();
  console.log(
    pc.green("✓ Project initialized")
  );

  console.log(
    `  Profile: ${pc.cyan(profile)}`
  );

  console.log(
    `  Config: ${projectConfigPath(root)}`
  );

  if (options.auto || !options.profile) {
    console.log(
      pc.dim(
        "  Profile selected from repository signals."
      )
    );
  }

  console.log();
  console.log(
    "Next:"
  );

  console.log(
    `  ${pc.cyan("askills bootstrap")}`
  );
}
