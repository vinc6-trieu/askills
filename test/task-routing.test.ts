import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";
import YAML from "yaml";
import { resolveTask } from "../src/core/task-routing.js";
import { RegistryContext } from "../src/core/registry-context.js";
import type { ProjectConfig } from "../src/core/project-config.js";

const execFile = promisify(execFileCallback);
const tsx = import.meta.resolve("tsx");
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const registry = path.join(repo, "test/fixtures/registry");
const context = new RegistryContext([{ name: "default", root: registry }]);

async function project(config: ProjectConfig, action: (root: string) => Promise<void>) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "askills-routing-"));
  try {
    await fs.writeFile(path.join(root, ".agent-skills.yaml"), YAML.stringify(config));
    await action(root);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
}

test("project pool is optional; include stays forced; explicit skills can come from outside the profile", async () => {
  await project({ version: 1, profile: "backend-python", skills: { pool: ["domains/event-driven"], include: ["meta/noauto"] } }, async root => {
    const ordinary = await resolveTask("hello", root, {}, context);
    assert.ok(!ordinary.resolution.selected.some(s => s.id.endsWith("domains/event-driven")));
    assert.ok(ordinary.resolution.selected.some(s => s.id.endsWith("meta/noauto")));
    const explicit = await resolveTask("hello", root, { skills: ["domains/event-driven"] }, context);
    assert.ok(explicit.resolution.selected.some(s => s.id.endsWith("domains/event-driven")));
  });
});

test("excluded skill cannot silently satisfy an explicit --skill", async () => {
  await project({ version: 1, profile: "coding", skills: { exclude: ["global/tdd"] } }, async root => {
    await assert.rejects(resolveTask("test", root, { skills: ["default:global/tdd"] }, context), /excluded/);
  });
});

test("--profile is invocation-only and --path scopes repository signals", async () => {
  await project({ version: 1, profile: "coding" }, async root => {
    await fs.cp(path.join(repo, "test/fixtures/repos/monorepo"), root, { recursive: true });
    const before = await fs.readFile(path.join(root, ".agent-skills.yaml"), "utf8");
    const result = await resolveTask("fix", root, { profile: "frontend-nextjs", paths: ["apps/api/package.json"] }, context);
    assert.deepEqual(result.resolution.profiles, ["default:frontend-nextjs"]);
    assert.ok(result.resolution.repo.frameworks.includes("express"));
    assert.ok(!result.resolution.repo.frameworks.includes("nextjs"));
    assert.equal(await fs.readFile(path.join(root, ".agent-skills.yaml"), "utf8"), before);
  });
});

test("paths support future files but reject lexical and symlink escapes", async () => {
  await project({ version: 1, profile: "coding" }, async root => {
    await fs.mkdir(path.join(root, "api"));
    await fs.writeFile(path.join(root, "api/package.json"), '{"dependencies":{"express":"1"}}');
    const result = await resolveTask("fix", root, { paths: ["api/src/new.ts"] }, context);
    assert.ok(result.resolution.repo.frameworks.includes("express"));
    await assert.rejects(resolveTask("fix", root, { paths: ["../outside"] }, context), /outside/);
    await fs.symlink(path.dirname(root), path.join(root, "escape"));
    await assert.rejects(resolveTask("fix", root, { paths: ["escape/new.ts"] }, context), /outside/);
  });
});

test("all launch commands accept the same overrides and dry-run is read-only", async () => {
  await project({ version: 1, profile: "coding" }, async root => {
    await fs.cp(path.join(repo, "test/fixtures/repos/monorepo"), root, { recursive: true });
    const before = (await fs.readdir(root)).sort();
    const beforeConfig = await fs.readFile(path.join(root, ".agent-skills.yaml"), "utf8");
    for (const command of [["codex"], ["claude"], ["run", "codex"], ["run", "claude"], ["resolve"]]) {
      const { stdout } = await execFile(process.execPath, ["--import", tsx, path.join(repo, "src/cli.ts"), ...command,
        "hello", "--profile", "backend-python", "--path", "apps/api", "--skill", "meta/noauto",
        ...(command[0] === "resolve" ? [] : ["--dry-run"])
      ], { cwd: root, env: { ...process.env, ASKILLS_REGISTRY_PATH: registry } });
      assert.match(stdout, /backend-python/);
      assert.match(stdout, /noauto/);
      assert.deepEqual((await fs.readdir(root)).sort(), before);
      assert.equal(await fs.readFile(path.join(root, ".agent-skills.yaml"), "utf8"), beforeConfig);
    }
  });
});

