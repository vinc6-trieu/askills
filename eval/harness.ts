import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import YAML from "yaml";
import { RegistryContext } from "../src/core/registry-context.js";
import { resolveSkills, type ResolveOverrides } from "../src/core/skill-resolver.js";
import type { ProfileFile, SkillMeta } from "../src/core/types.js";
import { resolveTask } from "../src/core/task-routing.js";
import type { ProjectConfig } from "../src/core/project-config.js";

export const evalRoot = path.dirname(fileURLToPath(import.meta.url));
export interface RoutingCase {
  id: string;
  task: string;
  profile: string;
  repo: string;
  overrides?: ResolveOverrides;
  must?: string[];
  mustNot?: string[];
  maxAuto?: number;
  diagnostic?: boolean;
  routing?: ProjectConfig["routing"];
  paths?: string[];
  profiles?: string[];
}

export async function fixtureRegistry(): Promise<{ root: string; cleanup: () => Promise<void> }> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "askills-eval-"));
  const data = JSON.parse(await fs.readFile(path.join(evalRoot, "fixture-registry.json"), "utf8")) as {
    profiles: Record<string, ProfileFile>; skills: SkillMeta[];
  };
  await fs.mkdir(path.join(root, "profiles"));
  for (const [name, profile] of Object.entries(data.profiles)) {
    await fs.writeFile(path.join(root, "profiles", `${name}.yaml`), YAML.stringify(profile));
  }
  for (const skill of data.skills) {
    const dir = path.join(root, "skills", skill.id);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, "skill.meta.yaml"), YAML.stringify(skill));
    await fs.writeFile(path.join(dir, "SKILL.md"), `---\nname: ${skill.id.replaceAll("/", "-")}\ndescription: Routing evaluation fixture\n---\n`);
  }
  return { root, cleanup: () => fs.rm(root, { recursive: true, force: true }) };
}

export async function loadCases(real = false, scoped = false): Promise<RoutingCase[]> {
  return JSON.parse(await fs.readFile(path.join(evalRoot, scoped ? "scope-cases.json" : real ? "registry-cases.json" : "cases.json"), "utf8"));
}

export async function evaluate(cases: RoutingCase[], registry: string) {
  const context = new RegistryContext([{ name: "default", root: registry }]);
  const results = [];
  for (const entry of cases) {
    const failures: string[] = [];
    let selected: string[] = [];
    let temporary: string | undefined;
    try {
      let root = path.resolve(evalRoot, "../test/fixtures/repos", entry.repo);
      if (entry.routing) {
        temporary = await fs.mkdtemp(path.join(os.tmpdir(), "askills-scope-eval-"));
        await fs.cp(root, temporary, { recursive: true });
        await fs.writeFile(path.join(temporary, ".agent-skills.yaml"), YAML.stringify({
          version: 1, profile: entry.profile, routing: entry.routing
        }));
        root = temporary;
      }
      const result = entry.routing
        ? (await resolveTask(entry.task, root, { paths: entry.paths }, context)).resolution
        : await resolveSkills(entry.task, entry.profile, root, entry.overrides, context);
      selected = [...result.always, ...result.selected.map(s => s.id)].map(id => id.replace(/^default:/, ""));
      for (const id of entry.must ?? []) if (!selected.includes(id)) failures.push(`missing: ${id}`);
      for (const id of entry.mustNot ?? []) if (selected.includes(id)) failures.push(`unexpected: ${id}`);
      if (entry.maxAuto !== undefined && result.selected.length > entry.maxAuto) failures.push("automatic budget exceeded");
      if (entry.profiles && JSON.stringify(result.profiles.map(p => p.replace(/^default:/, ""))) !== JSON.stringify(entry.profiles)) {
        failures.push(`profiles: ${result.profiles.join(", ")}`);
      }
    } catch (error) { failures.push(String(error)); }
    finally { if (temporary) await fs.rm(temporary, { recursive: true, force: true }); }
    results.push({ id: entry.id, diagnostic: entry.diagnostic ?? false, selected, failures, pass: failures.length === 0 });
  }
  return results;
}

// Identifies the exact metadata/profile contents, including uncommitted edits.
export async function registryFingerprint(root: string): Promise<string> {
  const hash = createHash("sha256");
  async function walk(dir: string): Promise<void> {
    for (const item of (await fs.readdir(dir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const file = path.join(dir, item.name);
      if (item.isDirectory()) await walk(file);
      else if (item.name.endsWith(".yaml")) hash.update(path.relative(root, file)).update(await fs.readFile(file));
    }
  }
  await walk(path.join(root, "profiles"));
  await walk(path.join(root, "skills"));
  return hash.digest("hex");
}
