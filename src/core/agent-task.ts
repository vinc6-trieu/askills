import {
  projectConfigExists,
  type ProjectConfig
} from "./project-config.js";

import {
  resolveTask, type RoutingOptions
} from "./task-routing.js";
import { lockProjectRegistries } from "./registry-config.js";
import { loadSkillDescriptor } from "./skill-frontmatter.js";

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

  paths: string[];
}

export async function prepareAgentTask(
  task: string,
  root = process.cwd(),
  options: RoutingOptions & { dryRun?: boolean } = {}
): Promise<PreparedAgentTask> {
  // Validate and preview without touching config, caches, guides, or links.
  let routed = await resolveTask(task, root, options);
  if (!options.dryRun) {
    if (!(await projectConfigExists(root))) await initCommand({ auto: true }, root);
    await lockProjectRegistries(root);
    // Use exactly the locked snapshot for both selection and materialization.
    routed = await resolveTask(task, root, options);
  }
  const { config, resolution, context } = routed;

  const ids = [
    ...new Set([
      ...resolution.always,

      ...resolution.selected.map(
        skill => skill.id
      )
    ])
  ];

  let activeSkills: SkillDescriptor[];
  if (options.dryRun) {
    activeSkills = await Promise.all(ids.map(id => loadSkillDescriptor(id, context)));
  } else {
    await bootstrapCommand({ root, extraSkills: ids });
    activeSkills = await materializeActiveSkills(ids, root, context);
  }

  return {
    root,
    task,
    config,
    resolution,
    activeSkills,
    paths: routed.paths
  };
}
