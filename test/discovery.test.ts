import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { RegistryContext } from "../src/core/registry-context.js";
import { discoverSkills } from "../src/core/discovery.js";

const pin = "1".repeat(40);
const head = "2".repeat(40);
const repo = "example/agent-skills";
const blob = "3".repeat(40);

async function fixture(t: import("node:test").TestContext) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "askills-discovery-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const registry = path.join(root, "registry");
  const dir = path.join(registry, "skills", "global", "review");
  await fs.mkdir(dir, {recursive: true});
  await fs.mkdir(path.join(registry, "profiles"));
  await fs.writeFile(path.join(root, ".agent-skills.yaml"), "version: 1\nprofile: coding\n");
  await fs.writeFile(path.join(registry, "profiles/coding.yaml"), "name: coding\npool: [global/review]\n");
  await fs.writeFile(path.join(dir, "SKILL.md"), "---\nname: review\ndescription: Review code\n---\n");
  await fs.writeFile(path.join(dir, "UPSTREAM.json"), JSON.stringify({
    repository: "https://github.com/" + repo, commit: pin, sourcePath: "skills/review"
  }));
  return {root, context: new RegistryContext([{name: "default", root: registry}])};
}

function github(options: { changed?: boolean; missing?: boolean; searchFails?: boolean } = {}): typeof fetch {
  return async input => {
    const url = new URL(String(input));
    if (url.origin === "https://raw.githubusercontent.com") {
      assert.ok(url.pathname.startsWith(`/${repo}/${head}/`));
      if (url.pathname.endsWith("/review/SKILL.md")) return new Response("---\nname: review\ndescription: Review code\n---\nInspect proposed changes.");
      return new Response("---\nname: lint-typescript\ndescription: Lint TypeScript projects.\n---\nRun the project lint command and inspect each diagnostic.");
    }
    assert.equal(url.origin, "https://api.github.com");
    if (url.pathname === "/search/repositories") {
      if (options.searchFails) return new Response("", {status: 503});
      return Response.json({items: [{full_name: repo, stargazers_count: 800, license: {spdx_id: "MIT"}}]});
    }
    const endpoint = url.pathname.replace("/repos/" + repo, "");
    if (endpoint === "/commits/HEAD") return Response.json({sha: head});
    if (endpoint.startsWith("/git/trees/")) {
      const old = endpoint.endsWith(pin);
      assert.ok(old || endpoint.endsWith(head));
      const tree = [
        {path: "skills/lint-typescript/SKILL.md", type: "blob", mode: "100644", sha: blob},
        {path: "skills/lint-typescript", type: "tree", sha: "4".repeat(40)}
      ];
      if (old || !options.missing) tree.push(
        {path: "skills/review", type: "tree", sha: (!old && options.changed ? "a" : "b").repeat(40)},
        {path: "skills/review/SKILL.md", type: "blob", mode: "100644", sha: "c".repeat(40)}
      );
      return Response.json({sha: "d".repeat(40), truncated: false, tree});
    }
    throw Error("Unexpected request " + url);
  };
}

test("recommends a GitHub skill with evidence and reports only changed upstream directories", async t => {
  const {root, context} = await fixture(t);
  for (const changed of [false, true]) {
    const report = await discoverSkills(root, context, "typescript", github({changed}));
    assert.deepEqual(report.warnings, []);
    assert.deepEqual(report.suggestions.map(s => s.name), ["lint-typescript"]);
    assert.match(report.suggestions[0].url, new RegExp(head + "/skills/lint-typescript"));
    assert.equal(report.suggestions[0].stars, 800);
    assert.deepEqual(report.updates.map(u => [u.reference, u.status]), changed ? [["default:global/review","changed"]] : []);
  }
  assert.deepEqual((await fs.readdir(root)).sort(), [".agent-skills.yaml", "registry"]);
});

test("discovery reports incomplete search and a removed upstream path independently", async t => {
  const {root, context} = await fixture(t);
  const report = await discoverSkills(root, context, "", github({searchFails:true, missing:true}));
  assert.match(report.warnings.join(" "), /503/);
  assert.deepEqual(report.updates.map(u => u.status), ["removed"]);
});

test("only relevant registered skills are offered and excluded names stay suppressed", async t => {
  const {root, context} = await fixture(t);
  const globalDir = path.join(context.registries[0].root, "skills/global");
  for (const name of ["typescript-style", "database-only", "lint-typescript"]) {
    const dir = path.join(globalDir, name);
    await fs.mkdir(dir);
    await fs.writeFile(path.join(dir, "SKILL.md"), `---\nname: ${name}\ndescription: ${name} guidelines\n---\n`);
    await fs.writeFile(path.join(dir, "UPSTREAM.json"), JSON.stringify({
      repository: "https://github.com/other/skills", commit: pin, sourcePath: name
    }));
  }
  await fs.writeFile(path.join(root, "package.json"), '{"devDependencies":{"typescript":"5"}}');
  await fs.writeFile(path.join(root, "tsconfig.json"), "{}");
  await fs.appendFile(path.join(root, ".agent-skills.yaml"), "skills:\n  exclude: [global/lint-typescript]\n");
  const report = await discoverSkills(root, context, "", github());
  assert.deepEqual(report.suggestions.map(s => s.reference), ["default:global/typescript-style"]);
});

