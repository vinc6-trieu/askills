import { discoverSkills } from "../core/discovery.js";
import { createRegistryContext, loadRegistryDefinitions } from "../core/registry-config.js";

import { projectConfigExists } from "../core/project-config.js";
import { registrySkillChanges } from "../core/registry-updates.js";

export async function discoverCommand(query = ""): Promise<void> {
  const root = process.cwd();
  const hasRegistry = (await loadRegistryDefinitions()).length > 0;
  const context = hasRegistry || await projectConfigExists(root) ? await createRegistryContext(root) : undefined;
  const report = await discoverSkills(root, context, query);
  const registry = context?.registries.some(item => item.commit)
    ? await registrySkillChanges(context, await createRegistryContext(root, { useLock: false }), report.active)
    : { updates: [], warnings: [] };
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
  if (registry.updates.length) console.log("  To adopt the synced registry revisions for this project: askills bootstrap --update-lock");
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
