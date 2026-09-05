import fs from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";

import {
  loadSkillDescriptor,
  type SkillDescriptor
} from "./skill-frontmatter.js";

function flattenId(
  id: string
): string {
  return id.replace(
    /[\\/]/g,
    "--"
  );
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

export async function materializeActiveSkills(
  ids: string[],
  root = process.cwd()
): Promise<SkillDescriptor[]> {
  const runtimeRoot =
    path.join(
      root,
      ".askills"
    );

  const activeRoot =
    path.join(
      runtimeRoot,
      "active"
    );

  await fs.rm(
    activeRoot,
    {
      recursive: true,
      force: true
    }
  );

  await fs.mkdir(
    activeRoot,
    {
      recursive: true
    }
  );

  const descriptors:
    SkillDescriptor[] = [];

  const names =
    new Map<string, string>();

  for (
    const id of [...new Set(ids)]
  ) {
    const descriptor =
      await loadSkillDescriptor(id);

    const existing =
      names.get(
        descriptor.name
      );

    if (existing) {
      throw new Error(
        [
          `Duplicate skill name "${descriptor.name}".`,
          `  ${existing}`,
          `  ${id}`
        ].join("\n")
      );
    }

    names.set(
      descriptor.name,
      id
    );

    await linkDirectory(
      descriptor.path,
      path.join(
        activeRoot,
        flattenId(id)
      )
    );

    descriptors.push(
      descriptor
    );
  }

  await fs.writeFile(
    path.join(
      runtimeRoot,
      "active.yaml"
    ),
    YAML.stringify({
      version: 1,

      skills:
        descriptors.map(
          skill => ({
            id: skill.id,
            name: skill.name
          })
        )
    }),
    "utf8"
  );

  return descriptors;
}
