import fs from "node:fs/promises";
import path from "node:path";
import pc from "picocolors";

import {
  askillsHome,
  registryRoot
} from "../core/paths.js";

import {
  runGit
} from "../core/git.js";

interface SetupOptions {
  registry: string;
}

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

async function validateRegistry(
  root: string
): Promise<void> {
  const required = [
    "skills",
    "profiles"
  ];

  for (const entry of required) {
    const target = path.join(
      root,
      entry
    );

    if (!(await exists(target))) {
      throw new Error(
        `Invalid skill registry: missing ${entry}/`
      );
    }
  }
}

export async function setupCommand(
  options: SetupOptions
): Promise<void> {
  const home = askillsHome();
  const registry = registryRoot();

  await fs.mkdir(
    home,
    {
      recursive: true
    }
  );

  if (
    await exists(
      path.join(
        registry,
        ".git"
      )
    )
  ) {
    console.log(
      pc.yellow(
        "Registry already installed."
      )
    );

    console.log(
      `  ${registry}`
    );

    console.log();
    console.log(
      `Run ${pc.cyan(
        "askills sync"
      )} to update it.`
    );

    return;
  }

  if (await exists(registry)) {
    const contents =
      await fs.readdir(registry);

    if (contents.length > 0) {
      throw new Error(
        `Registry directory already exists and is not a Git repository: ${registry}`
      );
    }
  }

  console.log();
  console.log(
    "Installing skill registry..."
  );

  console.log(
    `  Source: ${options.registry}`
  );

  console.log(
    `  Target: ${registry}`
  );

  console.log();

  await runGit([
    "clone",
    "--depth",
    "1",
    options.registry,
    registry
  ]);

  await validateRegistry(
    registry
  );

  console.log();
  console.log(
    pc.green(
      "✓ askills setup complete"
    )
  );

  console.log(
    `  Registry: ${registry}`
  );
}
