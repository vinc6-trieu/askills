import fs from "node:fs/promises";
import path from "node:path";
import { detectRepository, hasManifest } from "./repo-detector.js";
import type { RepoContext } from "./types.js";

function within(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

export interface TaskPath {
  relative: string;
  directory: boolean;
  scopeRoot: string;
}

export async function taskPaths(root: string, paths: string[]): Promise<TaskPath[]> {
  const project = await fs.realpath(root);
  const results: TaskPath[] = [];
  for (const input of [...new Set(paths)]) {
    if (!input.trim()) throw new Error("--path must not be empty");
    const target = path.resolve(root, input);
    if (!within(path.resolve(root), target)) throw new Error(`Task path is outside the project: ${input}`);
    let existing = target;
    let directory = false;
    while (true) {
      try {
        const stat = await fs.lstat(existing);
        const real = await fs.realpath(existing);
        if (!within(project, real)) throw new Error(`Task path is outside the project through a symlink: ${input}`);
        directory = existing === target && (stat.isDirectory() || (stat.isSymbolicLink() && (await fs.stat(existing)).isDirectory()));
        if (!(await fs.stat(existing)).isDirectory()) existing = path.dirname(existing);
        break;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        // A dangling symlink must not be mistaken for a future file.
        try {
          if ((await fs.lstat(existing)).isSymbolicLink()) throw new Error(`Unresolved symlink in task path: ${input}`);
        } catch (nested) {
          if ((nested as NodeJS.ErrnoException).code !== "ENOENT") throw nested;
        }
        existing = path.dirname(existing);
      }
    }
    let scopeRoot = existing;
    // An explicitly selected directory can contain several packages.
    if (!directory) {
      while (scopeRoot !== path.resolve(root) && !(await hasManifest(scopeRoot))) scopeRoot = path.dirname(scopeRoot);
    } else if (!(await hasManifest(scopeRoot))) {
      // Retain the directory if it contains packages; otherwise use its enclosing package.
      const own = await detectRepository(scopeRoot);
      if (own.languages.length === 0) {
        while (scopeRoot !== path.resolve(root) && !(await hasManifest(scopeRoot))) scopeRoot = path.dirname(scopeRoot);
      }
    }
    results.push({ relative: path.relative(path.resolve(root), target).split(path.sep).join("/") || ".", directory, scopeRoot });
  }
  return results;
}

export async function scopedRepository(root: string, paths: TaskPath[]): Promise<RepoContext> {
  if (paths.length === 0) return detectRepository(root);
  const contexts = await Promise.all([...new Set(paths.map(p => p.scopeRoot))].sort().map(dir => detectRepository(dir)));
  const values = (key: "languages" | "frameworks" | "dependencies" | "files") => [...new Set(contexts.flatMap(context => context[key]))].sort();
  return { root, languages: values("languages"), frameworks: values("frameworks"), dependencies: values("dependencies"),
    files: values("files"), primaryLanguage: contexts.length === 1 ? contexts[0]?.primaryLanguage : undefined };
}
