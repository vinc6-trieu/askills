import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

process.env.ASKILLS_REGISTRY_PATH = path.join(
  here,
  "fixtures",
  "registry"
);

const { resolveSkills } = await import(
  "../src/core/skill-resolver.js"
);

const rustRepo = path.join(
  here,
  "fixtures",
  "repos",
  "rust-axum"
);

const tsRepo = path.join(
  here,
  "fixtures",
  "repos",
  "ts-node"
);

test("a matching language signal selects the language skill", async () => {
  const result = await resolveSkills(
    "refactor the request handler",
    "coding",
    rustRepo
  );

  assert.ok(
    result.selected.map(s => s.id).includes("languages/rust")
  );
});

test("forced include bypasses the score threshold", async () => {
  const result = await resolveSkills(
    "write the project documentation",
    "coding",
    tsRepo,
    {
      include: ["domains/event-driven"]
    }
  );

  const forced = result.selected.find(
    s => s.id === "domains/event-driven"
  );

  assert.ok(forced, "forced include should be selected");
  assert.ok(
    forced.reasons.some(r => r.includes("forced"))
  );
});

test("exclude drops an always skill", async () => {
  const result = await resolveSkills(
    "anything at all",
    "coding",
    tsRepo,
    {
      exclude: ["global/systematic-debugging"]
    }
  );

  assert.ok(
    !result.always.includes("global/systematic-debugging")
  );
});

test("auto:false skills are never auto-selected", async () => {
  const result = await resolveSkills(
    "some meta task",
    "coding",
    tsRepo
  );

  assert.ok(
    !result.selected.map(s => s.id).includes("meta/noauto")
  );

  const candidate = result.candidates.find(
    c => c.id === "meta/noauto"
  );

  assert.equal(candidate?.rejection, "auto: false");
});

test("candidates carry a rejection reason", async () => {
  const result = await resolveSkills(
    "refactor the request handler",
    "coding",
    rustRepo
  );

  const evd = result.candidates.find(
    c => c.id === "domains/event-driven"
  );

  assert.ok(evd);
  assert.equal(evd.selected, undefined);
  assert.ok(evd.rejection && evd.rejection.length > 0);
});

test("selection is deterministic", async () => {
  const task = "add tests and fix the panic bug";

  const a = await resolveSkills(task, "coding", rustRepo);
  const b = await resolveSkills(task, "coding", rustRepo);

  assert.deepEqual(
    a.selected.map(s => s.id),
    b.selected.map(s => s.id)
  );
});