test("an uninitialized dry-run does not write config, locks, or native skill directories", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "askills-preview-"));
  try {
    const { stdout } = await execFile(process.execPath, ["--import", tsx, path.join(repo, "src/cli.ts"),
      "codex", "hello", "--profile", "coding", "--dry-run"
    ], { cwd: root, env: { ...process.env, ASKILLS_REGISTRY_PATH: registry } });
    assert.match(stdout, /Invocation preview/);
    assert.deepEqual(await fs.readdir(root), []);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test("path routing uses the longest directory prefix, merges scopes, and allows an explicit override", async () => {
  await project({ version: 1, profile: "coding", routing: { paths: [
    { path: "apps", profile: "coding" },
    { path: "apps/api", profile: "backend-python" },
    { path: "apps/web", profile: "frontend-nextjs" }
  ] } }, async root => {
    await fs.cp(path.join(repo, "test/fixtures/repos/monorepo"), root, { recursive: true });
    const api = await resolveTask("fix", root, { paths: ["apps/api/src/new.ts"] }, context);
    assert.deepEqual(api.resolution.profiles, ["default:backend-python"]);
    const both = await resolveTask("fix", root, { paths: ["apps/web", "apps/api"] }, context);
    assert.deepEqual(both.resolution.profiles, ["default:backend-python", "default:frontend-nextjs"]);
    assert.ok(both.resolution.repo.frameworks.includes("express"));
    assert.ok(both.resolution.repo.frameworks.includes("nextjs"));
    const reversed = await resolveTask("fix", root, { paths: ["apps/api", "apps/web"] }, context);
    assert.deepEqual(both.resolution, reversed.resolution);
    const parent = await resolveTask("fix", root, { paths: ["apps"] }, context);
    assert.deepEqual(parent.resolution.profiles, ["default:backend-python", "default:coding", "default:frontend-nextjs"]);
    const override = await resolveTask("fix", root, { profile: "backend-rust", paths: ["apps/web"] }, context);
    assert.deepEqual(override.resolution.profiles, ["default:backend-rust"]);
    const fallback = await resolveTask("fix", root, { paths: ["README.md"] }, context);
    assert.deepEqual(fallback.resolution.profiles, ["default:coding"]);
    const noScope = await resolveTask("fix", root, {}, context);
    assert.deepEqual(noScope.resolution.profiles, ["default:coding"]);
  });
});

test("route prefixes are segment-aware and reject duplicate or escaping rules", async () => {
  await project({ version: 1, profile: "coding", routing: { paths: [
    { path: "apps/api", profile: "backend-python" }
  ] } }, async root => {
    const result = await resolveTask("fix", root, { paths: ["apps/api-other/new.ts"] }, context);
    assert.deepEqual(result.resolution.profiles, ["default:coding"]);
    for (const rules of [
      [{ path: "../api", profile: "coding" }],
      [{ path: "apps/**", profile: "coding" }],
      [{ path: "apps/api", profile: "coding" }, { path: "apps/api/", profile: "backend-python" }]
    ]) {
      await fs.writeFile(path.join(root, ".agent-skills.yaml"), YAML.stringify({ version: 1, profile: "coding", routing: { paths: rules } }));
      await assert.rejects(resolveTask("fix", root, {}, context), /Invalid routing/);
    }
  });
});

test("real launch preparation preserves config and delivers scoped selections to both adapters", async () => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "askills-launch-"));
  try {
    const source = path.join(home, "registry");
    await fs.cp(registry, source, { recursive: true });
    await execFile("git", ["init", source]);
    await execFile("git", ["-C", source, "add", "."]);
    await execFile("git", ["-C", source, "-c", "user.name=askills", "-c", "user.email=askills@example.test", "commit", "-m", "fixture"]);
    const bin = path.join(home, "bin");
    await fs.mkdir(bin);
    for (const agent of ["codex", "claude"]) {
      await fs.writeFile(path.join(bin, agent), '#!/usr/bin/env node\nrequire("node:fs").writeFileSync(process.env.ASKILLS_TEST_CAPTURE, JSON.stringify({args:process.argv.slice(2),cwd:process.cwd()}));\n', { mode: 0o755 });
    }
    await project({ version: 1, profile: "coding", skills: { pool: ["domains/event-driven"] },
      routing: { paths: [{ path: "apps/api", profile: "backend-python" }] }
    }, async root => {
      await fs.cp(path.join(repo, "test/fixtures/repos/monorepo"), root, { recursive: true });
      const config = await fs.readFile(path.join(root, ".agent-skills.yaml"), "utf8");
      const capture = path.join(home, "capture.json");
      for (const command of [["codex"], ["claude"], ["run", "codex"], ["run", "claude"]]) {
        await execFile(process.execPath, ["--import", tsx, path.join(repo, "src/cli.ts"), ...command,
          "hello", "--path", "apps/api", "--skill", "meta/noauto"
        ], { cwd: root, env: { ...process.env, ASKILLS_REGISTRY_PATH: source, ASKILLS_HOME: path.join(home, "cache-home"),
          PATH: `${bin}${path.delimiter}${process.env.PATH}`, ASKILLS_TEST_CAPTURE: capture } });
        const invocation = JSON.parse(await fs.readFile(capture, "utf8"));
        assert.equal(await fs.realpath(invocation.cwd), await fs.realpath(root));
        assert.match(invocation.args.join(" "), /backend-python/);
        assert.match(invocation.args.join(" "), /apps\/api/);
        assert.match(invocation.args.join(" "), /noauto/);
        const active = YAML.parse(await fs.readFile(path.join(root, ".askills/active.yaml"), "utf8"));
        assert.ok(active.skills.some((s: { id: string }) => s.id === "default:meta/noauto"));
        assert.equal(await fs.readFile(path.join(root, ".agent-skills.yaml"), "utf8"), config);
        assert.ok((await fs.lstat(path.join(root, ".claude/skills/noauto"))).isSymbolicLink());
        assert.ok((await fs.readdir(path.join(root, ".agents/skills"))).some(name => name.includes("meta--noauto")));
      }
    });
  } finally { await fs.rm(home, { recursive: true, force: true }); }
});
