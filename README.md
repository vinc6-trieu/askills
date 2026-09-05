# askills

Portable skill registry, resolver, and adapter layer for coding agents.

`askills` lets you keep reusable coding-agent skills in a central Git repository, attach them to projects through lightweight profiles, and expose the right skills to agents such as Codex without copying skill files into every codebase.

```text
central skill registry
        ↓
      askills
        ↓
project profile + repository signals
        ↓
candidate skill pool
        ↓
task resolver / native agent discovery
        ↓
Codex, Claude Code, and future coding agents
```

## Why askills?

Coding-agent skills are useful, but managing them across multiple projects and machines quickly becomes messy.

Without a shared layer, teams often end up with:

* duplicated `SKILL.md` files across repositories
* inconsistent versions of the same skill
* agent-specific directory structures
* huge prompt files containing unrelated instructions
* no reliable way to select the right skills for a task
* manual setup whenever working on another machine

`askills` keeps the actual skills in one Git-backed registry and gives each project only a small configuration file.

A project can therefore declare:

```yaml
version: 1

profile: backend-rust

skills:
  include: []
  exclude: []
```

while the actual skill content lives centrally.

---

## Core ideas

### Skills are not capabilities

A skill describes **how an agent should approach a task**.

Examples:

```text
systematic-debugging
tdd
database-migration
event-driven
rust
axum
```

External tools, APIs, MCP servers, databases, or cloud services provide capabilities.

`askills` deliberately keeps those concepts separate.

---

### Profiles define candidate pools

A profile does not activate every skill it contains.

Instead:

```text
profile
   ↓
candidate skill pool
   ↓
task resolver or agent-native routing
   ↓
relevant skills
```

Example:

```yaml
name: backend-rust

extends:
  - backend

always:
  - global/engineering-discipline

pool:
  - global/systematic-debugging
  - global/tdd
  - domains/backend-api
  - domains/database
  - domains/distributed-systems
  - languages/rust
  - frameworks/axum
  - frameworks/sqlx

policy:
  max_auto_skills: 6
```

---

### The registry is separate from the CLI

`askills` is the tool.

Your skill registry is just a Git repository.

```text
askills
  CLI / resolver / adapters

agent-skills
  SKILL.md files / profiles / metadata
```

The registry can be public or private.

For example:

```text
github.com/your-org/askills
github.com/your-org/agent-skills
```

Private registries work naturally with existing Git SSH authentication.

---

## Requirements

* Node.js 20+
* Git
* npm

For Codex integration:

* Codex CLI and/or the Codex VS Code extension

---

## Installation

During local development:

```bash
git clone git@github.com:vinc6-trieu/askills.git

cd askills

npm install
npm run build
npm link
```

Verify:

```bash
askills --help
```

Once the package is published to npm, installation can become:

```bash
npm install -g askills
```

---

# Quick start

## 1. Install a skill registry

This is a machine-level operation and normally only needs to be done once.

```bash
askills setup \
  --registry git@github.com:vinc6-trieu/agent-skills.git
```

The registry is cloned to:

```text
~/.askills/registry
```

Example:

```text
~/.askills/
└── registry/
    ├── skills/
    ├── profiles/
    └── registry/
```

---

## 2. Initialize a project

Enter a codebase:

```bash
cd my-project
```

Automatically detect an appropriate profile:

```bash
askills init --auto
```

Example generated configuration:

```yaml
version: 1

profile: backend-rust

skills:
  include: []
  exclude: []
```

This file should normally be committed:

```text
.agent-skills.yaml
```

---

## 3. Bootstrap the project

```bash
askills bootstrap
```

This prepares the project skill pool.

Generated files are stored under:

```text
.askills/
```

For Codex-native discovery, askills also exposes skills under:

```text
.agents/skills/
```

using symlinks to the central registry.

The skills themselves are not copied into the repository.

---

## 4. Resolve skills for a task

```bash
askills resolve \
  "Fix race condition in the enrollment worker and add a regression test"
```

Example result:

```text
Askills Resolver

Profile: backend-rust

Repository
  Languages: rust
  Frameworks: axum, sqlx

Always
  ✓ global/engineering-discipline

Selected skills
  ✓ global/systematic-debugging
  ✓ global/tdd
  ✓ domains/distributed-systems
  ✓ languages/rust
  ✓ global/verification-before-done
```

The resolver combines:

```text
task intent
+
task keywords
+
repository languages
+
framework signals
+
dependencies
+
skill priority
```

The goal is normally to select a small set of relevant skills rather than loading the whole registry.

---

# Codex integration

## Codex CLI

Run a task through askills:

```bash
askills codex \
  "Fix the enrollment worker race condition and add regression coverage"
```

askills will:

```text
read project config
      ↓
bootstrap candidate skills
      ↓
resolve relevant skills
      ↓
prepare active skill state
      ↓
launch Codex
```

Preview what would be selected without launching Codex:

