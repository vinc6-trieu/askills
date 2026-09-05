import {
  projectConfigExists,
  loadProjectConfig,
  type ProjectConfig
} from "./project-config.js";

import {
  resolveSkills
} from "./skill-resolver.js";

import {
  materializeActiveSkills
} from "./active-skills.js";

import {
  initCommand
} from "../commands/init.js";

import {
  bootstrapCommand
} from "../commands/bootstrap.js";

import type {
  ResolveResult
} from "./types.js";

import type {
  SkillDescriptor
} from "./skill-frontmatter.js";

export interface PreparedAgentTask {
  root: string;

  task: string;

  config: ProjectConfig;

  resolution: ResolveResult;

  activeSkills: SkillDescriptor[];
}

export async function prepareAgentTask(
  task: string,
  root = process.cwd()
): Promise<PreparedAgentTask> {
  if (
    !(await projectConfigExists(root))
  ) {
    await initCommand({
      auto: true
    });
  }

  await bootstrapCommand();

  const config =
    await loadProjectConfig(root);

  const resolution =
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
      ...resolution.always,

      ...resolution.selected.map(
        skill => skill.id
      )
    ])
  ];

  const activeSkills =
    await materializeActiveSkills(
      ids,
      root
    );

  return {
    root,
    task,
    config,
    resolution,
    activeSkills
  };
}
