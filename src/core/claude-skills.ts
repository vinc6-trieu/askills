import fs from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";

import {
  loadSkillDescriptor,
  type SkillDescriptor
} from "./skill-frontmatter.js";

import {
  writeAskillsLocalExcludes
} from "./git-exclude.js";

interface ClaudeSkillState {
  version: number;
  generated: string[];
}

export interface ClaudeSkillResult {
  root: string;
  installed: SkillDescriptor[];
  skipped: Array<{
    id: string;
    name: string;
    reason: string;
  }>;
}

async function exists(
  target: string
): Promise<boolean> {
  try {
    await fs.lstat(target);
    return true;
  } catch {
    return false;
  }
}

async function isSymlink(
  target: string
): Promise<boolean> {
  try {
    return (
      await fs.lstat(target)
    ).isSymbolicLink();
  } catch {
    return false;
  }
}

async function loadPreviousState(
  runtimeRoot: string
): Promise<ClaudeSkillState> {
  const file = path.join(
    runtimeRoot,
    "claude-skills.yaml"
  );

  try {
    const raw = await fs.readFile(
      file,
      "utf8"
    );

    return YAML.parse(raw) as ClaudeSkillState;
  } catch {
    return {
      version: 1,
      generated: []
    };
  }
}

export async function prepareClaudeSkills(
  ids: string[],
  root = process.cwd()
): Promise<ClaudeSkillResult> {
  const runtimeRoot = path.join(
    root,
    ".askills"
  );

  const claudeRoot = path.join(
    root,
    ".claude",
    "skills"
  );

  await fs.mkdir(
    runtimeRoot,
    {
      recursive: true
    }
  );

  await fs.mkdir(
    claudeRoot,
    {
      recursive: true
    }
  );

  const previous =
    await loadPreviousState(
      runtimeRoot
    );

  /*
   * Remove only symlinks that askills generated
   * during the previous bootstrap.
   *
   * Never delete a real project-owned skill.
   */
  for (const name of previous.generated) {
    const target = path.join(
      claudeRoot,
      name
    );

    if (await isSymlink(target)) {
      await fs.rm(
        target,
        {
          force: true
        }
      );
    }
  }

  const installed:
    SkillDescriptor[] = [];

  const skipped:
    ClaudeSkillResult["skipped"] = [];

  const names =
    new Map<string, string>();

  for (const id of [...new Set(ids)]) {
    const descriptor =
      await loadSkillDescriptor(id);

    const name =
      descriptor.name.trim();

    if (
      name.toLowerCase() ===
      "synced"
    ) {
      throw new Error(
        `Claude Code reserves the skill name "synced": ${id}`
      );
    }

    const duplicate =
      names.get(name);

    if (duplicate) {
      throw new Error(
        [
          `Duplicate Claude skill name "${name}".`,
          `  ${duplicate}`,
          `  ${id}`
        ].join("\n")
      );
    }

    names.set(
      name,
      id
    );

    const target = path.join(
      claudeRoot,
      name
    );

    /*
     * A real project-owned Claude skill wins.
     *
     * askills must not overwrite it.
     */
    if (await exists(target)) {
      skipped.push({
        id,
        name,
        reason:
          "project skill already exists"
      });

      continue;
    }

    await fs.symlink(
      descriptor.path,
      target,
      process.platform === "win32"
        ? "junction"
        : "dir"
    );

    installed.push(
      descriptor
    );
  }

  await fs.writeFile(
    path.join(
      runtimeRoot,
      "claude-skills.yaml"
    ),
    YAML.stringify({
      version: 1,
      generated:
        installed.map(
          skill => skill.name
        )
    }),
    "utf8"
  );

  await writeAskillsLocalExcludes(
    installed.map(
      skill =>
        `.claude/skills/${skill.name}`
    ),
    root
  );

  return {
    root: claudeRoot,
    installed,
    skipped
  };
}
