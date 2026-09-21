import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("--version reports the package version", async () => {
  const manifest = JSON.parse(
    await fs.readFile(path.join(root, "package.json"), "utf8")
  ) as { version: string };

  const { stdout } = await execFile(
    process.execPath,
    ["--import", "tsx", "src/cli.ts", "--version"],
    { cwd: root }
  );

  assert.equal(stdout.trim(), manifest.version);
});
