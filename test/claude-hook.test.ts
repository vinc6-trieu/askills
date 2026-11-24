import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { runClaudePromptHook } from "../src/commands/claude-hook.js";
import { configureClaudeHook } from "../src/core/claude-hook-settings.js";

const fixture = fileURLToPath(new URL("./fixtures/registry", import.meta.url));
const cli = fileURLToPath(new URL("../dist/cli.js", import.meta.url));

test("native prompts use mentioned file scopes and only suggest installed project skills", async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "askills-hook-project-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const registry = path.join(root, "registry");
  await fs.cp(fixture, registry, { recursive: true });
  const original = process.env.ASKILLS_REGISTRY_PATH;
  process.env.ASKILLS_REGISTRY_PATH = registry;
  t.after(() => {
    if (original === undefined) delete process.env.ASKILLS_REGISTRY_PATH;
    else process.env.ASKILLS_REGISTRY_PATH = original;
  });
  await fs.writeFile(path.join(registry, "profiles/base.yaml"), "name: base\npool: []\n");
  await fs.writeFile(path.join(root, ".agent-skills.yaml"),
    "profile: base\nrouting:\n  paths:\n    - path: api\n      profile: coding\n");
  const native = path.join(root, ".claude/skills");
  await fs.mkdir(native, { recursive: true });
  await fs.symlink(path.join(registry, "skills/global/tdd"), path.join(native, "tdd"), "junction");
  await fs.mkdir(path.join(root, "api"));
  await fs.writeFile(path.join(root, "api/feature test.ts"), "");
  const prompt = 'use tdd @"api/feature test.ts"';
  const run = (message: string, cwd = root) => runClaudePromptHook(JSON.stringify({
    hook_event_name: "UserPromptSubmit", cwd, prompt: message
  }));
  const suggestion = await run(prompt);
  assert.equal(suggestion?.hookSpecificOutput.hookEventName, "UserPromptSubmit");
  assert.match(suggestion!.hookSpecificOutput.additionalContext, /\/tdd\b/);
  assert.match(suggestion!.systemMessage, /\/tdd\b/);
  assert.equal(await run("use tdd"), undefined);
  assert.equal(await run("thanks"), undefined);
  assert.equal(await run('/tdd @"api/feature test.ts"'), undefined);
  assert.ok(await run('use tdd @"feature test.ts"#L1', path.join(root, "api")));
  await fs.unlink(path.join(native, "tdd"));
  assert.equal(await run(prompt), undefined);
  await fs.symlink(path.join(registry, "skills/meta/noauto"), path.join(native, "tdd"), "junction");
  assert.equal(await run(prompt), undefined);
  await fs.writeFile(path.join(root, ".agent-skills.yaml"),
    "profile: coding\nskills:\n  exclude: [global/tdd]\n");
  await fs.unlink(path.join(native, "tdd"));
  await fs.symlink(path.join(registry, "skills/global/tdd"), path.join(native, "tdd"), "junction");
  assert.equal(await run("use tdd"), undefined);
  await fs.rename(registry, registry + "-moved");
  assert.equal(await run(prompt), undefined);
  await fs.rename(registry + "-moved", registry);
  assert.equal(await runClaudePromptHook("invalid input"), undefined);
  assert.deepEqual((await fs.readdir(root)).sort(), [".agent-skills.yaml", ".claude", "api", "registry"]);
});

test("clarification hints respect user intent, prior decisions and the project pool", async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "askills-clarification-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const previous = process.env.ASKILLS_REGISTRY_PATH;
  process.env.ASKILLS_REGISTRY_PATH = fixture;
  t.after(() => {
    if (previous === undefined) delete process.env.ASKILLS_REGISTRY_PATH;
    else process.env.ASKILLS_REGISTRY_PATH = previous;
  });
  const id = "global/requirements-discovery";
  const config = path.join(root, ".agent-skills.yaml");
  const links = path.join(root, ".claude/skills");
  await fs.mkdir(links, { recursive: true });
  await fs.symlink(path.join(fixture, "skills", id), path.join(links, "requirements-discovery"), "junction");
  const run = (prompt: string) => runClaudePromptHook(JSON.stringify({ hook_event_name: "UserPromptSubmit", cwd: root, prompt }));
  const request = "LÀM RÕ YÊU CẦU về phân quyền trước nhé".normalize("NFD");
  await fs.writeFile(config, "profile: coding\n");
  assert.equal(await run(request), undefined);
  await fs.writeFile(config, `profile: coding\nskills:\n  pool: [${id}]\n`);
  const explicit = await run(request);
  assert.match(explicit?.systemMessage ?? "", /\/requirements-discovery\b/);
  for (const prompt of ["Add retries when the worker fails.", "Xử lý bản ghi trùng khi đồng bộ khách hàng."]) {
    const hint = await run(prompt);
    assert.equal(hint?.systemMessage, undefined, prompt);
    assert.match(hint?.hookSpecificOutput.additionalContext ?? "", /\/requirements-discovery\b/, prompt);
    assert.match(hint!.hookSpecificOutput.additionalContext, /conversation/, prompt);
  }
  for (const prompt of [
    "Giải thích tại sao cần thêm retry khi worker lỗi.",
    "Add retries only on timeout, at most twice.",
    "Xử lý bản ghi trùng khi đồng bộ bằng cách giữ bản cũ.",
    "Đừng hỏi lại, thêm retry khi worker lỗi.",
    "Đừng dùng requirements-discovery cho việc này.",
    "The requirements are final. Implement them.",
    "Không cần làm rõ yêu cầu."
  ]) assert.equal(await run(prompt), undefined, prompt);
  await fs.writeFile(config, `profile: coding\nskills:\n  pool: [${id}]\n  exclude: [${id}]\n`);
  assert.equal(await run(request), undefined);
  await fs.writeFile(config, `profile: coding\nskills:\n  include: [${id}]\n`);
  assert.match((await run("The requirements are final."))?.systemMessage ?? "", /\/requirements-discovery\b/);
});

test("enable and disable are idempotent and preserve unrelated Claude settings", async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "askills-hook-settings-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.mkdir(path.join(root, ".claude"));
  const file = path.join(root, ".claude/settings.local.json");
  const other = { hooks: [{ type: "command", command: "custom-check" }] };
  const settings = { permissions: { allow: [] }, hooks: { UserPromptSubmit: [other], Stop: [other] } };
  await fs.writeFile(file, JSON.stringify(settings));
  await configureClaudeHook(root, true, cli);
  const enabled = await fs.readFile(file, "utf8");
  const configured = JSON.parse(enabled);
  assert.deepEqual(configured.hooks.Stop, [other]);
  assert.deepEqual(configured.hooks.UserPromptSubmit[0], other);
  assert.equal(configured.hooks.UserPromptSubmit.length, 2);
  const hook = configured.hooks.UserPromptSubmit[1].hooks[0];
  assert.equal(hook.command, process.execPath);
  assert.deepEqual(hook.args.slice(0, 2), [cli, "claude-hook"]);
  await configureClaudeHook(root, true, cli);
  assert.equal(await fs.readFile(file, "utf8"), enabled);
  await configureClaudeHook(root, false, cli);
  await configureClaudeHook(root, false, cli);
  assert.deepEqual(JSON.parse(await fs.readFile(file, "utf8")), settings);
  await fs.writeFile(file, "{invalid");
  await assert.rejects(configureClaudeHook(root, true, cli));
  assert.equal(await fs.readFile(file, "utf8"), "{invalid");
});
