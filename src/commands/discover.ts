import { discoverSkills } from "../core/discovery.js";
import { createRegistryContext, loadRegistryDefinitions } from "../core/registry-config.js";

import { loadProjectConfig, projectConfigExists } from "../core/project-config.js";
import { projectSkillPool } from "../core/project-pool.js";
import { registrySkillChanges } from "../core/registry-updates.js";

export async function discoverCommand(query = ""): Promise<void> {
  const root = process.cwd();
  const hasRegistry = (await loadRegistryDefinitions()).length > 0;
  const context = hasRegistry || await projectConfigExists(root) ? await createRegistryContext(root) : undefined;
  const report = await discoverSkills(root, context, query);
  const latest = context?.registries.some(item => item.commit) ? await createRegistryContext(root, { useLock: false }) : undefined;
  const registry = context && latest
    ? await registrySkillChanges(context, latest, report.active)
    : { updates: [], warnings: [] };
  // A removed skill is fine if the latest profile and config no longer ask for it; otherwise
  // --update-lock would fail, so name the reference that still needs fixing instead.
  let blocked: string | undefined;
  if (latest && registry.updates.some(item => item.status === "removed") && await projectConfigExists(root)) {
    try {
      await projectSkillPool(await loadProjectConfig(root), latest, root);
    } catch (error) {
      blocked = error instanceof Error ? error.message : String(error);
    }
  }
  console.log("\nGitHub skill suggestions");
  for (const item of report.suggestions) {
    const reasons = item.matches.map(term => `matches ${term}`);
    if (item.stars !== undefined) reasons.push(`${item.stars} repository stars`);
    if (item.license) reasons.push(`repository license: ${item.license}`);
    if (item.reference) reasons.push("available in your registry");
    console.log(`  ${item.name} — ${reasons.join(", ")}`);
    console.log(`    ${item.description.slice(0, 180)}\n    ${item.url}`);
    console.log(item.reference ? `    askills add ${item.reference} --pool` :
      "    Review this pinned skill directory for import into your registry.");
  }
  if (!report.suggestions.length) console.log("  No recommendations from the sources checked.");
  console.log("\nSkill updates");
  for (const item of registry.updates) {
    console.log(`  ${item.reference} — synced registry directory ${item.status} (${item.previous.slice(0, 8)} → ${item.current.slice(0, 8)})`);
  }
  if (blocked) {
    console.log(`  The synced registry cannot be adopted yet: ${blocked}`);
    console.log("  Remove or replace that reference (or exclude the skill with askills remove), then run askills bootstrap --update-lock.");
  } else if (registry.updates.length) console.log("  To adopt the synced registry revisions for this project: askills bootstrap --update-lock");
  for (const item of report.updates) {
    console.log(`  ${item.reference} — upstream directory ${item.status} (${item.previous.slice(0, 8)} → ${item.current.slice(0, 8)})`);
    console.log(`    ${item.url}`);
  }
  if (report.updates.length) console.log("  Review upstream changes before refreshing the registry import.");
  else if (report.checkedUpstreams) console.log(`  ${report.checkedUpstreams} upstream skill directories checked, no changes found.`);
  else console.log("  No GitHub upstream comparisons completed.");
  if (report.untracked) console.log(`  ${report.untracked} active skills have no UPSTREAM.json to compare on GitHub.`);
  for (const warning of [...report.warnings, ...registry.warnings]) console.warn(`  Discovery incomplete: ${warning}`);
}
