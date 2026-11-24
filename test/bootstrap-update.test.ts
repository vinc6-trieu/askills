import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { bootstrapCommand } from "../src/commands/bootstrap.js";
import { runGitOutput } from "../src/core/git.js";
import { resolveTask } from "../src/core/task-routing.js";
import { loadProjectLock } from "../src/core/project-lock.js";

test("bootstrap publishes a usable snapshot or restores the previous project", async t => {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), "askills-adopt-"));
  const registry = path.join(base, "registry");
  const root = path.join(base, "project");
  await fs.cp(fileURLToPath(new URL("./fixtures/registry", import.meta.url)), registry, {recursive:true});
  const saved = { ...process.env };
  process.env.ASKILLS_HOME = path.join(base, "home");
  process.env.ASKILLS_REGISTRY_PATH = registry;
  t.after(async () => {
    for (const key of ["ASKILLS_HOME", "ASKILLS_REGISTRY_PATH"]) {
      if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key];
    }
    await fs.rm(base, {recursive:true,force:true});
  });
  const git = (...args: string[]) => runGitOutput(["-C", registry, ...args]);
  async function commit() {
    await git("add", "-A");
    await git("-c","user.name=Fixture","-c","user.email=fixture@example.test","-c","commit.gpgsign=false","commit","-qm","fixture");
    return git("rev-parse","HEAD");
  }
  await fs.mkdir(root);
  await fs.writeFile(path.join(registry, "profiles/min.yaml"), "name: min\npool: [global/systematic-debugging]\n");
  const config = path.join(root, ".agent-skills.yaml");
  await fs.writeFile(config, "profile: min\nskills:\n  pool: [global/tdd]\n");
  await git("init","-q");
  await commit();
  const update = () => bootstrapCommand({root, updateLock:true});
  await update();
  const lockFile = path.join(root, ".agent-skills.lock.yaml");
  const lock = await fs.readFile(lockFile,"utf8");
  const native = path.join(root,".claude/skills/tdd");
  const originalTarget = await fs.realpath(native);
  await fs.rename(path.join(registry, "skills/global/tdd"), path.join(registry,"retired"));
  const latest = await commit();
  await assert.rejects(update, /global\/tdd/);
  assert.equal(await fs.readFile(lockFile,"utf8"), lock);
  assert.equal(await fs.realpath(native), originalTarget);
  await resolveTask("use tdd",root);
  await fs.writeFile(config, "profile: min\nskills:\n  exclude: [default:global/tdd]\n");
  const stateFile = path.join(root, ".askills/state.yaml");
  const originalState = await fs.readFile(stateFile, "utf8");
  const guideFile = path.join(root, "AGENTS.md");
  const originalGuide = await fs.readFile(guideFile, "utf8");
  // The filesystem rejects a file write at a directory, after the native links have been rebuilt.
  await fs.rename(stateFile, stateFile + ".saved");
  await fs.mkdir(stateFile);
  await assert.rejects(update);
  assert.equal(await fs.realpath(native), originalTarget);
  assert.equal(await fs.readFile(guideFile,"utf8"), originalGuide);
  assert.equal(await fs.readFile(lockFile,"utf8"), lock);
  await fs.rmdir(stateFile);
  await fs.rename(stateFile + ".saved", stateFile);
  assert.equal(await fs.readFile(stateFile, "utf8"), originalState);
  const results = await Promise.allSettled([update(),update()]);
  assert.ok(results.some(item => item.status === "fulfilled"), JSON.stringify(results));
  assert.equal((await loadProjectLock(root))?.registries[0].commit, latest);
  await assert.rejects(fs.lstat(native), {code:"ENOENT"});
  assert.ok((await fs.realpath(path.join(root, ".claude/skills/systematic-debugging"))).includes(latest));
  await resolveTask("debug",root);
  await update();
});

test("discover names a removed skill that still blocks --update-lock and clears once nothing asks for it", async t => {
  const { discoverCommand } = await import("../src/commands/discover.js");
  const base = await fs.mkdtemp(path.join(os.tmpdir(), "askills-removed-"));
  const registry = path.join(base, "registry");
  const root = path.join(base, "project");
  await fs.cp(fileURLToPath(new URL("./fixtures/registry", import.meta.url)), registry, {recursive:true});
  const saved = { ...process.env };
  const cwd = process.cwd();
  const fetch = globalThis.fetch;
  process.env.ASKILLS_HOME = path.join(base, "home");
  process.env.ASKILLS_REGISTRY_PATH = registry;
  globalThis.fetch = async () => new Response("", {status: 503});
  t.after(async () => {
    process.chdir(cwd);
    globalThis.fetch = fetch;
    for (const key of ["ASKILLS_HOME", "ASKILLS_REGISTRY_PATH"]) {
      if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key];
    }
    await fs.rm(base, {recursive:true,force:true});
  });
  const git = (...args: string[]) => runGitOutput(["-C", registry, ...args]);
  const commit = async () => {
    await git("add", "-A");
    await git("-c","user.name=Fixture","-c","user.email=fixture@example.test","-c","commit.gpgsign=false","commit","-qm","fixture");
  };
  await fs.mkdir(path.join(root, "src"), {recursive:true});
  const profile = path.join(registry, "profiles/min.yaml");
  await fs.writeFile(profile, "name: min\npool: [global/systematic-debugging]\n");
  const config = path.join(root, ".agent-skills.yaml");
  await fs.writeFile(config, "profile: min\nskills:\n  pool: [global/tdd]\n");
  await git("init","-q");
  await commit();
  await bootstrapCommand({root, updateLock:true});
  await fs.rename(path.join(registry, "skills/global/tdd"), path.join(registry, "retired"));
  await commit();
  async function report() {
    const lines: string[] = [];
    const log = console.log, warn = console.warn;
    console.log = (...args) => { lines.push(args.join(" ")); };
    console.warn = () => {};
    try { process.chdir(root); await discoverCommand(); }
    finally { console.log = log; console.warn = warn; process.chdir(cwd); }
    return lines.join("\n");
  }
  const blocked = await report();
  assert.match(blocked, /default:global\/tdd — synced registry directory removed/);
  assert.match(blocked, /cannot be adopted yet: \.agent-skills\.yaml skills\.pool references global\/tdd/);
  assert.doesNotMatch(blocked, /To adopt the synced registry/);
  // The project drops its reference, so the removal no longer blocks adopting the new snapshot.
  await fs.writeFile(config, "profile: min\n");
  assert.doesNotMatch(await report(), /cannot be adopted yet|global\/tdd/);
  await bootstrapCommand({root, updateLock:true});
  await resolveTask("debug", root);
});
