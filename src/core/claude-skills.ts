import fs from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";

import {
  type SkillDescriptor
} from "./skill-frontmatter.js";

import {
  writeAskillsLocalExcludes
} from "./git-exclude.js";

import type { BootstrapTransaction } from "./bootstrap-transaction.js";

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
  descriptors: SkillDescriptor[],
  root: string,
  transaction: BootstrapTransaction
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

  await transaction.directory(claudeRoot);

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

    if (path.basename(name) !== name || name === "." || name === "..") throw new Error("Invalid skill name in Claude state");
    if (await isSymlink(target)) {
      await transaction.remove(target);
    }
  }

  const installed:
    SkillDescriptor[] = [];

  const skipped:
    ClaudeSkillResult["skipped"] = [];

  for (const descriptor of descriptors) {
    const {id, name} = descriptor;
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

    await transaction.link(descriptor.path, target);

    installed.push(
      descriptor
    );
  }

  await transaction.writeFile(
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
    })
  );

  await writeAskillsLocalExcludes(
    installed.map(
      skill =>
        `.claude/skills/${skill.name}`
    ),
    root, transaction
  );

  return {
    root: claudeRoot,
    installed,
    skipped
  };
}
