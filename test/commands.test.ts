import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const registry = path.join(here, "fixtures", "registry");

const {
  addCommand,
  doctorCommand,
  listCommand,
  openCommand,
  removeCommand,
  searchCommand
} = await import("../src/commands/skills.js");

async function capture(action: () => Promise<void>): Promise<string> {
  const original = console.log;
  const output: string[] = [];
  console.log = (...values: unknown[]) => { output.push(values.join(" ")); };

  try {
    await action();
    return output.join("\n");
  } finally {
    console.log = original;
  }
}

test("skill management commands use canonical references", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "askills-project-"));
  const previousCwd = process.cwd();
  const previousRegistry = process.env.ASKILLS_REGISTRY_PATH;
  process.chdir(root);
  process.env.ASKILLS_REGISTRY_PATH = registry;

  try {
    await fs.writeFile(
      ".agent-skills.yaml",
      "version: 1\nprofile: coding\nskills:\n  include: []\n  exclude: []\n",
      "utf8"
    );

    assert.match(await capture(listCommand), /default:global\/tdd/);
    assert.match(await capture(() => searchCommand("event")), /default:domains\/event-driven/);
    assert.match(await capture(() => openCommand("global/tdd", { path: true })), /SKILL\.md/);
    assert.match(await capture(doctorCommand), /Registry configuration is valid/);

    await addCommand("domains/event-driven");
    assert.match(
      await fs.readFile(".agent-skills.yaml", "utf8"),
      /default:domains\/event-driven/
    );

    await removeCommand("domains/event-driven");
    const config = await fs.readFile(".agent-skills.yaml", "utf8");
    assert.match(config, /exclude:/);
    assert.match(config, /default:domains\/event-driven/);
  } finally {
    process.chdir(previousCwd);
    if (previousRegistry === undefined) {
      delete process.env.ASKILLS_REGISTRY_PATH;
    } else {
      process.env.ASKILLS_REGISTRY_PATH = previousRegistry;
    }
  }
});
