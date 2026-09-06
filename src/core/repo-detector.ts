import fs from "node:fs/promises";
import path from "node:path";

import type {
  RepoContext
} from "./types.js";

/*
 * Repository detection is a bounded, best-effort heuristic.
 *
 * It reads the root manifests plus a shallow scan of common
 * monorepo layouts (apps/*, packages/*, ...), never walking
 * into build output or dependency directories.
 */

const IGNORE_DIRS = new Set([
  "node_modules",
  "target",
  "dist",
  "build",
  "out",
  "vendor",
  "venv",
  "coverage",
  "tmp"
]);

const CONTAINER_DIRS = new Set([
  "apps",
  "packages",
  "services",
  "libs",
  "crates",
  "modules",
  "projects",
  "backend",
  "frontend",
  "server",
  "client"
]);

const SUBPROJECT_MANIFESTS = [
  "package.json",
  "Cargo.toml",
  "go.mod",
  "pom.xml",
  "build.gradle",
  "build.gradle.kts",
  "pyproject.toml",
  "requirements.txt",
  "Pipfile",
  "Gemfile",
  "composer.json",
  "pubspec.yaml",
  "mix.exs"
];

const ROOT_MANIFEST_LANGUAGE: Array<[string, string]> = [
  ["Cargo.toml", "rust"],
  ["go.mod", "golang"],
  ["pom.xml", "java"],
  ["build.gradle.kts", "kotlin"],
  ["build.gradle", "java"],
  ["pyproject.toml", "python"],
  ["requirements.txt", "python"],
  ["Pipfile", "python"],
  ["Gemfile", "ruby"],
  ["composer.json", "php"],
  ["pubspec.yaml", "dart"],
  ["mix.exs", "elixir"],
  ["package.json", "node"]
];

const MAX_SUBPROJECTS = 60;

interface Signals {
  languages: string[];
  frameworks: string[];
  dependencies: string[];
  files: string[];
}

