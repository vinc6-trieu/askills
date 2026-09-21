import fs from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";

import {
  askillsHome,
  registryCacheRoot,
  registryConfigPath,
  registryRoot,
  registrySourceRoot
} from "./paths.js";

import {
  RegistryContext,
  type RegistryLocation
} from "./registry-context.js";

import {
  loadProjectConfig,
  projectConfigExists
} from "./project-config.js";

import {
  loadProjectLock,
  type ProjectLock,
  writeProjectLock
} from "./project-lock.js";

import {
  runGitOutput
} from "./git.js";

export interface RegistryDefinition {
  name: string;
  url: string;
  ref?: string;
}

interface RegistryConfigFile {
  version: 1;
  registries: RegistryDefinition[];
}

async function exists(target: string): Promise<boolean> {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

function validateDefinitions(
  definitions: RegistryDefinition[]
): RegistryDefinition[] {
  const names = new Set<string>();

  for (const registry of definitions) {
    if (!/^[a-z0-9][a-z0-9_-]*$/i.test(registry.name)) {
      throw new Error(`Invalid registry name: ${registry.name}`);
    }

    if (!registry.url) {
      throw new Error(`Registry "${registry.name}" has no URL.`);
    }

    if (names.has(registry.name)) {
      throw new Error(`Duplicate registry name: ${registry.name}`);
    }

    names.add(registry.name);
  }

  return definitions;
}

export async function loadRegistryDefinitions(): Promise<RegistryDefinition[]> {
  if (process.env.ASKILLS_REGISTRY_PATH) {
    return [{
      name: "default",
      url: process.env.ASKILLS_REGISTRY_PATH
    }];
  }

  try {
    const raw = await fs.readFile(registryConfigPath(), "utf8");
    const config = YAML.parse(raw) as RegistryConfigFile;

    if (config?.version !== 1 || !Array.isArray(config.registries)) {
      throw new Error("version must be 1 and registries must be a list");
    }

    return validateDefinitions(config.registries);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw new Error(
        `Could not read registry configuration: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /* Backward-compatible read support for the original single registry. */
  if (await exists(path.join(registryRoot(), ".git"))) {
    return [{
      name: "default",
      url: await runGitOutput(["-C", registryRoot(), "config", "--get", "remote.origin.url"])
    }];
  }

  return [];
}

export async function saveRegistryDefinitions(
  definitions: RegistryDefinition[]
): Promise<void> {
  validateDefinitions(definitions);
  await fs.mkdir(askillsHome(), { recursive: true });
  await fs.writeFile(
    registryConfigPath(),
    YAML.stringify({ version: 1, registries: definitions }),
    "utf8"
  );
}

export async function installRegistry(
  registry: RegistryDefinition
): Promise<string> {
  validateDefinitions([registry]);
  const current = await loadRegistryDefinitions();

  if (current.some(item => item.name === registry.name)) {
    throw new Error(`Registry "${registry.name}" is already configured.`);
  }

  const target = registrySourceRoot(registry.name);

  if (await exists(target)) {
    throw new Error(`Registry directory already exists: ${target}`);
  }

  await fs.mkdir(path.dirname(target), { recursive: true });
  const args = ["clone", "--depth", "1"];

  if (registry.ref) {
    args.push("--branch", registry.ref);
  }

  args.push(registry.url, target);
  await runGitOutput(args);

  if (!(await exists(path.join(target, "skills"))) || !(await exists(path.join(target, "profiles")))) {
    throw new Error(`Invalid skill registry "${registry.name}": missing skills/ or profiles/.`);
  }

  await saveRegistryDefinitions([...current, registry]);
  await ensureRegistrySnapshot(registry);
  return target;
}

export async function syncRegistries(): Promise<Array<{
  name: string;
  commit: string;
}>> {
  const definitions = await loadRegistryDefinitions();

  if (definitions.length === 0) {
    throw new Error("No skill registries are installed. Run askills setup --registry <git-url>.");
  }

  const result: Array<{ name: string; commit: string }> = [];

  for (const registry of definitions) {
    const source = process.env.ASKILLS_REGISTRY_PATH ?? registrySourceRoot(registry.name);

    if (!process.env.ASKILLS_REGISTRY_PATH) {
      await runGitOutput(["-C", source, "pull", "--ff-only"]);
    }

    const snapshot = await ensureRegistrySnapshot(registry);
    result.push({ name: registry.name, commit: snapshot.commit });
  }

  return result;
}

export async function registryCommit(root: string): Promise<string> {
  return runGitOutput(["-C", root, "rev-parse", "HEAD"]);
}

export async function ensureRegistrySnapshot(
  registry: RegistryDefinition
): Promise<{ root: string; commit: string }> {
  const source = process.env.ASKILLS_REGISTRY_PATH ?? registrySourceRoot(registry.name);
  const commit = await registryCommit(source);
  const cache = registryCacheRoot(registry.name, commit);

  if (!(await exists(path.join(cache, "skills")))) {
    await fs.mkdir(path.dirname(cache), { recursive: true });
    await runGitOutput(["clone", "--no-checkout", source, cache]);
    await runGitOutput(["-C", cache, "checkout", "--detach", commit]);
  }

  return { root: cache, commit };
}

export async function createRegistryContext(
  root = process.cwd(),
  options: { useLock?: boolean } = {}
): Promise<RegistryContext> {
  const definitions = await loadRegistryDefinitions();
  const config = await (
    await projectConfigExists(root)
      ? loadProjectConfig(root)
      : Promise.resolve(undefined)
  );
  const selectedNames = config?.registries ?? definitions.map(item => item.name);
  const selected = selectedNames.map(name => {
    const registry = definitions.find(item => item.name === name);

    if (!registry) {
      throw new Error(`Project references unknown registry "${name}".`);
    }

    return registry;
  });

  const lock = options.useLock === false ? undefined : await loadProjectLock(root);
  const locations: RegistryLocation[] = [];

  for (const registry of selected) {
    const locked = lock?.registries.find(item => item.name === registry.name);

    if (lock && !locked) {
      throw new Error(
        `Registry "${registry.name}" is not present in .agent-skills.lock.yaml. Remove the lock to refresh it.`
      );
    }

    if (locked) {
      if (locked.url !== registry.url) {
        throw new Error(
          `Registry "${registry.name}" URL differs from .agent-skills.lock.yaml.`
        );
      }

      const cache = registryCacheRoot(registry.name, locked.commit);

      if (!(await exists(path.join(cache, "skills")))) {
        throw new Error(
          `Locked cache is missing for ${registry.name}@${locked.commit}. Run askills sync.`
        );
      }

      locations.push({ ...registry, root: cache, commit: locked.commit });
      continue;
    }

    const source = process.env.ASKILLS_REGISTRY_PATH ?? registrySourceRoot(registry.name);
    locations.push({ ...registry, root: source });
  }

  return new RegistryContext(locations);
}

export async function lockProjectRegistries(
  root = process.cwd(),
  force = false
): Promise<ProjectLock> {
  const existing = await loadProjectLock(root);

  if (existing && !force) {
    return existing;
  }

  const definitions = await loadRegistryDefinitions();
  const config = await loadProjectConfig(root);
  const selected = (config.registries ?? definitions.map(item => item.name)).map(name => {
    const registry = definitions.find(item => item.name === name);

    if (!registry) {
      throw new Error(`Project references unknown registry "${name}".`);
    }

    return registry;
  });

  const registries = await Promise.all(selected.map(async registry => {
    const snapshot = await ensureRegistrySnapshot(registry);
    return { name: registry.name, url: registry.url, commit: snapshot.commit };
  }));

  const lock: ProjectLock = { version: 1, registries };
  await writeProjectLock(lock, root);
  return lock;
}
