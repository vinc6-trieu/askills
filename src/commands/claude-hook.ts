import { refusesSkill, taskDirectives } from "../core/task-directives.js";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { configureClaudeHook } from "../core/claude-hook-settings.js";
import { findProjectRoot as projectRoot } from "../core/project-config.js";
import { loadSkillDescriptor } from "../core/skill-frontmatter.js";
import { resolveTask } from "../core/task-routing.js";
import { inferredRequirementsReason, isRequirementsSkill } from "../core/requirements-intent.js";

async function mentionedPaths(prompt: string, root: string, cwd: string): Promise<string[]> {
  const paths = new Set<string>();
  // VS Code may append a line selection such as #5-10 or #L5-L10.
  const references = /(?:^|\s)@(?:"([^"\n]+)"|'([^'\n]+)'|([^\s"'<>]+))/gu;
  let inspected = 0;
  for (const match of prompt.matchAll(references)) {
    if (++inspected > 32) break;
    const file = (match[1] ?? match[2] ?? match[3]).replace(/#L?\d+(?:-L?\d+)?$/i, "");
    for (const base of new Set([cwd, root])) {
      const target = path.resolve(base, file);
      const relative = path.relative(root, target);
      if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) continue;
      const real = await fs.realpath(target).catch(() => undefined);
      if (real && (real === root || real.startsWith(root.endsWith(path.sep) ? root : root + path.sep))) {
        paths.add(relative || ".");
        break;
      }
    }
    if (paths.size >= 8) break;
  }
  return [...paths];
}

export async function runClaudePromptHook(raw: string) {
  try {
    const event = JSON.parse(raw);
    if (event?.hook_event_name !== "UserPromptSubmit" || typeof event.prompt !== "string" ||
        typeof event.cwd !== "string" || !path.isAbsolute(event.cwd)) return;
    const prompt = event.prompt.trim();
    if (!prompt || prompt.startsWith("/")) return;
    const cwd = await fs.realpath(event.cwd);
    const root = await projectRoot(cwd);
    if (!root) return;
    const paths = await mentionedPaths(prompt, root, cwd);
    const { context, resolution } = await resolveTask(prompt, root, { paths });
    const relevant = resolution.selected.filter(skill => paths.length || skill.reasons.some(reason =>
      reason === "explicit skill match" || reason === "config include (forced)" ||
      reason.startsWith("intent:") || reason.startsWith("keyword:")
    ));
    const { refused } = taskDirectives(prompt);
    const names: string[] = [];
    const visible: string[] = [];
    let clarify = false;
    for (const skill of relevant) {
      try {
        const descriptor = await loadSkillDescriptor(skill.id, context);
        if (refusesSkill(refused, skill.id, descriptor.name)) continue;
        if (!/^[a-z0-9][a-z0-9_-]*$/i.test(descriptor.name)) continue;
        const native = path.join(root, ".claude", "skills", descriptor.name, "SKILL.md");
        const [actual, expected] = await Promise.all([
          fs.realpath(native), fs.realpath(path.join(descriptor.path, "SKILL.md"))
        ]);
        if (actual !== expected) continue;
        const name = `/${descriptor.name}`;
        names.push(name);
        if (!skill.reasons.includes(inferredRequirementsReason)) visible.push(name);
        if (isRequirementsSkill(skill.id)) clarify = true;
      } catch {
        // An unlinked, stale or project-owned skill is not this registry entry.
      }
    }
    if (!names.length) return;
    const guidance = [`askills suggests ${names.join(", ")} for this request. Use the project skills that fit.`];
    if (clarify) guidance.push(
      "Check decisions in this conversation and relevant project evidence first. Honor requests to proceed without questions. " +
      "Ask one focused question only if a remaining choice changes the outcome. Otherwise proceed within the user's requested scope."
    );
    return {
      ...(visible.length ? { systemMessage: `askills suggests ${visible.join(", ")}` } : {}),
      hookSpecificOutput: {
        hookEventName: "UserPromptSubmit",
        additionalContext: guidance.join(" ")
      }
    };
  } catch {
    // Suggestions are optional. Malformed input or an unavailable registry leaves the prompt alone.
    return;
  }
}

interface HookOptions {
  enable?: boolean;
  disable?: boolean;
  registryPath?: string;
  askillsHome?: string;
}

export async function claudeHookCommand(options: HookOptions): Promise<void> {
  if (options.enable || options.disable) {
    if (options.enable && options.disable) throw new Error("Choose either --enable or --disable.");
    const configured = await projectRoot(process.cwd());
    if (options.enable && !configured) throw new Error("Run askills init and askills bootstrap in this project first.");
    const root = configured ?? process.cwd();
    const cli = fileURLToPath(new URL("../../dist/cli.js", import.meta.url));
    if (options.enable) await fs.access(cli);
    await configureClaudeHook(root, Boolean(options.enable), cli);
    console.log(`Claude prompt suggestions ${options.enable ? "enabled" : "disabled"} for ${root}`);
    return;
  }
  if (options.registryPath) process.env.ASKILLS_REGISTRY_PATH = options.registryPath;
  if (options.askillsHome) process.env.ASKILLS_HOME = options.askillsHome;
  if (process.stdin.isTTY) return;
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of process.stdin) {
    size += chunk.length;
    if (size > 1024 * 1024) return;
    chunks.push(chunk);
  }
  const hint = await runClaudePromptHook(Buffer.concat(chunks).toString("utf8"));
  if (hint) console.log(JSON.stringify(hint));
}
