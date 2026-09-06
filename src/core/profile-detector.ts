import fs from "node:fs/promises";
import path from "node:path";

import {
  detectRepository
} from "./repo-detector.js";

import {
  profilesRoot
} from "./paths.js";

import type {
  RepoContext
} from "./types.js";

const FALLBACK_PROFILE = "coding";

async function profileExists(
  name: string
): Promise<boolean> {
  try {
    await fs.access(
      path.join(
        profilesRoot(),
        `${name}.yaml`
      )
    );

    return true;
  } catch {
    return false;
  }
}

function profileForLanguage(
  language: string,
  frameworks: Set<string>,
  languages: Set<string>
): string | undefined {
  const has = (...names: string[]): boolean =>
    names.some(name => frameworks.has(name));

  switch (language) {
    case "rust":
      if (has("yew", "leptos", "dioxus")) {
        return "frontend-rust";
      }

      return "backend-rust";

    case "typescript":
    case "javascript": {
      if (has("nextjs")) return "frontend-nextjs";
      if (has("nuxt")) return "frontend-nuxt";
      if (has("sveltekit", "svelte")) return "frontend-svelte";
      if (has("angular")) return "frontend-angular";
      if (has("astro")) return "frontend-astro";
      if (has("vue")) return "frontend-vue";
      if (has("remix")) return "frontend-remix";
      if (has("react")) return "frontend-react";
      if (has("nestjs")) return "backend-typescript";

      if (has("express", "fastify", "koa", "hapi")) {
        return languages.has("typescript")
          ? "backend-typescript"
          : "backend-node";
      }

      /*
       * A frameworkless TS/JS project (library, CLI, ...)
       * has no clear profile; let another language or the
       * fallback decide.
       */
      return undefined;
    }

    case "golang":
      return "backend-go";

    case "python":
      if (has("django")) return "backend-django";
      if (has("fastapi")) return "backend-fastapi";
      if (has("flask")) return "backend-flask";
      return "backend-python";

    case "kotlin":
      return "backend-kotlin";

    case "java":
      return "backend-java";

    case "ruby":
      return has("rails") ? "backend-rails" : "backend-ruby";

    case "php":
      return has("laravel")
        ? "backend-laravel"
        : has("symfony")
          ? "backend-symfony"
          : "backend-php";

    case "elixir":
      return "backend-elixir";

    case "csharp":
      return "backend-dotnet";

    case "dart":
      return has("flutter") ? "frontend-flutter" : "dart";

    default:
      return undefined;
  }
}

function pickProfile(
  repo: RepoContext
): string {
  const frameworks = new Set(repo.frameworks);
  const languages = new Set(repo.languages);

  const order = repo.primaryLanguage
    ? [
        repo.primaryLanguage,
        ...repo.languages.filter(
          language => language !== repo.primaryLanguage
        )
      ]
    : repo.languages;

  for (const language of order) {
    const profile = profileForLanguage(
      language,
      frameworks,
      languages
    );

    if (profile) {
      return profile;
    }
  }

  return FALLBACK_PROFILE;
}

export async function detectProfile(
  root = process.cwd()
): Promise<string> {
  const repo = await detectRepository(root);

  const candidate = pickProfile(repo);

  if (candidate === FALLBACK_PROFILE) {
    return candidate;
  }

  /*
   * A heuristic match is only useful if the registry
   * actually ships that profile. Otherwise fall back
   * so bootstrap does not fail later with
   * "Profile not found".
   */
  if (await profileExists(candidate)) {
    return candidate;
  }

  return FALLBACK_PROFILE;
}
