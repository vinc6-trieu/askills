import fs from "node:fs/promises";
import path from "node:path";
import pc from "picocolors";
import YAML from "yaml";

import {
  loadProjectConfig
} from "../core/project-config.js";

import {
  resolveProfile
} from "../core/profile-resolver.js";

import {
  skillsRoot
} from "../core/paths.js";

import {
  loadSkillMeta
} from "../core/skill-registry.js";

import {
  loadSkillDescriptor
} from "../core/skill-frontmatter.js";

import {
  ensureAskillsGitignore
} from "../core/gitignore.js";

import {
  prepareClaudeSkills
} from "../core/claude-skills.js";

const CODEX_GENERATED_PREFIX =
  "askills--";

function unique(
  values: string[]
): string[] {
  return [...new Set(values)];
}

function flattenId(
  id: string
): string {
  return id.replace(
    /[\\/]/g,
    "--"
  );
}

async function skillExists(
  id: string
): Promise<boolean> {
  const skillMd = path.join(
    skillsRoot(),
    id,
    "SKILL.md"
  );

  try {
    await fs.access(skillMd);
    return true;
  } catch {
    return false;
  }
}

async function linkDirectory(
  source: string,
  target: string
): Promise<void> {
  await fs.mkdir(
    path.dirname(target),
    {
      recursive: true
    }
  );

  await fs.rm(
    target,
    {
      recursive: true,
      force: true
    }
  );

  await fs.symlink(
    source,
    target,
    process.platform === "win32"
      ? "junction"
      : "dir"
  );
}

async function cleanupGeneratedCodexSkills(
  root: string
): Promise<string> {
  const codexSkillsRoot =
    path.join(
      root,
      ".agents",
      "skills"
    );

  await fs.mkdir(
    codexSkillsRoot,
    {
      recursive: true
    }
  );

  const entries =
    await fs.readdir(
      codexSkillsRoot,
      {
        withFileTypes: true
      }
    );

  for (const entry of entries) {
    if (
      entry.name.startsWith(
        CODEX_GENERATED_PREFIX
      )
    ) {
      await fs.rm(
        path.join(
          codexSkillsRoot,
          entry.name
        ),
        {
          recursive: true,
          force: true
        }
      );
    }
  }

  // Cleanup old implementation.
  await fs.rm(
    path.join(
      codexSkillsRoot,
      "askills-generated"
    ),
    {
      recursive: true,
      force: true
    }
  );

  return codexSkillsRoot;
}

export async function bootstrapCommand(): Promise<void> {
  const root = process.cwd();

  const config =
    await loadProjectConfig(root);

  const profile =
    await resolveProfile(
      config.profile
    );

  const include =
    config.skills?.include ?? [];

  const exclude =
    new Set(
      config.skills?.exclude ?? []
    );

  const skillIds = unique([
    ...profile.always,
    ...profile.pool,
    ...include
  ]).filter(
    id => !exclude.has(id)
  );

  const runtimeRoot =
    path.join(
      root,
      ".askills"
    );

  const poolRoot =
    path.join(
      runtimeRoot,
      "pool"
    );

  await fs.rm(
    poolRoot,
    {
      recursive: true,
      force: true
    }
  );

  await fs.mkdir(
    poolRoot,
    {
      recursive: true
    }
  );

  const codexSkillsRoot =
    await cleanupGeneratedCodexSkills(
      root
    );

  await ensureAskillsGitignore(
    root
  );

  const installed: Array<{
    id: string;
    name: string;
  }> = [];

  const skillNames =
    new Map<string, string>();

  for (const id of skillIds) {
    if (!(await skillExists(id))) {
      throw new Error(
        `Skill not found in registry: ${id}`
      );
    }

    // Validate routing metadata.
    await loadSkillMeta(id);

    // Validate SKILL.md + obtain Codex invocation name.
    const descriptor =
      await loadSkillDescriptor(id);

    const existing =
      skillNames.get(
        descriptor.name
      );

    if (existing) {
      throw new Error(
        [
          `Duplicate skill name "${descriptor.name}".`,
          `  ${existing}`,
          `  ${id}`,
          "",
          "Codex skill names must be unique inside the project pool."
        ].join("\n")
      );
    }

    skillNames.set(
      descriptor.name,
      id
    );

    const source =
      descriptor.path;

    /*
     * Agent-neutral candidate pool.
     */
    await linkDirectory(
      source,
      path.join(
        poolRoot,
        id
      )
    );

    /*
     * Codex-native repo skill discovery.
     *
     * Important:
     * skills are direct children of .agents/skills.
     */
    await linkDirectory(
      source,
      path.join(
        codexSkillsRoot,
        `${CODEX_GENERATED_PREFIX}${flattenId(id)}`
      )
    );

    installed.push({
      id,
      name: descriptor.name
    });
  }

  const claude =
    await prepareClaudeSkills(
      skillIds,
      root
    );

  const state = {
    version: 1,

    profile:
      config.profile,

    registry:
      skillsRoot(),

    integrations: {
      codex: {
        path:
          codexSkillsRoot,

        skills:
          installed.length
      },

      claude: {
        path:
          claude.root,

        skills:
          claude.installed.length,

        skipped:
          claude.skipped.length
      }
    },

    skills:
      installed
  };

  await fs.writeFile(
    path.join(
      runtimeRoot,
      "state.yaml"
    ),
    YAML.stringify(state),
    "utf8"
  );

  console.log();

  console.log(
    pc.green(
      "✓ Skills bootstrapped"
    )
  );

  console.log(
    `  Profile: ${pc.cyan(
      config.profile
    )}`
  );

  console.log(
    `  Skills: ${installed.length}`
  );

  console.log(
    `  Pool: ${poolRoot}`
  );

  console.log(
    `  Codex: ${codexSkillsRoot}`
  );

  console.log(
    `  Claude: ${claude.root}`
  );

  if (claude.skipped.length > 0) {
    console.log();

    console.log(
      pc.yellow(
        "  Claude skill collisions:"
      )
    );

    for (
      const item of claude.skipped
    ) {
      console.log(
        `    ${item.name}: ${item.reason}`
      );
    }
  }

  console.log();
}
