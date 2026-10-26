import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";
import { evaluate, fixtureRegistry, loadCases } from "../eval/harness.js";
import { resolveSkills } from "../src/core/skill-resolver.js";
import { RegistryContext } from "../src/core/registry-context.js";

test("routing evaluation: Unicode, ranking, workflow floors, and legacy config", async () => {
  const fixture = await fixtureRegistry();
  try {
    const results = await evaluate(await loadCases(), fixture.root);
    assert.deepEqual(results.filter(r => !r.pass), []);
  } finally { await fixture.cleanup(); }
});

test("merged profiles share the stricter budget; floors and forced skills respect their contracts", async () => {
  const fixture = await fixtureRegistry();
  try {
    const context = new RegistryContext([{ name: "default", root: fixture.root }]);
    const profileFile = path.join(fixture.root, "profiles/small.yaml");
    await fs.writeFile(profileFile, YAML.stringify({ name: "small", policy: { max_auto_skills: 1 } }));
    const one = await resolveSkills("bug test schema query index", ["workflow", "small"], fixture.root, {}, context);
    assert.equal(one.selected.length, 1);
    assert.equal(one.selected[0]?.id, "default:global/tdd");
    const explicit = await resolveSkills("bug test schema query index frameworks/target", ["workflow", "small"], fixture.root, {}, context);
    assert.deepEqual(explicit.selected.map(s => s.id), ["default:frameworks/target"]);
    await fs.writeFile(profileFile, YAML.stringify({ name: "small", policy: { max_auto_skills: 0 } }));
    const zero = await resolveSkills("bug test", ["workflow", "small"], fixture.root, {
      include: ["global/debugging"], skills: ["global/tdd"]
    }, context);
    assert.deepEqual(zero.selected.map(s => s.id), ["default:global/debugging", "default:global/tdd"]);
    await fs.writeFile(profileFile, YAML.stringify({ name: "small", policy: { max_auto_skills: -1 } }));
    await assert.rejects(resolveSkills("bug", "small", fixture.root, {}, context), /Invalid max_auto_skills/);
  } finally { await fixture.cleanup(); }
});
