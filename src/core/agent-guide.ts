import fs from "node:fs/promises";
import path from "node:path";

import type {
  SkillDescriptor
} from "./skill-frontmatter.js";

/*
 * askills writes a delimited, regenerated block into the agent
 * instruction files at the repository root so that a coding agent
 * knows the project's skills come from askills even during plain
 * IDE chat, where nothing else routes toward them.
 *
 * The block is meant to be committed. Everything between the markers
 * is owned by askills and rewritten on every bootstrap.
 */

const START =
  "<!-- >>> askills managed >>> -->";

const END =
  "<!-- <<< askills managed <<< -->";

const TARGET_FILES = [
  "CLAUDE.md",
  "AGENTS.md"
];

export interface AgentGuideResult {
  written: string[];
  removed: string[];
}

function escapeRegExp(
  value: string
): string {
  return value.replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&"
  );
}

function renderBlock(
  skills: SkillDescriptor[]
): string {
  const pool =
    skills.length > 0
      ? skills.map(skill => {
          const summary =
            skill.description?.trim();

          return summary
            ? `- \`${skill.name}\` — ${summary}`
            : `- \`${skill.name}\``;
        })
      : ["- (no skills currently in the pool)"];

  return [
    START,
    "",
    "## Skills (managed by askills)",
    "",
    "This repository uses askills to expose a curated pool of coding-agent",
    "skills. The skill content lives in a central registry and is linked",
    "into this project in each agent's native location:",
    "",
    "- Claude Code: `.claude/skills/`",
    "- Codex: `.agents/skills/askills--*`",
    "",
    "Guidance for agents working in this repository:",
    "",
    "- Treat these skills as the primary source of engineering guidance and",
    "  load one whenever the current task matches its description.",
    "- Do not force a skill when it does not apply.",
    "- The linked skill directories are generated. Do not edit or commit",
    "  them; run `askills bootstrap` to refresh the pool.",
    "",
    "Current pool:",
    "",
    ...pool,
    "",
    END
  ].join("\n");
}

export async function writeAgentGuides(
  skills: SkillDescriptor[],
  enabled: boolean,
  root = process.cwd()
): Promise<AgentGuideResult> {
  const blockPattern =
    new RegExp(
      `\\n*${escapeRegExp(START)}[\\s\\S]*?${escapeRegExp(END)}\\n?`,
      "g"
    );

  const block =
    renderBlock(skills);

  const written: string[] = [];
  const removed: string[] = [];

  for (const name of TARGET_FILES) {
    const file = path.join(
      root,
      name
    );

    let existing = "";
    let hadFile = true;

    try {
      existing = await fs.readFile(
        file,
        "utf8"
      );
    } catch {
      hadFile = false;
    }

    const base = existing
      .replace(
        blockPattern,
        ""
      )
      .replace(
        /\s+$/,
        ""
      );

    if (!enabled) {
      if (!hadFile) {
        continue;
      }

      if (base.length === 0) {
        /*
         * The file only ever held the askills block.
         */
        await fs.rm(
          file,
          {
            force: true
          }
        );
      } else {
        await fs.writeFile(
          file,
          `${base}\n`,
          "utf8"
        );
      }

      removed.push(name);

      continue;
    }

    const next =
      base.length > 0
        ? `${base}\n\n${block}\n`
        : `${block}\n`;

    await fs.writeFile(
      file,
      next,
      "utf8"
    );

    written.push(name);
  }

  return {
    written,
    removed
  };
}
