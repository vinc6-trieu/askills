import fs from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";

import {
  createRegistryContext
} from "./registry-config.js";

import {
  formatRegistryReference,
  parseRegistryReference,
  type RegistryContext
} from "./registry-context.js";

import type {
  ProfileFile,
  ResolvedProfile
} from "./types.js";

async function loadProfile(
  name: string,
  context: RegistryContext,
  defaultRegistry?: string
): Promise<{ profile: ProfileFile; registry: string }> {
  const parsed = parseRegistryReference(name);

  if (
    !parsed.id ||
    path.isAbsolute(parsed.id) ||
    parsed.id.includes("\\") ||
    parsed.id.split("/").some(part => part === "." || part === ".." || part.length === 0)
  ) {
    throw new Error(`Invalid profile name: ${name}`);
  }

  const registries = parsed.registry
    ? context.registries.filter(item => item.name === parsed.registry)
    : defaultRegistry
      ? context.registries.filter(item => item.name === defaultRegistry)
      : context.registries;

  for (const registry of registries) {
    const file = path.join(registry.root, "profiles", `${parsed.id}.yaml`);

    try {
      const raw = await fs.readFile(file, "utf8");
      return {
        profile: YAML.parse(raw) as ProfileFile,
        registry: registry.name
      };
    } catch {
      // Try the next lower-precedence registry.
    }
  }

  throw new Error(`Profile "${name}" not found in configured registries.`);
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

export async function resolveProfile(
  name: string,
  context?: RegistryContext,
  root = process.cwd()
): Promise<ResolvedProfile> {
  const registryContext = context ?? await createRegistryContext(root);
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

    const loaded = await loadProfile(profileName, registryContext);
    const current = loaded.profile;
    const currentRegistry = loaded.registry;

    let always: string[] = [];
    let pool: string[] = [];

    let maxAutoSkills = 6;

    for (const parentName of current.extends ?? []) {
      const parent = await resolve(
        parseRegistryReference(parentName).registry
          ? parentName
          : formatRegistryReference(currentRegistry, parentName)
      );

      always.push(...parent.always);
      pool.push(...parent.pool);

      maxAutoSkills = parent.maxAutoSkills;
    }

    const qualify = (id: string): string =>
      parseRegistryReference(id).registry
        ? id
        : formatRegistryReference(currentRegistry, id);

    always.push(...(current.always ?? []).map(qualify));
    pool.push(...(current.pool ?? []).map(qualify));

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
      name: formatRegistryReference(currentRegistry, current.name ?? parseRegistryReference(profileName).id),
      always,
      pool,
      maxAutoSkills
    };
  }

  return resolve(name);
}
