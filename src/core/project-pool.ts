import type { ProjectConfig } from "./project-config.js";
import { resolveProfile } from "./profile-resolver.js";
import type { RegistryContext } from "./registry-context.js";

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

export async function projectSkillPool(config: ProjectConfig, context: RegistryContext, root: string, extraSkills: string[] = []) {
  const profiles = await Promise.all(unique([
    config.profile, ...(config.routing?.paths.map(route => route.profile) ?? [])
  ]).map(name => resolveProfile(name, context, root)));

  async function required(ids: string[], field: string) {
    return Promise.all(ids.map(async id => {
      try { return (await context.resolveSkill(id)).reference; }
      catch (error) { throw new Error(`${field} references ${id}: ${(error as Error).message}`); }
    }));
  }
  const include = await required(config.skills?.include ?? [], ".agent-skills.yaml skills.include");
  const pool = await required(config.skills?.pool ?? [], ".agent-skills.yaml skills.pool");
  const extra = await required(extraSkills, "Requested skills");
  const exclude = new Set(await Promise.all((config.skills?.exclude ?? []).map(id => context.exclusionReference(id))));

  const ids = unique([
    ...profiles.flatMap(profile => profile.always),
    ...profiles.flatMap(profile => profile.pool),
    ...include, ...pool, ...extra
  ]).filter(
    id => !exclude.has(id)
  );

  return { ids, exclude };
}
