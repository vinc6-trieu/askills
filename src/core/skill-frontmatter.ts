import fs from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";

import {
  skillsRoot
} from "./paths.js";

export interface SkillDescriptor {
  id: string;
  name: string;
  description?: string;
  path: string;
}

export async function loadSkillDescriptor(
  id: string
): Promise<SkillDescriptor> {
  const skillPath = path.join(
    skillsRoot(),
    id
  );

  const file = path.join(
    skillPath,
    "SKILL.md"
  );

  let raw: string;

  try {
    raw = await fs.readFile(
      file,
      "utf8"
    );
  } catch {
    throw new Error(
      `Missing SKILL.md for ${id}: ${file}`
    );
  }

  const match = raw.match(
    /^---\s*\n([\s\S]*?)\n---/
  );

  if (!match) {
    throw new Error(
      `Invalid SKILL.md frontmatter: ${id}`
    );
  }

  const frontmatter =
    YAML.parse(match[1]) as {
      name?: string;
      description?: string;
    };

  if (!frontmatter.name) {
    throw new Error(
      `Skill "${id}" has no frontmatter name`
    );
  }

  return {
    id,
    name: frontmatter.name,
    description: frontmatter.description,
    path: skillPath
  };
}
