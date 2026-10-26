import fs from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";

export interface ProjectConfig {
  version: number;

  profile: string;

  /* Registry names in decreasing precedence order. */
  registries?: string[];

  skills?: {
    /** Available candidates; unlike legacy include, these are not forced. */
    pool?: string[];
    include?: string[];
    exclude?: string[];
  };

  /** Directory prefixes relative to the project, matched by path segment. */
  routing?: {
    paths: Array<{ path: string; profile: string }>;
  };

  /*
   * Write the askills-managed block into CLAUDE.md / AGENTS.md
   * during bootstrap. Defaults to true when omitted.
   */
  agent_instructions?: boolean;
}

export function projectConfigPath(
  root = process.cwd()
): string {
  return path.join(
    root,
    ".agent-skills.yaml"
  );
}

export async function projectConfigExists(
  root = process.cwd()
): Promise<boolean> {
  try {
    await fs.access(projectConfigPath(root));
    return true;
  } catch {
    return false;
  }
}

export async function loadProjectConfig(
  root = process.cwd()
): Promise<ProjectConfig> {
  const file = projectConfigPath(root);

  try {
    const raw = await fs.readFile(
      file,
      "utf8"
    );

    const config =
      YAML.parse(raw) as ProjectConfig;

    if (!config?.profile || typeof config.profile !== "string") {
      throw new Error(
        "Missing profile in .agent-skills.yaml"
      );
    }

    for (const key of ["pool", "include", "exclude"] as const) {
      const ids = config.skills?.[key];
      if (ids !== undefined && (!Array.isArray(ids) || ids.some(id => typeof id !== "string" || !id.trim()))) {
        throw new Error(`Invalid skills.${key}: expected a list of skill IDs`);
      }
    }

    if (config.routing !== undefined) {
      if (!config.routing || !Array.isArray(config.routing.paths)) {
        throw new Error("Invalid routing.paths: expected a list of path/profile mappings");
      }
      const seen = new Set<string>();
      for (const rule of config.routing.paths) {
        if (!rule || typeof rule.path !== "string" || typeof rule.profile !== "string" || !rule.profile.trim()) {
          throw new Error("Invalid routing.paths: each mapping needs a path and profile");
        }
        const prefix = rule.path.replace(/\/+$/, "");
        if (!prefix || path.isAbsolute(prefix) || /[\\:*?\[\]{}]/.test(prefix) ||
            (prefix !== "." && prefix.split("/").some(part => !part || part === "." || part === ".."))) {
          throw new Error(`Invalid routing path "${rule.path}": use a relative directory prefix, without globs`);
        }
        if (seen.has(prefix)) throw new Error(`Invalid routing.paths: duplicate prefix "${prefix}"`);
        seen.add(prefix);
        rule.path = prefix;
      }
    }

    return config;
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message.includes("Missing profile") || error.message.startsWith("Invalid "))
    ) {
      throw error;
    }

    throw new Error(
      `Could not read project config: ${file}`
    );
  }
}

export async function writeProjectConfig(
  config: ProjectConfig,
  root = process.cwd()
): Promise<void> {
  const file = projectConfigPath(root);

  const content = YAML.stringify(config);

  await fs.writeFile(
    file,
    content,
    "utf8"
  );
}
