import pc from "picocolors";

import {
  syncRegistries
} from "../core/registry-config.js";

export async function syncCommand(): Promise<void> {
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
}
