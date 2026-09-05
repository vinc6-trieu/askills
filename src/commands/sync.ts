import fs from "node:fs/promises";
import path from "node:path";
import pc from "picocolors";

import {
  registryRoot
} from "../core/paths.js";

import {
  runGit
} from "../core/git.js";

async function exists(
  target: string
): Promise<boolean> {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

export async function syncCommand(): Promise<void> {
  const registry = registryRoot();

  if (
    !(await exists(
      path.join(
        registry,
        ".git"
      )
    ))
  ) {
    throw new Error(
      [
        "Skill registry is not installed.",
        "",
        "Run:",
        "  askills setup --registry <git-url>"
      ].join("\n")
    );
  }

  console.log();
  console.log(
    "Updating skill registry..."
  );

  await runGit([
    "-C",
    registry,
    "pull",
    "--ff-only"
  ]);

  console.log();
  console.log(
    pc.green(
      "✓ Registry updated"
    )
  );
}
