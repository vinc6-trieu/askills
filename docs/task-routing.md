# Task routing contract

`resolve`, `codex`, `claude`, and `run` share one read-only routing entry point.
The launcher uses the same result for both adapters, then materializes the
selected skills from the project's locked registry snapshot.

## Selection order

For automatic selection, the score threshold remains 15. Ties use priority,
then canonical skill ID. Only eligible candidates participate (`auto: false`
and `meta` skills still require a forced include or `--skill`).

1. Skills named in the task get first use of the automatic budget. A name in
   prose must be in the candidate pool; use `--skill` for a skill outside it.
2. Reserve at most one `process` and one `quality` slot, if that group has no
   selected skill and a candidate matches an intent or keyword in the task.
   Repository signals alone do not earn a reservation. TDD is `quality` in
   the evaluated registry. If capacity is insufficient, higher score wins.
3. Fill by descending score with soft ceilings: process 2, domain 2,
   language 1, framework 2, quality 1.
4. If slots remain, fill from the remaining eligible candidates by score,
   allowing the soft ceilings to be exceeded. Never fill with a candidate
   below the score threshold.
5. Ensure legacy `include` and invocation `--skill` entries are present,
   even if doing so exceeds the automatic budget. `always` is also outside
   that budget. Explicit CLI requirements conflicting with `exclude` fail
   with a clear error; for legacy `include`, `exclude` continues to win.

`max_auto_skills` is a maximum, not a target. With several profiles, their
always/pool entries are deduplicated and the smallest `max_auto_skills`
applies to the combined automatic set. Profile budgets are not added.
Name matches in prose remain heuristic; use a registry-qualified `--skill`
to unambiguously select a particular source.

## Unicode and vocabulary

Matching normalizes both task and metadata to NFC, lowercase, and single
whitespace. Tokenization preserves Unicode letters, combining marks and
numbers. Phrases use Unicode letter/mark/number/underscore boundaries,
not JavaScript's ASCII-oriented `\b`. Tests cover accented word boundaries,
multi-syllable Vietnamese phrases, decomposed accents, and line breaks.

This is matching, not translation. A Vietnamese task requires corresponding
Vietnamese intents/keywords in metadata. No automatic translation, LLM
classification, or negation rules are introduced. English plural folding
remains a lightweight heuristic.

## Invocation overrides

```bash
askills codex "Fix the timeout and add regression tests" \
  --profile backend-typescript --path apps/api \
  --skill global/systematic-debugging --dry-run

askills claude "Review API and UI changes" \
  --path apps/api --path apps/web --skill global/code-review

askills run codex "Review the handler" \
  --path apps/api/src/handler.ts --skill global/code-review

askills resolve "Review the handler" --path apps/api --verbose
```

`--path` and `--skill` are repeatable; `--profile` overrides path mappings for
this invocation. The configured project profile is not rewritten. Paths
are concrete files/directories relative to the project root (the current
working directory), not globs. Future files are allowed: repository signals
come from the enclosing package. Existing directory targets include their
bounded subproject scan. Paths outside the project, including symlink
escapes, are rejected. Paths are not inferred from free-form task prose or
from Git changes.

`resolve` and `--dry-run` do not initialize projects, write locks, refresh
caches, change guides, or create symlinks. An uninitialized preview detects
the default profile unless `--profile` is given. Existing locks are honored.
An unlocked preview sees the registry working tree; an actual run creates
a lock and uses committed snapshots, so uncommitted registry edits can make
that preview differ. Actual launches retain normal initialization/bootstrap
behavior and refresh generated artifacts, including any invocation-only
skills needed for native discovery.

## Project config and migration

Version 1 remains supported. There is **no implicit migration** of `include`
and no config rewrite on `sync`, `resolve`, `bootstrap`, or an existing
project's agent launch.

```yaml
version: 1
profile: coding
skills:
  pool:
    - domains/database
  include: []
  exclude: []
routing:
  paths:
    - path: apps/api
      profile: backend-typescript
    - path: apps/web
      profile: frontend-nextjs
```

- `pool` adds optional candidates to whichever profiles the task selects.
- `include` keeps its previous forced-selection semantics.
- `askills add <id>` keeps its previous forced-include behavior.
- `askills add <id> --pool` explicitly moves that skill from legacy `include`
  to `pool` and removes its exclusion. Qualified/unqualified aliases are
  resolved before moving it; unrelated include entries remain forced.
- To undo that move, use `askills add <id>`. Forced include wins even if
  the skill is also in `pool`.
- `askills remove <id>` removes explicit pool/include entries and excludes
  the skill, including profile-provided and always skills.

For example, migrate only one chosen entry, then inspect the result:

```bash
askills add domains/database --pool
askills resolve "Review SQL query performance" --verbose
askills bootstrap
```

## Path mappings

Mapping paths are relative directory prefixes, not glob patterns. For
`apps/api/src/handler.ts`, `apps/api` wins over `apps`; `apps/api` does not
match `apps/api-other`. Duplicate normalized prefixes and invalid paths
fail validation. A `.` prefix can explicitly map the whole project.

For each target, use its longest containing prefix, or the default profile
if no mapping contains it. A directory target also includes all configured
routes beneath it. Multiple targets union the selected profiles in stable
order. Without `--path`, use only the configured default profile. An
explicit `--profile` bypasses the mappings but keeps path-scoped signals.

Bootstrap exposes the default and all configured route profiles for native
discovery; a launch selects from only its effective profiles plus the
project pool/includes and invocation requirements. Native discovery is
not an exclusive allowlist: agents may discover additional relevant skills.

## Evaluation and evidence

```bash
npm test
npm run build
npm run eval
npm run eval -- --registry /path/to/registry
npm run eval -- --registry /path/to/registry --scoped
```

The evaluator checks declared required and forbidden skills and budgets.
It prints all failures, including diagnostic cases, and exits nonzero on
required-case failures. `--report-only` prints failures without failing the
command. These assertions are not a full precision/recall benchmark.

Before changing the resolver, results were recorded in
`eval/baseline-fixture.json` and `eval/baseline-registry.json`:

| Suite | Baseline | After changes |
| --- | --- | --- |
| Synthetic metadata, 12 required cases | 6/12 | 12/12 |
| Installed registry metadata, 6 required cases | 3/6 | 6/6 |
| Installed registry metadata, 3 diagnostic cases | 0/3 | 0/3 |
| Installed registry metadata, 3 new path cases | Not measured | 3/3 |

The real registry was read locally without updating it. Its commit and
metadata fingerprint are recorded in the results; the before/after
fingerprints match. Task repositories are controlled fixtures in both
suites, not production projects. The three diagnostic failures are missing
Vietnamese vocabulary in the registry, over-selection of stack skills for
documentation-only tasks, and negated testing/debugging requests. The
soft-cap pass can add further stack-only matches; no precision improvement
is claimed for those diagnostic cases.

Integration tests launch stub `codex`/`claude` executables and inspect args,
native skill links, active selections, config preservation, and path routing.
They prove transport/preparation, not model compliance. Routing runs once
at launch; new tasks inside an interactive agent session are not re-routed.

An additional live smoke test on 2026-10-26 used Codex CLI 0.163.0 and Claude
Code 2.1.309, with temporary projects and read-only proof-marker skills.
Both returned the selected skill's random marker, absent from the task
prompt, without returning the other skill's marker or modifying project
config. Test-only wrappers restricted tools/sandbox and disabled session
persistence. This proves skill consumption for those two simple tasks,
not general compliance. See `eval/live-smoke-result.json` for results,
execution conditions, and remaining diagnostic failures.
