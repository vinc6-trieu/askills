import fs from "node:fs/promises";
import path from "node:path";
import pc from "picocolors";

import {
  createRegistryContext,
  loadRegistryDefinitions
} from "../core/registry-config.js";

import {
  loadProjectConfig,
  projectConfigExists,
  writeProjectConfig
} from "../core/project-config.js";

import {
  loadProjectLock
} from "../core/project-lock.js";

import {
  loadSkillDescriptor
} from "../core/skill-frontmatter.js";

import {
  loadSkillMeta
} from "../core/skill-registry.js";

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

async function requireProjectConfig(root: string) {
  if (!(await projectConfigExists(root))) {
    throw new Error("No .agent-skills.yaml found. Run askills init first.");
  }

  return loadProjectConfig(root);
}

export async function listCommand(): Promise<void> {
  const context = await createRegistryContext();
  const skills = await context.listSkills();

  for (const skill of skills) {
    const descriptor = await loadSkillDescriptor(skill.reference, context);
    console.log(
      `${skill.reference}${skill.shadowed ? pc.yellow(" (shadowed)") : ""}` +
      (descriptor.description ? pc.dim(` — ${descriptor.description}`) : "")
    );
  }

  console.log(pc.dim(`${skills.length} skills`));
}

export async function searchCommand(query: string): Promise<void> {
  const needle = query.trim().toLowerCase();

  if (!needle) {
    throw new Error("Search query cannot be empty.");
  }

  const context = await createRegistryContext();
  const skills = await context.listSkills();
  let matches = 0;

  for (const skill of skills) {
    const descriptor = await loadSkillDescriptor(skill.reference, context);
    const haystack = [skill.reference, descriptor.name, descriptor.description ?? ""]
      .join("\n")
      .toLowerCase();

    if (!haystack.includes(needle)) {
      continue;
    }

    matches += 1;
    console.log(
      `${skill.reference}${skill.shadowed ? pc.yellow(" (shadowed)") : ""}` +
      (descriptor.description ? pc.dim(` — ${descriptor.description}`) : "")
    );
  }

  console.log(pc.dim(`${matches} matching skills`));
}

export async function addCommand(reference: string): Promise<void> {
  const root = process.cwd();
  const config = await requireProjectConfig(root);
  const context = await createRegistryContext(root);
  const skill = await context.resolveSkill(reference);
  const include = unique([...(config.skills?.include ?? []), skill.reference]);
  const exclude = (config.skills?.exclude ?? []).filter(id => id !== reference && id !== skill.reference);

  await writeProjectConfig({
    ...config,
    skills: { include, exclude }
  }, root);

  console.log(pc.green(`✓ Added ${skill.reference} to this project`));
}

export async function removeCommand(reference: string): Promise<void> {
  const root = process.cwd();
  const config = await requireProjectConfig(root);
  const context = await createRegistryContext(root);
  const skill = await context.resolveSkill(reference);
  const include = (config.skills?.include ?? []).filter(id => id !== reference && id !== skill.reference);
  const exclude = unique([...(config.skills?.exclude ?? []), skill.reference]);

  await writeProjectConfig({
    ...config,
    skills: { include, exclude }
  }, root);

  console.log(pc.green(`✓ Excluded ${skill.reference} from this project`));
}

export async function openCommand(
  reference: string,
  options: { path?: boolean }
): Promise<void> {
  const context = await createRegistryContext();
  const skill = await context.resolveSkill(reference);
  const file = path.join(skill.root, "SKILL.md");

  if (options.path) {
    console.log(file);
    return;
  }

  console.log(await fs.readFile(file, "utf8"));
}

export async function doctorCommand(): Promise<void> {
  const root = process.cwd();
  const registries = await loadRegistryDefinitions();

  if (registries.length === 0) {
    throw new Error("No skill registries are configured.");
  }

  const context = await createRegistryContext(root);
  const lock = await loadProjectLock(root);
  const skills = await context.listSkills();

  for (const skill of skills) {
    await loadSkillMeta(skill.reference, context);
    await loadSkillDescriptor(skill.reference, context);
  }

  console.log(pc.green("✓ Registry configuration is valid"));
  console.log(`  Registries: ${context.registries.map(item => item.name).join(", ")}`);
  console.log(`  Skills: ${skills.length}`);
  console.log(`  Lock: ${lock ? `v${lock.version} (${lock.registries.length} registries)` : "not created yet"}`);
}
