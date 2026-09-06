import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  detectRepository
} from "../src/core/repo-detector.js";

import {
  detectProfile
} from "../src/core/profile-detector.js";

const here = path.dirname(fileURLToPath(import.meta.url));

const repo = (name: string) =>
  path.join(here, "fixtures", "repos", name);

const registry = (name: string) =>
  path.join(here, "fixtures", name);

test("malformed package.json does not throw", async () => {
  const result = await detectRepository(repo("bad-json"));

  assert.ok(result.files.includes("package.json"));
  assert.ok(result.languages.includes("javascript"));
});

test("rust + axum are detected from Cargo.toml", async () => {
  const result = await detectRepository(repo("rust-axum"));

  assert.ok(result.languages.includes("rust"));
  assert.ok(result.frameworks.includes("axum"));
  assert.ok(result.frameworks.includes("tokio"));
});

test("typescript is detected from tsconfig + dependency", async () => {
  const result = await detectRepository(repo("ts-node"));

  assert.ok(result.languages.includes("typescript"));
  assert.ok(!result.languages.includes("javascript"));
});

test("cargo dependency parsing ignores comments and description", async () => {
  const result = await detectRepository(repo("rust-comment"));

  assert.ok(result.languages.includes("rust"));
  assert.ok(!result.frameworks.includes("axum"));
});

test("python project and framework are detected", async () => {
  const result = await detectRepository(repo("py-fastapi"));

  assert.ok(result.languages.includes("python"));
  assert.ok(result.frameworks.includes("fastapi"));
});

test("monorepo sub-projects are merged into one context", async () => {
  const result = await detectRepository(repo("monorepo"));

  assert.ok(result.languages.includes("typescript"));
  assert.ok(result.frameworks.includes("express"));
  assert.ok(result.frameworks.includes("nextjs"));
});

test("primaryLanguage follows the root manifest in a polyglot repo", async () => {
  const result = await detectRepository(repo("polyglot"));

  assert.equal(result.primaryLanguage, "rust");
  assert.ok(result.languages.includes("typescript"));
});

test("detectProfile returns a matched profile when the registry has it", async () => {
  process.env.ASKILLS_REGISTRY_PATH = registry("registry");

  assert.equal(
    await detectProfile(repo("rust-axum")),
    "backend-rust"
  );
});

test("detectProfile biases toward the primary language in a polyglot repo", async () => {
  process.env.ASKILLS_REGISTRY_PATH = registry("registry");

  assert.equal(
    await detectProfile(repo("polyglot")),
    "backend-rust"
  );
});

test("detectProfile picks a framework-specific profile in a monorepo", async () => {
  process.env.ASKILLS_REGISTRY_PATH = registry("registry");

  assert.equal(
    await detectProfile(repo("monorepo")),
    "frontend-nextjs"
  );
});

test("detectProfile falls back to coding when the profile is absent", async () => {
  process.env.ASKILLS_REGISTRY_PATH = registry("registry-min");

  assert.equal(
    await detectProfile(repo("rust-axum")),
    "coding"
  );
});
