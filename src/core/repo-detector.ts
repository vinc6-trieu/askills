import fs from "node:fs/promises";
import path from "node:path";

import type {
  RepoContext
} from "./types.js";

async function exists(
  file: string
): Promise<boolean> {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

export async function detectRepository(
  root = process.cwd()
): Promise<RepoContext> {

  const languages: string[] = [];
  const frameworks: string[] = [];
  const dependencies: string[] = [];
  const files: string[] = [];

  const packageJson =
    path.join(root, "package.json");

  const cargoToml =
    path.join(root, "Cargo.toml");

  const goMod =
    path.join(root, "go.mod");

  const pomXml =
    path.join(root, "pom.xml");

  const tsconfig =
    path.join(root, "tsconfig.json");

  if (await exists(cargoToml)) {
    files.push("Cargo.toml");
    languages.push("rust");

    const cargo = (
      await fs.readFile(cargoToml, "utf8")
    ).toLowerCase();

    if (cargo.includes("axum")) {
      frameworks.push("axum");
      dependencies.push("axum");
    }

    if (cargo.includes("sqlx")) {
      frameworks.push("sqlx");
      dependencies.push("sqlx");
    }

    if (cargo.includes("tokio")) {
      frameworks.push("tokio");
      dependencies.push("tokio");
    }
  }

  if (await exists(packageJson)) {
    files.push("package.json");

    const raw =
      await fs.readFile(
        packageJson,
        "utf8"
      );

    const pkg = JSON.parse(raw);

    const deps = {
      ...(pkg.dependencies ?? {}),
      ...(pkg.devDependencies ?? {})
    };

    dependencies.push(
      ...Object.keys(deps)
    );

    if (
      await exists(tsconfig) ||
      deps.typescript
    ) {
      languages.push("typescript");
    } else {
      languages.push("javascript");
    }

    if (deps["@nestjs/core"]) {
      frameworks.push("nestjs");
    }

    if (deps.next) {
      frameworks.push("nextjs");
    }

    if (deps.react) {
      frameworks.push("react");
    }

    if (deps.express) {
      frameworks.push("express");
    }

    if (
      deps.redis ||
      deps.ioredis
    ) {
      frameworks.push("redis");
    }

    if (
      deps.kafka ||
      deps.kafkaJS ||
      deps.kafkajs
    ) {
      frameworks.push("kafka");
    }
  }

  if (await exists(goMod)) {
    files.push("go.mod");
    languages.push("golang");
  }

  if (await exists(pomXml)) {
    files.push("pom.xml");
    languages.push("java");
  }

  if (await exists(tsconfig)) {
    files.push("tsconfig.json");

    if (!languages.includes("typescript")) {
      languages.push("typescript");
    }
  }

  if (
    await exists(
      path.join(root, "migrations")
    )
  ) {
    files.push("migrations/");
  }

  if (
    await exists(
      path.join(root, "Dockerfile")
    )
  ) {
    files.push("Dockerfile");
  }

  return {
    root,
    languages: unique(languages),
    frameworks: unique(frameworks),
    dependencies: unique(dependencies),
    files: unique(files)
  };
}
