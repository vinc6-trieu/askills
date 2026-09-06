import fs from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";

export interface ProjectConfig {
  version: number;

  profile: string;

  skills?: {
    include?: string[];
    exclude?: string[];
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

    if (!config.profile) {
      throw new Error(
        "Missing profile in .agent-skills.yaml"
      );
    }

    return config;
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes("Missing profile")
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
