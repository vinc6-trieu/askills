import fs from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";

export interface ProjectRegistryLock {
  name: string;
  url: string;
  commit: string;
}

export interface ProjectLock {
  version: 1;
  registries: ProjectRegistryLock[];
}

export function projectLockPath(root = process.cwd()): string {
  return path.join(root, ".agent-skills.lock.yaml");
}

export async function loadProjectLock(
  root = process.cwd()
): Promise<ProjectLock | undefined> {
  try {
    const raw = await fs.readFile(projectLockPath(root), "utf8");
    const lock = YAML.parse(raw) as ProjectLock;

    if (lock?.version !== 1 || !Array.isArray(lock.registries)) {
      throw new Error("lock version must be 1 and registries must be a list");
    }

    return lock;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return undefined;
    }

    throw new Error(
      `Could not read project lock: ${projectLockPath(root)} (${error instanceof Error ? error.message : String(error)})`
    );
  }
}

export async function writeProjectLock(
  lock: ProjectLock,
  root = process.cwd()
): Promise<void> {
  await fs.writeFile(
    projectLockPath(root),
    YAML.stringify(lock),
    "utf8"
  );
}
