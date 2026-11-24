import fs from "node:fs/promises";
import path from "node:path";
import pc from "picocolors";
import YAML from "yaml";

import {
  loadProjectConfig
} from "../core/project-config.js";

import { projectSkillPool } from "../core/project-pool.js";

import { withProjectBootstrap, type BootstrapTransaction } from "../core/bootstrap-transaction.js";
import type { RegistryContext } from "../core/registry-context.js";

import {
  loadSkillMeta
} from "../core/skill-registry.js";

import {
  loadSkillDescriptor,
  type SkillDescriptor
} from "../core/skill-frontmatter.js";

import {
  ensureAskillsGitignore
} from "../core/gitignore.js";

import {
  prepareClaudeSkills
} from "../core/claude-skills.js";

import {
  writeAgentGuides
} from "../core/agent-guide.js";

const CODEX_GENERATED_PREFIX =
  "askills--";

function flattenId(
  id: string
): string {
  return id.replace(
    /[\\/]/g,
    "--"
  );
}

async function cleanupGeneratedCodexSkills(
  root: string, transaction: BootstrapTransaction
): Promise<string> {
  const codexSkillsRoot =
    path.join(
      root,
      ".agents",
      "skills"
    );

  await transaction.directory(codexSkillsRoot);

  const entries =
    await fs.readdir(
      codexSkillsRoot,
      {
        withFileTypes: true
      }
    );

  for (const entry of entries) {
    if (
      entry.name.startsWith(
        CODEX_GENERATED_PREFIX
      )
    ) {
      await transaction.remove(path.join(codexSkillsRoot, entry.name));
    }
  }

  // Cleanup old implementation.
  await transaction.remove(path.join(codexSkillsRoot, "askills-generated"));

  return codexSkillsRoot;
}

export async function bootstrapCommand(
  options: { updateLock?: boolean; root?: string; extraSkills?: string[] } = {}
): Promise<void> {
  const root = options.root ?? process.cwd();

  const summary = await withProjectBootstrap(root, Boolean(options.updateLock), (context, transaction) =>
    applyBootstrap(root, context, transaction, options.extraSkills));
  console.log(pc.green("✓ Skills bootstrapped"));
  console.log(summary);
}

export async function applyBootstrap(root: string, context: RegistryContext,
  transaction: BootstrapTransaction, extraSkills: string[] = []) {
  const config = await loadProjectConfig(root);
  const { ids } = await projectSkillPool(config, context, root, extraSkills);
  const descriptors: SkillDescriptor[] = [];
  const names = new Map<string, string>();
  const codexNames = new Set<string>();
  for (const id of ids) {
    await loadSkillMeta(id, context);
    const descriptor = await loadSkillDescriptor(id, context);
    const name = descriptor.name.trim();
    if (!name || path.basename(name) !== name || /[\\/]/.test(name) || [".", "..", "synced"].includes(name.toLowerCase())) {
      throw new Error(`Invalid or reserved native skill name "${name}" for ${id}`);
    }
    if (names.has(name)) throw new Error(`Duplicate skill name "${name}": ${names.get(name)}, ${id}`);
    if (codexNames.has(flattenId(id))) throw new Error(`Duplicate Codex directory for ${id}`);
    names.set(name, id);
    codexNames.add(flattenId(id));
    descriptors.push({...descriptor, name});
  }

  const runtimeRoot = path.join(root, ".askills");
  const poolRoot = path.join(runtimeRoot, "pool");
  await transaction.remove(poolRoot);
  await transaction.directory(poolRoot);
  const codexSkillsRoot = await cleanupGeneratedCodexSkills(root, transaction);
  await ensureAskillsGitignore(root, transaction);
  const installed = descriptors.map(({id, name}) => ({id, name}));
  for (const descriptor of descriptors) {
    await transaction.link(descriptor.path, path.join(poolRoot, descriptor.id));
    await transaction.link(descriptor.path, path.join(codexSkillsRoot, CODEX_GENERATED_PREFIX + flattenId(descriptor.id)));
  }
  const claude = await prepareClaudeSkills(descriptors, root, transaction);
  const agentGuides = await writeAgentGuides(descriptors, config.agent_instructions !== false, root, transaction);

  const state = {
    version: 1,

    profile:
      config.profile,

    registries:
      context.registries.map(registry => ({
        name: registry.name,
        root: registry.root,
        commit: registry.commit
      })),

    integrations: {
      codex: {
        path:
          codexSkillsRoot,

        skills:
          installed.length
      },

      claude: {
        path:
          claude.root,

        skills:
          claude.installed.length,

        skipped:
          claude.skipped.length
      },

      agents: {
        instructions:
          config.agent_instructions !== false,

        written:
          agentGuides.written,

        removed:
          agentGuides.removed
      }
    },

    skills:
      installed
  };

  await transaction.writeFile(
    path.join(
      runtimeRoot,
      "state.yaml"
    ),
    YAML.stringify(state)
  );

  const lines = [
    `  Profile: ${config.profile}`, `  Skills: ${installed.length}`, `  Pool: ${poolRoot}`,
    `  Codex: ${codexSkillsRoot}`, `  Claude: ${claude.root}`
  ];
  if (agentGuides.written.length) lines.push(`  Agent guides: ${agentGuides.written.join(", ")}`);
  if (agentGuides.removed.length) lines.push(`  Agent guides removed: ${agentGuides.removed.join(", ")}`);
  if (claude.skipped.length) lines.push("  Claude skill collisions:", ...claude.skipped.map(item => `    ${item.name}: ${item.reason}`));
  return lines.join("\n");
}
