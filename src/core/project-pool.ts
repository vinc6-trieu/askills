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

  const normalize = (ids: string[]) => Promise.all(ids.map(async id => (await context.resolveSkill(id)).reference));
  const include = await normalize(config.skills?.include ?? []);
  const pool = await normalize(config.skills?.pool ?? []);
  const extra = await normalize(extraSkills);
  const exclude = new Set(await normalize(config.skills?.exclude ?? []));

  const ids = unique([
    ...profiles.flatMap(profile => profile.always),
    ...profiles.flatMap(profile => profile.pool),
    ...include, ...pool, ...extra
  ]).filter(
    id => !exclude.has(id)
  );

  return { ids, exclude };
}
