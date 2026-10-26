import { createRegistryContext } from "./registry-config.js";
import type { RegistryContext } from "./registry-context.js";
import { loadProjectConfig, projectConfigExists, type ProjectConfig } from "./project-config.js";
import { detectProfile } from "./profile-detector.js";
import { resolveSkills } from "./skill-resolver.js";
import { taskPaths, type TaskPath } from "./task-scope.js";

export interface RoutingOptions {
  profile?: string;
  paths?: string[];
  skills?: string[];
}

function contains(prefix: string, target: string): boolean {
  return prefix === "." || target === prefix || target.startsWith(`${prefix}/`);
}

function chooseProfiles(config: ProjectConfig, paths: TaskPath[], override?: string): string[] {
  if (override) return [override];
  if (paths.length === 0) return [config.profile];
  const routes = config.routing?.paths ?? [];
  const selected = new Set<string>();
  for (const target of paths) {
    const containing = routes.filter(route => contains(route.path, target.relative))
      .sort((a, b) => b.path.length - a.path.length);
    selected.add(containing[0]?.profile ?? config.profile);
    // A directory target can span several mapped subprojects.
    if (target.directory) {
      for (const route of routes) if (contains(target.relative, route.path)) selected.add(route.profile);
    }
  }
  return [...selected].sort();
}

/** Read-only entry point shared by resolve, dry-run, and agent preparation. */
export async function resolveTask(task: string, root: string, options: RoutingOptions = {}, context?: RegistryContext) {
  const config: ProjectConfig = await projectConfigExists(root)
    ? await loadProjectConfig(root)
    : { version: 1, profile: options.profile ?? await detectProfile(root) };
  const registry = context ?? await createRegistryContext(root);
  const paths = await taskPaths(root, options.paths ?? []);
  const profiles = chooseProfiles(config, paths, options.profile);
  const resolution = await resolveSkills(task, profiles, root, {
    ...config.skills, skills: options.skills, paths: options.paths
  }, registry);
  return { config, resolution, context: registry, paths: paths.map(p => p.relative) };
}
