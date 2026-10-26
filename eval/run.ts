import { parseArgs } from "node:util";
import { evaluate, fixtureRegistry, loadCases, registryFingerprint } from "./harness.js";

const { values } = parseArgs({ options: {
  registry: { type: "string" },
  scoped: { type: "boolean", default: false },
  "report-only": { type: "boolean", default: false }
} });
if (values.scoped && !values.registry) throw new Error("--scoped requires --registry <path>");
const fixture = values.registry ? undefined : await fixtureRegistry();
try {
  const registry = values.registry ?? fixture!.root;
  const cases = await loadCases(Boolean(values.registry), values.scoped);
  const results = await evaluate(cases, registry);
  const required = results.filter(r => !r.diagnostic);
  console.log(JSON.stringify({
    suite: values.scoped ? "real-registry-scopes" : values.registry ? "real-registry" : "fixture",
    registryFingerprint: await registryFingerprint(registry),
    total: results.length,
    passed: results.filter(r => r.pass).length,
    required: { total: required.length, passed: required.filter(r => r.pass).length },
    results
  }, null, 2));
  if (!values["report-only"] && required.some(r => !r.pass)) process.exitCode = 1;
} finally { await fixture?.cleanup(); }
