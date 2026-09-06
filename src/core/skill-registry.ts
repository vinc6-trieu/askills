import fs from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";

import {
  skillsRoot
} from "./paths.js";

import type {
  SkillMeta
} from "./types.js";

export async function loadSkillMeta(
  id: string
): Promise<SkillMeta> {
  const file = path.join(
    skillsRoot(),
    id,
    "skill.meta.yaml"
  );

  try {
    const raw = await fs.readFile(
      file,
      "utf8"
    );

    const meta =
      YAML.parse(raw) as SkillMeta;

    if (!meta.id) {
      meta.id = id;
    }

    return meta;
  } catch {
    throw new Error(
      `Missing metadata for skill "${id}": ${file}`
    );
  }
}

/*
 * Lenient bulk loader used by the resolver.
 *
 * A single skill with missing or invalid metadata
 * should not abort resolution for the whole pool;
 * it is warned about and left unscored. Bootstrap
 * still validates every skill strictly via
 * loadSkillMeta.
 */
export async function loadSkillMetas(
  ids: string[]
): Promise<Map<string, SkillMeta>> {

  const result =
    new Map<string, SkillMeta>();

  for (const id of ids) {
    try {
      result.set(
        id,
        await loadSkillMeta(id)
      );
    } catch (error) {
      console.warn(
        `askills: skipping "${id}" during resolution: ${
          error instanceof Error
            ? error.message
            : String(error)
        }`
      );
    }
  }

  return result;
}
