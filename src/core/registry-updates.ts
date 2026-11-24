import { runGitOutput } from "./git.js";
import { parseRegistryReference, type RegistryContext } from "./registry-context.js";

async function skillDirectories(root: string, commit: string) {
  const output = await runGitOutput(["-C", root, "ls-tree", "-rtz", commit, "--", "skills/"]);
  const directories = new Map<string, string>();
  const descriptors = new Set<string>();
  for (const line of output.split("\0")) {
    const tab = line.indexOf("\t");
    if (tab < 0) continue;
    const [, type, sha] = line.slice(0, tab).split(" ");
    const file = line.slice(tab + 1 + "skills/".length);
    if (type === "tree") directories.set(file, sha);
    if (type === "blob" && file.endsWith("/SKILL.md")) descriptors.add(file.slice(0, -"/SKILL.md".length));
  }
  return new Map([...directories].filter(([id]) => descriptors.has(id)));
}

export async function registrySkillChanges(locked: RegistryContext, latest: RegistryContext, references: string[]) {
  const updates: Array<{reference: string; status: "changed" | "removed"; previous: string; current: string}> = [];
  const warnings: string[] = [];
  for (const registry of locked.registries) {
    const source = latest.registries.find(item => item.name === registry.name);
    if (!source || !registry.commit) continue;
    try {
      const current = await runGitOutput(["-C", source.root, "rev-parse", "HEAD"]);
      if (registry.commit === current) continue;
      const [before, after] = await Promise.all([
        skillDirectories(registry.root, registry.commit), skillDirectories(source.root, current)
      ]);
      for (const reference of references) {
        const {registry: name, id} = parseRegistryReference(reference);
        if (name !== registry.name || !before.has(id) || before.get(id) === after.get(id)) continue;
        updates.push({reference, status: after.has(id) ? "changed" : "removed", previous: registry.commit, current});
      }
    } catch (error) {
      warnings.push(`${registry.name} registry comparison: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return { updates, warnings };
}
