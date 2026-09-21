import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);

const { RegistryContext, parseRegistryReference } = await import(
  "../src/core/registry-context.js"
);

const {
  ensureRegistrySnapshot,
  lockProjectRegistries,
  saveRegistryDefinitions
} = await import(
  "../src/core/registry-config.js"
);

const { loadProjectLock } = await import(
  "../src/core/project-lock.js"
);

async function registry(
  name: string,
  skills: string[]
): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), `askills-${name}-`));

  for (const id of skills) {
    const skillRoot = path.join(root, "skills", id);
    await fs.mkdir(skillRoot, { recursive: true });
    await fs.writeFile(
      path.join(skillRoot, "SKILL.md"),
      `---\nname: ${id.replaceAll("/", "-")}\ndescription: ${name} ${id}\n---\n`,
      "utf8"
    );
    await fs.writeFile(
      path.join(skillRoot, "skill.meta.yaml"),
      `id: ${id}\nkind: process\n`,
      "utf8"
    );
  }

  await fs.mkdir(path.join(root, "profiles"), { recursive: true });
  return root;
}

test("qualified references preserve the registry namespace", () => {
  assert.deepEqual(
    parseRegistryReference("team:global/tdd"),
    { registry: "team", id: "global/tdd" }
  );
  assert.deepEqual(
    parseRegistryReference("global/tdd"),
    { id: "global/tdd" }
  );
});

test("skill references cannot escape a registry root", async () => {
  const root = await registry("safe", ["global/tdd"]);
  const context = new RegistryContext([{ name: "safe", root }]);

  await assert.rejects(
    context.resolveSkill("safe:../../outside"),
    /Invalid skill ID/
  );
});

test("an unqualified skill uses the first matching registry", async () => {
  const preferred = await registry("preferred", ["global/tdd"]);
  const fallback = await registry("fallback", ["global/tdd", "domains/api"]);

  const context = new RegistryContext([
    { name: "preferred", root: preferred },
    { name: "fallback", root: fallback }
  ]);

  assert.deepEqual(
    await context.resolveSkill("global/tdd"),
    {
      registry: "preferred",
      id: "global/tdd",
      root: path.join(preferred, "skills", "global", "tdd"),
      reference: "preferred:global/tdd",
      shadowed: false
    }
  );

  assert.deepEqual(
    await context.resolveSkill("fallback:global/tdd"),
    {
      registry: "fallback",
      id: "global/tdd",
      root: path.join(fallback, "skills", "global", "tdd"),
      reference: "fallback:global/tdd",
      shadowed: false
    }
  );
});

test("listing retains shadowed skills as explicit qualified names", async () => {
  const preferred = await registry("preferred", ["global/tdd"]);
  const fallback = await registry("fallback", ["global/tdd", "domains/api"]);

  const context = new RegistryContext([
    { name: "preferred", root: preferred },
    { name: "fallback", root: fallback }
  ]);

  assert.deepEqual(
    (await context.listSkills()).map(skill => skill.reference),
    [
      "fallback:domains/api",
      "fallback:global/tdd",
      "preferred:global/tdd"
    ]
  );
});

test("a cached registry snapshot stays pinned to its commit", async () => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "askills-home-"));
  const source = path.join(home, "registries", "team");
  const project = path.join(home, "project");
  const previousHome = process.env.ASKILLS_HOME;
  const previousRegistry = process.env.ASKILLS_REGISTRY_PATH;
  process.env.ASKILLS_HOME = home;
  delete process.env.ASKILLS_REGISTRY_PATH;

  try {
    await fs.mkdir(path.join(source, "skills", "global", "tdd"), { recursive: true });
    await fs.mkdir(path.join(source, "profiles"), { recursive: true });
    await fs.writeFile(path.join(source, "skills", "global", "tdd", "SKILL.md"), "first\n");
    await execFile("git", ["init", source]);
    await execFile("git", ["-C", source, "add", "."]);
    await execFile("git", ["-C", source, "-c", "user.name=askills", "-c", "user.email=askills@example.test", "commit", "-m", "first"]);

    await saveRegistryDefinitions([{ name: "team", url: "local" }]);
    const snapshot = await ensureRegistrySnapshot({ name: "team", url: "local" });
    await fs.writeFile(path.join(source, "skills", "global", "tdd", "SKILL.md"), "changed\n");

    assert.equal(
      await fs.readFile(path.join(snapshot.root, "skills", "global", "tdd", "SKILL.md"), "utf8"),
      "first\n"
    );

    await fs.mkdir(project);
    await fs.writeFile(
      path.join(project, ".agent-skills.yaml"),
      "version: 1\nprofile: coding\nregistries:\n  - team\n",
      "utf8"
    );
    await lockProjectRegistries(project);

    assert.deepEqual(await loadProjectLock(project), {
      version: 1,
      registries: [{ name: "team", url: "local", commit: snapshot.commit }]
    });

    await execFile("git", ["-C", source, "add", "."]);
    await execFile("git", ["-C", source, "-c", "user.name=askills", "-c", "user.email=askills@example.test", "commit", "-m", "second"]);
    await lockProjectRegistries(project);

    assert.equal((await loadProjectLock(project))?.registries[0].commit, snapshot.commit);
    assert.notEqual(
      (await lockProjectRegistries(project, true)).registries[0].commit,
      snapshot.commit
    );
  } finally {
    if (previousHome === undefined) {
      delete process.env.ASKILLS_HOME;
    } else {
      process.env.ASKILLS_HOME = previousHome;
    }

    if (previousRegistry === undefined) {
      delete process.env.ASKILLS_REGISTRY_PATH;
    } else {
      process.env.ASKILLS_REGISTRY_PATH = previousRegistry;
    }
  }
});