```bash
askills codex \
  "Review the enrollment module for race conditions" \
  --dry-run
```

Run Codex non-interactively:

```bash
askills codex \
  "Fix the failing enrollment tests" \
  --exec
```

---

## Codex in VS Code

For interactive IDE usage, you usually do not need to run a resolver before every message.

Run:

```bash
askills bootstrap
```

Then open the repository:

```bash
code .
```

askills exposes the project's candidate skills as generated symlinks under:

```text
.agents/skills/
```

Example:

```text
.agents/skills/
├── askills--global--engineering-discipline
├── askills--global--systematic-debugging
├── askills--global--tdd
├── askills--domains--database
├── askills--languages--rust
└── askills--frameworks--axum
```

Each directory points back to the central registry.

Codex can then discover and use the skills during normal IDE conversations.

This keeps IDE chat flexible:

```text
review this API
↓
check the migration too
↓
fix the failing test
↓
look for possible race conditions
```

without locking the conversation to one pre-resolved task.

---

# Commands

## `askills setup`

Install the central registry on the current machine.

```bash
askills setup \
  --registry <git-url>
```

Example:

```bash
askills setup \
  --registry git@github.com:vinc6-trieu/agent-skills.git
```

---

## `askills sync`

Update the installed registry.

```bash
askills sync
```

Equivalent conceptually to updating:

```text
~/.askills/registry
```

from its Git remote.

---

## `askills init`

Create project configuration.

Automatic detection:

```bash
askills init --auto
```

Explicit profile:

```bash
askills init \
  --profile backend-rust
```

Regenerate an existing configuration:

```bash
askills init \
  --auto \
  --force
```

---

## `askills bootstrap`

Prepare the candidate skill pool for the project.

```bash
askills bootstrap
```

This reads:

```text
.agent-skills.yaml
```

and combines:

```text
profile always skills
+
profile pool
+
project includes
-
project excludes
```

---

## `askills resolve`

Resolve relevant skills for a task.

```bash
askills resolve \
  "Add a PostgreSQL migration and index for enrollment lookup"
```

Explicit profile:

```bash
askills resolve \
  "Debug failing worker" \
  --profile backend-rust
```

When `.agent-skills.yaml` exists, the project profile can be used automatically.

---

## `askills codex`

Resolve skills and launch Codex.

```bash
askills codex "<task>"
```

Options:

```text
--dry-run    Resolve and prepare skills without launching Codex
--exec       Run Codex non-interactively
```

---

# Project configuration

A project contains:

```text
.agent-skills.yaml
```

Example:

```yaml
version: 1

profile: backend-rust

skills:
  include:
    - domains/event-driven

  exclude:
    - global/prototyping
```

`include` adds skills outside the normal profile pool.

`exclude` removes inherited or profile-provided skills.

---

# Registry structure

A registry can look like:

```text
agent-skills/
├── skills/
│   ├── global/
│   ├── domains/
│   ├── languages/
│   ├── frameworks/
│   └── meta/
│
├── profiles/
│
└── registry/
    └── skills.yaml
```

Example skill:

```text
skills/
└── global/
    └── systematic-debugging/
        ├── SKILL.md
        └── skill.meta.yaml
```

---

## `SKILL.md`

`SKILL.md` stays portable and agent-friendly.

Example:

```markdown
---
name: systematic-debugging
description: Diagnose bugs, regressions, crashes, failing tests, and unexpected behavior using an evidence-first debugging workflow.
---

# Systematic Debugging

...
```

The frontmatter should contain only:

```text
name
description
```

Routing information belongs elsewhere.

---

## `skill.meta.yaml`

askills-specific metadata lives in:

```text
skill.meta.yaml
```

Example:

```yaml
id: global/systematic-debugging

kind: process

intents:
  - debug
  - bugfix
  - regression

keywords:
  - bug
  - error
  - failing
  - crash
  - panic
  - timeout

stages:
  - diagnose
  - implement
  - verify

priority: 90

auto: true
```

This keeps the skill portable while still giving the askills resolver structured routing data.

---

# Skill categories

A typical registry can organize skills into layers.

## Global process skills

```text
global/engineering-discipline
global/requirements-discovery
global/implementation-planning
global/repo-understanding
global/domain-modeling
global/tdd
global/systematic-debugging
global/verification-before-done
global/code-review
global/safe-refactoring
global/architecture-design
global/technical-research
```

## Domain skills

```text
domains/backend-api
domains/database
domains/database-migration
domains/distributed-systems
domains/event-driven
domains/caching
domains/authentication
domains/authorization
domains/security
domains/observability
domains/performance
```

## Language skills

```text
languages/rust
languages/typescript
languages/golang
languages/sql
languages/java
```

## Framework skills

```text
frameworks/axum
frameworks/sqlx
frameworks/nestjs
frameworks/react
frameworks/nextjs
frameworks/postgres
frameworks/redis
frameworks/kafka
```

---

# Resolver

The resolver is intentionally simple and deterministic.

