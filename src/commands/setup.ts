import pc from "picocolors";

import {
  installRegistry
} from "../core/registry-config.js";

interface SetupOptions {
  registry: string;
  name?: string;
  ref?: string;
}

export async function setupCommand(
  options: SetupOptions
): Promise<void> {
  console.log();
  console.log(
    "Installing skill registry..."
  );

  console.log(
    `  Source: ${options.registry}`
  );

  const registry = await installRegistry({
    name: options.name ?? "default",
    url: options.registry,
    ref: options.ref
  });

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
