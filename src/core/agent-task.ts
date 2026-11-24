import {
  projectConfigExists,
  type ProjectConfig
} from "./project-config.js";

import {
  resolveTask, type RoutingOptions
} from "./task-routing.js";
import { withProjectBootstrap, type BootstrapTransaction } from "./bootstrap-transaction.js";
import { loadSkillDescriptor } from "./skill-frontmatter.js";

import {
  materializeActiveSkills
} from "./active-skills.js";

import {
  initCommand
} from "../commands/init.js";

import {
  applyBootstrap
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
  async function prepare(routed: Awaited<ReturnType<typeof resolveTask>>, transaction?: BootstrapTransaction) {
    const { config, resolution, context, paths } = routed;
    const ids = [...new Set([...resolution.always, ...resolution.selected.map(skill => skill.id)])];
    let activeSkills: SkillDescriptor[];
    if (transaction) {
      await applyBootstrap(root, context, transaction, ids);
      activeSkills = await materializeActiveSkills(ids, root, context, transaction);
    } else {
      activeSkills = await Promise.all(ids.map(id => loadSkillDescriptor(id, context)));
    }
    return { root, task, config, resolution, activeSkills, paths };
  }

  const preview = await resolveTask(task, root, options);
  if (options.dryRun) return prepare(preview);
  if (!(await projectConfigExists(root))) await initCommand({ auto: true }, root);
  return withProjectBootstrap(root, false, async (context, transaction) =>
    prepare(await resolveTask(task, root, options, context), transaction));
}