It does not require embeddings or an LLM.

Example scoring signals include:

```text
explicit skill request
task intent
task keywords
repository language
repository framework
dependency signals
repository files
skill priority
```

Skills are also constrained by category limits so one class of skill does not dominate the selection.

Typical target:

```text
3–6 skills per meaningful task
```

This architecture keeps routing understandable and debuggable.

Routing quality should primarily improve through:

```text
skill.meta.yaml
```

instead of accumulating hard-coded special cases in the CLI.

---

# Repository detection

askills can detect common repository signals.

Examples:

```text
Cargo.toml
  → Rust

Cargo.toml + axum
  → Axum

Cargo.toml + sqlx
  → SQLx

package.json + TypeScript
  → TypeScript

@nestjs/core
  → NestJS

next
  → Next.js

react
  → React

go.mod
  → Go

pom.xml
  → Java
```

Detection is intentionally conservative.

---

# Files generated inside a project

askills may create:

```text
.agent-skills.yaml

.askills/
├── pool/
├── active/
├── active.yaml
└── state.yaml

.agents/
└── skills/
    ├── askills--global--tdd
    ├── askills--languages--rust
    └── ...
```

Recommended `.gitignore`:

```gitignore
.askills/
.agents/skills/askills--*
.agents/skills/askills-generated/
```

Do **not** ignore all of:

```text
.agents/skills/
```

because a repository may also contain project-owned skills that should be committed.

---

# Machine vs project state

Machine-level state:

```text
~/.askills/
└── registry/
```

Project-level configuration:

```text
.agent-skills.yaml
```

Generated project runtime:

```text
.askills/
.agents/skills/askills--*
```

This separation allows the same project configuration to work across multiple machines without committing the entire skill registry.

---

# Using askills on another machine

Install the CLI:

```bash
npm install -g askills
```

Install the registry once:

```bash
askills setup \
  --registry git@github.com:vinc6-trieu/agent-skills.git
```

Clone a project:

```bash
git clone <project-url>
cd <project>
```

If `.agent-skills.yaml` is already committed:

```bash
askills bootstrap
```

That is enough to recreate the local skill pool.

For a repository that has never used askills:

```bash
askills init --auto
askills bootstrap
```

---

# Public and private registries

The CLI does not require the registry itself to be public.

A useful organization is:

```text
askills
  public CLI

agent-skills
  public reusable engineering skills

company-agent-skills
  private organization or business knowledge
```

Private Git repositories can use normal SSH authentication.

Support for composing multiple registries is planned.

---

# Development

Clone:

```bash
git clone git@github.com:vinc6-trieu/askills.git

cd askills
```

Install dependencies:

```bash
npm install
```

Build:

```bash
npm run build
```

Development mode:

```bash
npm run dev -- --help
```

Link globally:

```bash
npm link
```

Then:

```bash
askills --help
```

---

## Using a local registry during development

Set:

```bash
export ASKILLS_REGISTRY_PATH=/path/to/agent-skills
```

Then:

```bash
askills resolve \
  "Debug a failing worker" \
  --profile backend-rust
```

`ASKILLS_REGISTRY_PATH` is intended as a development override.

Normal installations should use:

```text
~/.askills/registry
```

through `askills setup`.

---

# Design principles

askills follows a few core rules.

### Do not copy skills into every repository

Use symlinks and a central registry.

### Do not load every skill into every task

Profiles define candidate pools; resolvers or agents select relevant skills.

### Keep skills portable

Agent-specific routing metadata should not pollute `SKILL.md`.

### Prefer deterministic routing first

Use repository signals and metadata before reaching for embeddings or LLM routing.

### Keep adapters thin

Agent integrations should reuse the same askills pool rather than creating separate skill systems.

### Preserve native agent behavior

When an agent already supports skill discovery, askills should expose skills in the agent's native format rather than replacing its router.

---

# Roadmap

## Completed / current

* [x] Git-backed central skill registry
* [x] machine-level registry setup
* [x] registry sync
* [x] project profiles
* [x] automatic profile detection
* [x] project bootstrap
* [x] rule-based skill resolver
* [x] include / exclude overrides
* [x] Codex CLI adapter
* [x] Codex repository skill discovery
* [x] Codex VS Code workflow

## Next

* [ ] Claude Code adapter
* [ ] additional coding-agent adapters
* [ ] multiple registry support
* [ ] registry precedence and namespacing
* [ ] versioned registry locks
* [ ] immutable skill cache
* [ ] `askills doctor`
* [ ] `askills search`
* [ ] `askills list`
* [ ] `askills add`
* [ ] `askills remove`
* [ ] `askills open`
* [ ] richer repository detection
* [ ] resolver diagnostics
* [ ] optional remote registry / MCP integration

---

# Status

askills is currently an early-stage project.

The architecture and command surface are still evolving, so expect breaking changes before a stable `1.0` release.

For now, it is best suited for experimentation with portable coding-agent skill workflows.

---

# License

MIT