function emptySignals(): Signals {
  return {
    languages: [],
    frameworks: [],
    dependencies: [],
    files: []
  };
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

async function exists(target: string): Promise<boolean> {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

async function readFileSafe(
  target: string
): Promise<string | null> {
  try {
    return await fs.readFile(target, "utf8");
  } catch {
    return null;
  }
}

async function safeReaddir(
  dir: string
): Promise<import("node:fs").Dirent[]> {
  try {
    return await fs.readdir(dir, {
      withFileTypes: true
    });
  } catch {
    return [];
  }
}

function wordPresent(haystack: string, word: string): boolean {
  return new RegExp(
    `(^|[^a-z0-9_])${word}([^a-z0-9_]|$)`
  ).test(haystack);
}

async function collectNode(
  dir: string,
  signals: Signals
): Promise<void> {
  const raw = await readFileSafe(
    path.join(dir, "package.json")
  );

  if (raw === null) {
    return;
  }

  signals.files.push("package.json");

  let pkg: {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  } = {};

  try {
    pkg = JSON.parse(raw);
  } catch {
    /*
     * package.json exists but is not valid JSON
     * (for example, mid-edit). Keep the file signal
     * and fall back to an empty dependency set.
     */
  }

  const deps = {
    ...(pkg.dependencies ?? {}),
    ...(pkg.devDependencies ?? {})
  };

  const has = (name: string): boolean =>
    Object.prototype.hasOwnProperty.call(deps, name);

  signals.dependencies.push(...Object.keys(deps));

  const tsconfig = await exists(
    path.join(dir, "tsconfig.json")
  );

  if (tsconfig || has("typescript")) {
    signals.languages.push("typescript");
  } else {
    signals.languages.push("javascript");
  }

  if (tsconfig) {
    signals.files.push("tsconfig.json");
  }

  const frameworks: Array<[string, string[]]> = [
    ["nestjs", ["@nestjs/core", "@nestjs/common"]],
    ["nextjs", ["next"]],
    ["nuxt", ["nuxt"]],
    ["remix", ["@remix-run/react", "@remix-run/node"]],
    ["astro", ["astro"]],
    ["sveltekit", ["@sveltejs/kit"]],
    ["svelte", ["svelte"]],
    ["angular", ["@angular/core"]],
    ["vue", ["vue"]],
    ["solid", ["solid-js"]],
    ["react", ["react"]],
    ["express", ["express"]],
    ["fastify", ["fastify"]],
    ["koa", ["koa"]],
    ["hapi", ["@hapi/hapi"]],
    ["vite", ["vite"]],
    ["prisma", ["prisma", "@prisma/client"]],
    ["typeorm", ["typeorm"]],
    ["drizzle", ["drizzle-orm"]],
    ["mongoose", ["mongoose"]],
    ["sequelize", ["sequelize"]],
    ["postgres", ["pg"]],
    ["mysql", ["mysql", "mysql2"]],
    ["mongodb", ["mongodb"]],
    ["redis", ["redis", "ioredis"]],
    ["kafka", ["kafkajs", "kafka-node"]],
    ["graphql", ["graphql", "@apollo/server"]]
  ];

  for (const [name, packages] of frameworks) {
    if (packages.some(has)) {
      signals.frameworks.push(name);
    }
  }
}

function cargoDependencyNames(toml: string): string[] {
  const names: string[] = [];

  let inDependencies = false;

  for (const rawLine of toml.split(/\r?\n/)) {
    const line = rawLine.trim();

    if (line === "" || line.startsWith("#")) {
      continue;
    }

    const section = line.match(/^\[([^\]]+)\]/);

    if (section) {
      const name = section[1].trim();

      inDependencies =
        name === "dependencies" ||
        name === "dev-dependencies" ||
        name === "build-dependencies" ||
        name.endsWith(".dependencies");

      continue;
    }

    if (!inDependencies) {
      continue;
    }

    const entry = line.match(
      /^["']?([A-Za-z0-9_-]+)["']?\s*(=|\.)/
    );

    if (entry) {
      names.push(entry[1].toLowerCase());
    }
  }

  return names;
}

async function collectRust(
  dir: string,
  signals: Signals
): Promise<void> {
  const raw = await readFileSafe(
    path.join(dir, "Cargo.toml")
  );

  if (raw === null) {
    return;
  }

  signals.files.push("Cargo.toml");
  signals.languages.push("rust");

  const deps = new Set(
    cargoDependencyNames(raw)
  );

  signals.dependencies.push(...deps);

  const frameworks: Array<[string, string]> = [
    ["axum", "axum"],
    ["actix", "actix-web"],
    ["rocket", "rocket"],
    ["warp", "warp"],
    ["tonic", "tonic"],
    ["sqlx", "sqlx"],
    ["diesel", "diesel"],
    ["seaorm", "sea-orm"],
    ["tokio", "tokio"],
    ["yew", "yew"],
    ["leptos", "leptos"],
    ["dioxus", "dioxus"]
  ];

  for (const [name, crate] of frameworks) {
    if (deps.has(crate)) {
      signals.frameworks.push(name);
    }
  }
}

async function collectPython(
  dir: string,
  signals: Signals
): Promise<void> {
  const candidates = [
    "pyproject.toml",
    "requirements.txt",
    "setup.py",
    "Pipfile"
  ];

  let marker: string | null = null;
  let text = "";

  for (const file of candidates) {
    const raw = await readFileSafe(
      path.join(dir, file)
    );

    if (raw !== null) {
      marker = marker ?? file;
      text += `\n${raw.toLowerCase()}`;
    }
  }

  if (!marker) {
    return;
  }

  signals.files.push(marker);
  signals.languages.push("python");

  for (const name of [
    "django",
    "flask",
    "fastapi",
    "sqlalchemy",
    "pydantic",
    "celery"
  ]) {
    if (wordPresent(text, name)) {
      signals.frameworks.push(name);
      signals.dependencies.push(name);
    }
  }
}

async function collectGo(
  dir: string,
  signals: Signals
): Promise<void> {
  const raw = await readFileSafe(
    path.join(dir, "go.mod")
  );

  if (raw === null) {
    return;
  }

  signals.files.push("go.mod");
  signals.languages.push("golang");

  const lower = raw.toLowerCase();

  const frameworks: Array<[string, string]> = [
    ["gin", "gin-gonic/gin"],
    ["echo", "labstack/echo"],
    ["fiber", "gofiber/fiber"],
    ["chi", "go-chi/chi"],
    ["grpc", "google.golang.org/grpc"]
  ];

  for (const [name, module] of frameworks) {
    if (lower.includes(module)) {
      signals.frameworks.push(name);
    }
  }
}

async function collectJvm(
  dir: string,
  signals: Signals
): Promise<void> {
  const manifests = [
    "pom.xml",
    "build.gradle",
    "build.gradle.kts"
  ];

  let text = "";
  let found = false;
  let kotlinManifest = false;

  for (const file of manifests) {
    const raw = await readFileSafe(
      path.join(dir, file)
    );

    if (raw === null) {
      continue;
    }

    found = true;
    signals.files.push(file);
    text += `\n${raw.toLowerCase()}`;

    if (file.endsWith(".kts")) {
      kotlinManifest = true;
    }
  }

  if (!found) {
    return;
  }

  const kotlin =
    kotlinManifest ||
    text.includes("org.jetbrains.kotlin") ||
    text.includes("kotlin(\"");

  signals.languages.push(kotlin ? "kotlin" : "java");

  if (
    text.includes("spring-boot") ||
    text.includes("org.springframework.boot")
  ) {
    signals.frameworks.push("spring");
  }

  if (text.includes("quarkus")) {
    signals.frameworks.push("quarkus");
  }

  if (text.includes("micronaut")) {
    signals.frameworks.push("micronaut");
  }

  if (text.includes("io.ktor")) {
    signals.frameworks.push("ktor");
  }
}

async function collectRuby(
  dir: string,
  signals: Signals
): Promise<void> {
  const raw = await readFileSafe(
    path.join(dir, "Gemfile")
  );

  if (raw === null) {
    return;
  }

  signals.files.push("Gemfile");
  signals.languages.push("ruby");

  const lower = raw.toLowerCase();

  if (wordPresent(lower, "rails")) {
    signals.frameworks.push("rails");
  }

  if (lower.includes("sinatra")) {
    signals.frameworks.push("sinatra");
  }
}

async function collectPhp(
  dir: string,
  signals: Signals
): Promise<void> {
  const raw = await readFileSafe(
    path.join(dir, "composer.json")
  );

  if (raw === null) {
    return;
  }

  signals.files.push("composer.json");
  signals.languages.push("php");

  let json: {
    require?: Record<string, string>;
    ["require-dev"]?: Record<string, string>;
  } = {};

  try {
    json = JSON.parse(raw);
  } catch {
    return;
  }

  const keys = Object.keys({
    ...(json.require ?? {}),
    ...(json["require-dev"] ?? {})
  }).map(key => key.toLowerCase());

  signals.dependencies.push(...keys);

  if (keys.some(key => key.startsWith("laravel/"))) {
    signals.frameworks.push("laravel");
  }

  if (keys.some(key => key.startsWith("symfony/"))) {
    signals.frameworks.push("symfony");
  }
}

async function collectDotnet(
  dir: string,
  signals: Signals
): Promise<void> {
  const entries = await safeReaddir(dir);

  const project = entries.find(
    entry =>
      entry.isFile() &&
      (entry.name.endsWith(".csproj") ||
        entry.name.endsWith(".fsproj") ||
        entry.name.endsWith(".sln"))
  );

  if (!project) {
    return;
  }

  signals.files.push(
    project.name.endsWith(".sln")
      ? "*.sln"
      : "*.csproj"
  );

  signals.languages.push(
    project.name.endsWith(".fsproj")
      ? "fsharp"
      : "csharp"
  );
}

async function collectDart(
  dir: string,
  signals: Signals
): Promise<void> {
  const raw = await readFileSafe(
    path.join(dir, "pubspec.yaml")
  );

  if (raw === null) {
    return;
  }

  signals.files.push("pubspec.yaml");
  signals.languages.push("dart");

  if (raw.toLowerCase().includes("flutter:")) {
    signals.frameworks.push("flutter");
  }
}

async function collectElixir(
  dir: string,
  signals: Signals
): Promise<void> {
  const raw = await readFileSafe(
    path.join(dir, "mix.exs")
  );

  if (raw === null) {
    return;
  }

  signals.files.push("mix.exs");
  signals.languages.push("elixir");

  if (raw.toLowerCase().includes(":phoenix")) {
    signals.frameworks.push("phoenix");
  }
}

async function collectSignals(
  dir: string,
  signals: Signals
): Promise<void> {
  await Promise.all([
    collectNode(dir, signals),
    collectRust(dir, signals),
    collectPython(dir, signals),
    collectGo(dir, signals),
    collectJvm(dir, signals),
    collectRuby(dir, signals),
    collectPhp(dir, signals),
    collectDotnet(dir, signals),
    collectDart(dir, signals),
    collectElixir(dir, signals)
  ]);
}

async function collectRootExtras(
  root: string,
  signals: Signals
): Promise<void> {
  if (await exists(path.join(root, "Dockerfile"))) {
    signals.files.push("Dockerfile");
  }

  if (
    (await exists(
      path.join(root, "docker-compose.yml")
    )) ||
    (await exists(
      path.join(root, "docker-compose.yaml")
    ))
  ) {
    signals.files.push("docker-compose.yml");
  }

  if (await exists(path.join(root, "migrations"))) {
    signals.files.push("migrations/");
  }

  if (
    await exists(
      path.join(root, ".github", "workflows")
    )
  ) {
    signals.files.push(".github/workflows/");
  }
}

async function hasManifest(dir: string): Promise<boolean> {
  for (const manifest of SUBPROJECT_MANIFESTS) {
    if (await exists(path.join(dir, manifest))) {
      return true;
    }
  }

  return false;
}

async function findSubprojectDirs(
  root: string
): Promise<string[]> {
  const out: string[] = [];

  for (const entry of await safeReaddir(root)) {
    if (
      !entry.isDirectory() ||
      entry.name.startsWith(".") ||
      IGNORE_DIRS.has(entry.name)
    ) {
      continue;
    }

    const dir = path.join(root, entry.name);

    if (await hasManifest(dir)) {
      out.push(dir);
    }

    if (CONTAINER_DIRS.has(entry.name)) {
      for (const child of await safeReaddir(dir)) {
        if (
          !child.isDirectory() ||
          child.name.startsWith(".") ||
          IGNORE_DIRS.has(child.name)
        ) {
          continue;
        }

        const childDir = path.join(dir, child.name);

        if (await hasManifest(childDir)) {
          out.push(childDir);
        }
      }
    }

    if (out.length >= MAX_SUBPROJECTS) {
      break;
    }
  }

  return out.slice(0, MAX_SUBPROJECTS);
}

async function resolvePrimaryLanguage(
  root: string,
  signals: Signals
): Promise<string | undefined> {
  for (const [file, language] of ROOT_MANIFEST_LANGUAGE) {
    if (!(await exists(path.join(root, file)))) {
      continue;
    }

    if (language === "node") {
      return signals.languages.includes("typescript")
        ? "typescript"
        : "javascript";
    }

    return language;
  }

  const counts = new Map<string, number>();

  for (const language of signals.languages) {
    counts.set(
      language,
      (counts.get(language) ?? 0) + 1
    );
  }

  let best: string | undefined;
  let bestCount = 0;

  for (const [language, count] of counts) {
    if (count > bestCount) {
      best = language;
      bestCount = count;
    }
  }

  return best;
}

export async function detectRepository(
  root = process.cwd()
): Promise<RepoContext> {
  const signals = emptySignals();

  await collectSignals(root, signals);
  await collectRootExtras(root, signals);

  for (const dir of await findSubprojectDirs(root)) {
    await collectSignals(dir, signals);
  }

  const primaryLanguage = await resolvePrimaryLanguage(
    root,
    signals
  );

  return {
    root,
    languages: unique(signals.languages),
    frameworks: unique(signals.frameworks),
    dependencies: unique(signals.dependencies),
    files: unique(signals.files),
    primaryLanguage
  };
}