test("checks a project's pinned native skill against its synced registry, including supporting files", async t => {
  const { runGitOutput } = await import("../src/core/git.js");
  const { registrySkillChanges } = await import("../src/core/registry-updates.js");
  const {root, context} = await fixture(t);
  const source = context.registries[0].root;
  const git = (cwd: string, ...args: string[]) => runGitOutput(["-C", cwd, ...args]);
  const commit = () => git(source, "-c", "user.name=Fixture", "-c", "user.email=fixture@example.test",
    "-c", "commit.gpgsign=false", "commit", "-qm", "fixture");
  await git(source, "init", "-q");
  await git(source, "add", ".");
  await commit();
  const first = await git(source, "rev-parse", "HEAD");
  const cached = path.join(root, "pinned");
  await runGitOutput(["clone", "-q", source, cached]);
  const locked = new RegistryContext([{name: "default", root: cached, commit: first}]);
  await fs.writeFile(path.join(source, "README.md"), "unrelated");
  await git(source, "add", ".");
  await commit();
  const check = () => registrySkillChanges(locked, context, ["default:global/review"]);
  assert.deepEqual((await check()).updates, []);
  await fs.writeFile(path.join(source, "skills/global/review/example.md"), "revised");
  await git(source, "add", ".");
  await commit();
  const result = await check();
  assert.deepEqual(result.warnings, []);
  assert.deepEqual(result.updates.map(u => [u.reference, u.status]), [["default:global/review", "changed"]]);
});

test("sync checks GitHub after success, preserves its exit status offline and honors --no-discover", async t => {
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const { fileURLToPath } = await import("node:url");
  const { runGitOutput } = await import("../src/core/git.js");
  const exec = promisify(execFile);
  const { root, context } = await fixture(t);
  const source = context.registries[0].root;
  const cli = fileURLToPath(new URL("../src/cli.ts", import.meta.url));
  const loader = import.meta.resolve("tsx");
  const mock = path.join(root, "offline.mjs");
  await fs.writeFile(mock, 'globalThis.fetch = async () => new Response("", {status: 503});');
  await runGitOutput(["-C", source, "init", "-q"]);
  await runGitOutput(["-C", source, "add", "."]);
  await runGitOutput(["-C", source, "-c", "user.name=Fixture", "-c", "user.email=fixture@example.test",
    "-c", "commit.gpgsign=false", "commit", "-qm", "fixture"]);
  const run = (...args: string[]) => exec(process.execPath,
    ["--import", loader, "--import", mock, cli, ...args], {cwd: root, env: {
      ...process.env, ASKILLS_HOME: path.join(root, "home"), ASKILLS_REGISTRY_PATH: source
    }});
  const before = await fs.readFile(path.join(root, ".agent-skills.yaml"), "utf8");
  const normal = await run("sync");
  assert.match(normal.stdout, /Registries updated[\s\S]*GitHub skill suggestions/);
  assert.match(normal.stderr, /Discovery incomplete: .*503/);
  const skipped = await run("sync", "--no-discover");
  assert.doesNotMatch(skipped.stdout + skipped.stderr, /GitHub skill suggestions|Discovery incomplete/);
  assert.equal(await fs.readFile(path.join(root, ".agent-skills.yaml"), "utf8"), before);
  assert.ok(!(await fs.readdir(root)).includes(".agent-skills.lock.yaml"));
});

test("a candidate needs skill instructions and an explicit query matches the skill", async t => {
  const { root } = await fixture(t);
  const healthy = github();
  const withoutBody: typeof fetch = async (input, init) => {
    if (new URL(String(input)).hostname === "raw.githubusercontent.com") {
      return new Response("---\nname: empty\ndescription: TypeScript guide\n---\n");
    }
    return healthy(input, init);
  };
  const empty = await discoverSkills(root, undefined, "typescript", withoutBody);
  assert.deepEqual(empty.suggestions, []);
  const unrelated = await discoverSkills(root, undefined, "postgresql", healthy);
  assert.deepEqual(unrelated.suggestions, []);
  assert.deepEqual(unrelated.warnings, []);
});

test("discovery skips a publisher's private project workflow folders in public skill collections", async t => {
  const { root } = await fixture(t);
  const normal = github();
  const request: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    if (url.pathname.includes("/git/trees/")) return Response.json({
      truncated: false, tree: [
        {path: ".agents/skills/private-typescript/SKILL.md", type: "blob", mode: "100644", sha: blob}
      ]
    });
    return normal(input, init);
  };
  const report = await discoverSkills(root, undefined, "typescript", request);
  assert.deepEqual(report.suggestions, []);
});

test("exhausting GitHub search quota still allows upstream comparisons", async t => {
  const { root, context } = await fixture(t);
  const healthy = github({changed: true});
  const request: typeof fetch = (input, init) => new URL(String(input)).pathname === "/search/repositories"
    ? Promise.resolve(new Response("", {status: 403, headers: {"x-ratelimit-remaining":"0"}}))
    : healthy(input, init);
  const report = await discoverSkills(root, context, "", request);
  assert.deepEqual(report.updates.map(item => item.status), ["changed"]);
  assert.equal(report.checkedUpstreams, 1);
  assert.equal(report.warnings.length, 1);
  assert.match(report.warnings[0], /search rate limit/);
});
