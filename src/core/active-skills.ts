import type { BootstrapTransaction } from "./bootstrap-transaction.js";
import path from "node:path";
import YAML from "yaml";

import {
  loadSkillDescriptor,
  type SkillDescriptor
} from "./skill-frontmatter.js";

import type {
  RegistryContext
} from "./registry-context.js";

function flattenId(
  id: string
): string {
  return id.replace(
    /[\\/]/g,
    "--"
  );
}

export async function materializeActiveSkills(
  ids: string[],
  root: string,
  context: RegistryContext,
  transaction: BootstrapTransaction
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

  await transaction.remove(activeRoot);
  await transaction.directory(activeRoot);

  const descriptors:
    SkillDescriptor[] = [];

  const names =
    new Map<string, string>();

  for (
    const id of [...new Set(ids)]
  ) {
    const descriptor =
      await loadSkillDescriptor(id, context);

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

    await transaction.link(
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

  await transaction.writeFile(
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
    })
  );

  return descriptors;
}
