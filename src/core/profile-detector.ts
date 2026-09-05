import {
  detectRepository
} from "./repo-detector.js";

export async function detectProfile(
  root = process.cwd()
): Promise<string> {
  const repo = await detectRepository(root);

  const languages = new Set(repo.languages);
  const frameworks = new Set(repo.frameworks);

  if (languages.has("rust")) {
    return "backend-rust";
  }

  if (
    languages.has("typescript") &&
    frameworks.has("nestjs")
  ) {
    return "backend-typescript";
  }

  if (
    languages.has("typescript") &&
    frameworks.has("nextjs")
  ) {
    return "frontend-nextjs";
  }

  if (
    languages.has("typescript") &&
    frameworks.has("react")
  ) {
    return "frontend-react";
  }

  if (languages.has("golang")) {
    return "backend-go";
  }

  return "coding";
}
