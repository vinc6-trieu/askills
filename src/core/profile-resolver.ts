import fs from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";

import {
  profilesRoot
} from "./paths.js";

import type {
  ProfileFile,
  ResolvedProfile
} from "./types.js";

async function loadProfile(
  name: string
): Promise<ProfileFile> {
  const file = path.join(
    profilesRoot(),
    `${name}.yaml`
  );

  try {
    const raw = await fs.readFile(file, "utf8");

    return YAML.parse(raw) as ProfileFile;
  } catch {
    throw new Error(
      `Profile "${name}" not found: ${file}`
    );
  }
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

export async function resolveProfile(
  name: string
): Promise<ResolvedProfile> {
  const stack = new Set<string>();

  async function resolve(
    profileName: string
  ): Promise<ResolvedProfile> {

    if (stack.has(profileName)) {
      throw new Error(
        `Circular profile inheritance: ${[
          ...stack,
          profileName
        ].join(" -> ")}`
      );
    }

    stack.add(profileName);

    const current = await loadProfile(
      profileName
    );

    let always: string[] = [];
    let pool: string[] = [];

    let maxAutoSkills = 6;

    for (const parentName of current.extends ?? []) {
      const parent = await resolve(parentName);

      always.push(...parent.always);
      pool.push(...parent.pool);

      maxAutoSkills = parent.maxAutoSkills;
    }

    always.push(...(current.always ?? []));
    pool.push(...(current.pool ?? []));

    if (
      current.policy?.max_auto_skills !== undefined
    ) {
      maxAutoSkills =
        current.policy.max_auto_skills;
    }

    stack.delete(profileName);

    always = unique(always);

    pool = unique(pool).filter(
      id => !always.includes(id)
    );

    return {
      name: profileName,
      always,
      pool,
      maxAutoSkills
    };
  }

  return resolve(name);
}
