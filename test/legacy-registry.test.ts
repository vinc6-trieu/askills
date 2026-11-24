import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { bootstrapCommand } from "../src/commands/bootstrap.js";
import { runGitOutput } from "../src/core/git.js";
import { loadProjectLock } from "../src/core/project-lock.js";
import { installRegistry, syncRegistries } from "../src/core/registry-config.js";
import { resolveTask } from "../src/core/task-routing.js";

const fixture = fileURLToPath(new URL("./fixtures/registry", import.meta.url));

async function repository(target: string) {
  await fs.cp(fixture, target, { recursive: true });
  await runGitOutput(["-C", target, "init", "-q"]);
  await commit(target);
}

async function commit(target: string) {
  await runGitOutput(["-C", target, "add", "-A"]);
  await runGitOutput(["-C", target, "-c", "user.name=Fixture", "-c", "user.email=fixture@example.test",
    "-c", "commit.gpgsign=false", "commit", "-qm", "fixture"]);
  return runGitOutput(["-C", target, "rev-parse", "HEAD"]);
}

test("a registry in the legacy ASKILLS_HOME/registry checkout bootstraps, resolves and syncs", async t => {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), "askills-legacy-"));
  const home = path.join(base, "home");
  const upstream = path.join(base, "upstream");
  const root = path.join(base, "project");
  const saved = { ...process.env };
  t.after(async () => {
    for (const key of ["ASKILLS_HOME", "ASKILLS_REGISTRY_PATH"]) {
      if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key];
    }
    await fs.rm(base, { recursive: true, force: true });
  });
  process.env.ASKILLS_HOME = home;
  delete process.env.ASKILLS_REGISTRY_PATH;

  // The original layout: one checkout at ASKILLS_HOME/registry and no config.yaml.
  await repository(upstream);
  await fs.mkdir(home);
  await runGitOutput(["clone", "-q", upstream, path.join(home, "registry")]);
  await fs.mkdir(root);
  await fs.writeFile(path.join(root, ".agent-skills.yaml"), "profile: coding\n");

  await resolveTask("debug a failing test", root);
  await bootstrapCommand({ root, updateLock: true });
  const first = await runGitOutput(["-C", upstream, "rev-parse", "HEAD"]);
  assert.deepEqual((await loadProjectLock(root))?.registries, [{ name: "default", url: upstream, commit: first }]);
  await resolveTask("debug a failing test", root);

  // sync pulls the legacy checkout instead of a missing registries/default.
  await fs.writeFile(path.join(upstream, "NOTES.md"), "second\n");
  const second = await commit(upstream);
  assert.deepEqual(await syncRegistries(), [{ name: "default", commit: second }]);

  // Adding a second registry writes config.yaml; the legacy default stays where it is.
  const extra = path.join(base, "extra");
  await repository(extra);
  await installRegistry({ name: "extra", url: extra });
  await bootstrapCommand({ root, updateLock: true });
  assert.deepEqual((await loadProjectLock(root))?.registries.map(item => [item.name, item.commit]),
    [["default", second], ["extra", await runGitOutput(["-C", extra, "rev-parse", "HEAD"])]]);
  await resolveTask("debug a failing test", root);
});
