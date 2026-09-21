import fs from "node:fs/promises";
import path from "node:path";

export interface RegistryLocation {
  name: string;
  root: string;
  source?: string;
  commit?: string;
}

export interface RegistryReference {
  registry?: string;
  id: string;
}

export interface ResolvedRegistrySkill {
  registry: string;
  id: string;
  root: string;
  reference: string;
  shadowed: boolean;
}

export function parseRegistryReference(
  value: string
): RegistryReference {
  const separator = value.indexOf(":");

  if (separator <= 0) {
    return { id: value };
  }

  return {
    registry: value.slice(0, separator),
    id: value.slice(separator + 1)
  };
}

export function formatRegistryReference(
  registry: string,
  id: string
): string {
  return `${registry}:${id}`;
}

function validateSkillId(id: string): void {
  if (
    !id ||
    path.isAbsolute(id) ||
    id.includes("\\") ||
    id.split("/").some(part => part === "." || part === ".." || part.length === 0)
  ) {
    throw new Error(`Invalid skill ID: ${id}`);
  }
}

async function exists(target: string): Promise<boolean> {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

export class RegistryContext {
  readonly registries: RegistryLocation[];

  constructor(registries: RegistryLocation[]) {
    if (registries.length === 0) {
      throw new Error("No skill registries are configured.");
    }

    const names = new Set<string>();

    for (const registry of registries) {
      if (!registry.name || !registry.root) {
        throw new Error("Each registry must have a name and root path.");
      }

      if (names.has(registry.name)) {
        throw new Error(`Duplicate registry name: ${registry.name}`);
      }

      names.add(registry.name);
    }

    this.registries = registries;
  }

  private registry(name: string): RegistryLocation {
    const registry = this.registries.find(item => item.name === name);

    if (!registry) {
      throw new Error(`Unknown registry "${name}".`);
    }

    return registry;
  }

  private skillRoot(registry: RegistryLocation, id: string): string {
    return path.join(registry.root, "skills", id);
  }

  async resolveSkill(reference: string): Promise<ResolvedRegistrySkill> {
    const parsed = parseRegistryReference(reference);
    validateSkillId(parsed.id);

    if (parsed.registry) {
      const registry = this.registry(parsed.registry);
      const root = this.skillRoot(registry, parsed.id);

      if (!(await exists(path.join(root, "SKILL.md")))) {
        throw new Error(`Skill "${reference}" was not found.`);
      }

      return {
        registry: registry.name,
        id: parsed.id,
        root,
        reference: formatRegistryReference(registry.name, parsed.id),
        shadowed: false
      };
    }

    for (const registry of this.registries) {
      const root = this.skillRoot(registry, parsed.id);

      if (await exists(path.join(root, "SKILL.md"))) {
        return {
          registry: registry.name,
          id: parsed.id,
          root,
          reference: formatRegistryReference(registry.name, parsed.id),
          shadowed: false
        };
      }
    }

    throw new Error(`Skill "${reference}" was not found in any registry.`);
  }

  async listSkills(): Promise<ResolvedRegistrySkill[]> {
    const result: ResolvedRegistrySkill[] = [];
    const seen = new Set<string>();

    for (const registry of this.registries) {
      const skillsRoot = path.join(registry.root, "skills");

      if (!(await exists(skillsRoot))) {
        continue;
      }

      const files = await fs.readdir(skillsRoot, { recursive: true });

      for (const file of files) {
        if (
          file !== "SKILL.md" &&
          !file.endsWith(`${path.sep}SKILL.md`)
        ) {
          continue;
        }

        const directory = path.dirname(file).replaceAll(path.sep, "/");
        const shadowed = seen.has(directory);
        seen.add(directory);

        result.push({
          registry: registry.name,
          id: directory,
          root: path.join(skillsRoot, directory),
          reference: formatRegistryReference(registry.name, directory),
          shadowed
        });
      }
    }

    return result.sort((a, b) =>
      a.reference.localeCompare(b.reference)
    );
  }
}
