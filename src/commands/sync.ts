import pc from "picocolors";

import {
  syncRegistries
} from "../core/registry-config.js";

import { discoverCommand } from "./discover.js";

export async function syncCommand(options = { discover: true }): Promise<void> {
  console.log();
  console.log(
    "Updating skill registry..."
  );

  const registries = await syncRegistries();

  console.log();
  console.log(
    pc.green(
      "✓ Registries updated"
    )
  );

  for (const registry of registries) {
    console.log(`  ${registry.name}: ${registry.commit}`);
  }

  if (options.discover) {
    try {
      await discoverCommand();
    } catch (error) {
      console.warn(`Skill discovery unavailable: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
