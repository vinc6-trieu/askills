import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

const statusMessage = "askills: selecting project skills";

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function managed(value: unknown): boolean {
  return object(value) && value.type === "command" && value.statusMessage === statusMessage &&
    Array.isArray(value.args) && value.args[1] === "claude-hook";
}

export async function configureClaudeHook(root: string, enable: boolean, cli: string): Promise<void> {
  const dir = path.join(root, ".claude");
  const file = path.join(dir, "settings.local.json");
  let previous: string | undefined;
  let mode = 0o600;
  try {
    const stat = await fs.lstat(file);
    if (!stat.isFile()) throw new Error(`Expected a regular Claude settings file at ${file}`);
    previous = await fs.readFile(file, "utf8");
    mode = stat.mode & 0o777;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    if (!enable) return;
  }
  const config: unknown = previous === undefined ? {} : JSON.parse(previous.replace(/^\uFEFF/, ""));
  if (!object(config)) throw new Error(`Invalid Claude settings in ${file}`);
  const hooks = config.hooks === undefined ? {} : config.hooks;
  if (!object(hooks)) throw new Error(`Invalid hooks in ${file}`);
  const groups = hooks.UserPromptSubmit === undefined ? [] : hooks.UserPromptSubmit;
  if (!Array.isArray(groups)) throw new Error(`Invalid UserPromptSubmit settings in ${file}`);

  const next: unknown[] = [];
  for (const group of groups) {
    if (!object(group) || !Array.isArray(group.hooks) || !group.hooks.some(managed)) {
      next.push(group);
      continue;
    }
    const others = group.hooks.filter(item => !managed(item));
    if (others.length) next.push({ ...group, hooks: others });
  }
  if (enable) {
    const args = [cli, "claude-hook"];
    if (process.env.ASKILLS_HOME) args.push("--askills-home", path.resolve(process.env.ASKILLS_HOME));
    if (process.env.ASKILLS_REGISTRY_PATH) args.push("--registry-path", path.resolve(process.env.ASKILLS_REGISTRY_PATH));
    next.push({ hooks: [{ type: "command", command: process.execPath, args, timeout: 5, statusMessage }] });
  }
  if (JSON.stringify(next) === JSON.stringify(groups)) return;
  if (next.length) hooks.UserPromptSubmit = next;
  else delete hooks.UserPromptSubmit;
  if (Object.keys(hooks).length) config.hooks = hooks;
  else delete config.hooks;

  await fs.mkdir(dir, { recursive: true });
  const temp = path.join(dir, `.askills-${randomUUID()}.tmp`);
  try {
    await fs.writeFile(temp, JSON.stringify(config, null, 2) + "\n", { mode, flag: "wx" });
    if (previous === undefined) {
      await fs.link(temp, file);
    } else {
      if (await fs.readFile(file, "utf8") !== previous) throw new Error(`Claude settings changed while updating ${file}. Retry the command.`);
      await fs.rename(temp, file);
    }
  } finally {
    await fs.rm(temp, { force: true });
  }
}
