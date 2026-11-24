import fs from "node:fs/promises";
import path from "node:path";
import { GitHubRateLimit, GitHubSkills, gitSha, repositoryName, type GitTree, type GitHubRepo } from "./github-skills.js";
import { loadProjectConfig, projectConfigExists } from "./project-config.js";
import { projectSkillPool } from "./project-pool.js";
import type { RegistryContext } from "./registry-context.js";
import { detectRepository } from "./repo-detector.js";
import { loadSkillDescriptor } from "./skill-frontmatter.js";

interface Source {
  repo: string;
  directory: string;
  commit: string;
}

interface Suggestion {
  name: string;
  description: string;
  /** Pinned upstream directory; absent for registry skills without UPSTREAM.json. */
  url?: string;
  matches: string[];
  reference?: string;
  stars?: number;
  license?: string;
}

interface TrackedSkill {
  reference: string;
  source: Source;
}

interface Update {
  reference: string;
  status: "changed" | "removed";
  url: string;
  previous: string;
  current: string;
}

function skillUrl(source: Source) {
  const suffix = source.directory.split("/").filter(Boolean).map(encodeURIComponent).join("/");
  return `https://github.com/${source.repo}/tree/${source.commit}${suffix ? "/" + suffix : ""}`;
}

async function readSource(root: string): Promise<Source | undefined> {
  let raw: string;
  try {
    raw = await fs.readFile(path.join(root, "UPSTREAM.json"), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }
  const { repository, commit, sourcePath } = JSON.parse(raw);
  if (typeof repository !== "string" || !repository.startsWith("https://github.com/")) {
    throw new Error("UPSTREAM.json requires a GitHub repository URL");
  }
  const repo = repository.slice("https://github.com/".length).replace(/\/$/, "").replace(/\.git$/, "");
  if (!repositoryName.test(repo) || !gitSha.test(commit) || typeof sourcePath !== "string") {
    throw new Error("UPSTREAM.json requires a GitHub repository, pinned commit and sourcePath");
  }
  const directory = sourcePath === "." ? "" : sourcePath;
  if (directory && directory.split("/").some(part => !part || part === "." || part === ".." || /[\\\p{C}]/u.test(part))) {
    throw new Error("Invalid sourcePath in UPSTREAM.json");
  }
  return { repo: repo.toLowerCase(), commit, directory };
}

function folderHash(tree: GitTree, directory: string): string | undefined {
  const file = directory ? `${directory}/SKILL.md` : "SKILL.md";
  if (!tree.tree.some(entry => entry.type === "blob" && entry.path === file)) return;
  return directory ? tree.tree.find(entry => entry.type === "tree" && entry.path === directory)?.sha : tree.sha;
}

function matches(text: string, terms: string[]) {
  const words = " " + text.toLowerCase().split(/[^\p{L}\p{N}+#]+/u).join(" ") + " ";
  return terms.filter(term => {
    const phrase = term.toLowerCase().split(/[^\p{L}\p{N}+#]+/u).filter(Boolean).join(" ");
    return phrase && words.includes(` ${phrase} `);
  });
}

function shortError(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

async function inventory(root: string, context: RegistryContext | undefined, terms: string[]) {
  const warnings = new Set<string>();
  const suggestions: Suggestion[] = [];
  const skills = await context?.listSkills() ?? [];
  const hasProject = await projectConfigExists(root);
  const pool = hasProject && context ? await projectSkillPool(await loadProjectConfig(root), context, root) :
    { ids: skills.map(skill => skill.reference), exclude: new Set<string>() };
  const active = new Set(pool.ids);
  const blockedNames = new Set<string>();
  const knownSources = new Set<string>();
  const tracked = new Map<string, TrackedSkill[]>();
  let untracked = 0;

  for (const skill of skills) {
    try {
      const { name, description } = await loadSkillDescriptor(skill.reference, context);
      const installed = active.has(skill.reference);
      const excluded = pool.exclude.has(skill.reference);
      if (installed || excluded) blockedNames.add(name);
      if (!installed && !excluded && hasProject) {
        const matched = matches(`${name} ${description ?? ""}`, terms);
        if (matched.length) suggestions.push({
          name, description: description ?? "", reference: skill.reference, matches: matched
        });
      }
      // Provenance is optional: it only adds an upstream link and an upstream comparison.
      const source = await readSource(skill.root);
      if (!source) {
        if (installed) untracked++;
        continue;
      }
      knownSources.add(`${source.repo}/${source.directory}`);
      const candidate = suggestions.at(-1);
      if (candidate?.reference === skill.reference) candidate.url = skillUrl(source);
      if (installed) {
        const group = tracked.get(source.repo) ?? [];
        group.push({ reference: skill.reference, source });
        tracked.set(source.repo, group);
      }
    } catch (error) {
      warnings.add(`${skill.reference}: ${shortError(error)}`);
    }
  }

  return { warnings, suggestions, active, tracked, knownSources, blockedNames, untracked };
}

async function upstreamChange(github: GitHubSkills, skill: TrackedSkill, head: string, tree: GitTree): Promise<Update | undefined> {
  const { reference, source } = skill;
  if (source.commit === head) return;
  const pinned = folderHash(await github.tree(source.repo, source.commit), source.directory);
  if (!pinned) throw new Error("Skill missing at recorded upstream commit");
  const current = folderHash(tree, source.directory);
  if (pinned === current) return;
  return {
    reference, status: current ? "changed" : "removed", previous: source.commit, current: head,
    url: `https://github.com/${source.repo}/compare/${source.commit}...${head}`
  };
}

async function addRemoteSuggestions(
  github: GitHubSkills, repo: string, metadata: GitHubRepo, head: string, tree: GitTree,
  terms: string[], knownSources: Set<string>, suggestions: Suggestion[]
) {
  const candidates = tree.tree.filter(entry =>
    entry.type === "blob" && /^100(644|755)$/.test(entry.mode) && gitSha.test(entry.sha) &&
    /(^|\/)SKILL\.md$/.test(entry.path) && !/(^|\/)(\.[^/]+|tests?|fixtures?|templates?|node_modules)\//i.test(entry.path) &&
    (entry.size ?? 0) <= 256_000
  ).map(file => {
    const directory = path.posix.dirname(file.path);
    return { file, directory: directory === "." ? "" : directory, rank: matches(file.path, terms).length };
  }).filter(({ directory }) => !knownSources.has(`${repo}/${directory}`))
    .sort((a, b) => b.rank - a.rank || a.file.path.localeCompare(b.file.path));
  for (const { file, directory } of candidates.slice(0, 4)) {
    const descriptor = await github.descriptor(repo, head, file.path);
    if (!descriptor) continue;
    const matched = matches(`${descriptor.name} ${descriptor.description} ${directory}`, terms);
    if (terms.length && !matched.length) continue;
    suggestions.push({ ...descriptor, matches: matched, stars: metadata.stargazers_count,
      license: metadata.license?.spdx_id, url: skillUrl({ repo, directory, commit: head }) });
  }
}

export async function discoverSkills(root: string, context: RegistryContext | undefined, query = "", request: typeof fetch = fetch) {
  const github = new GitHubSkills(request);
  const signals = await detectRepository(root);
  const searchTerms = query.toLowerCase().match(/[\p{L}\p{N}+#]+/gu) ?? [];
  const codingTerms = signals.languages.length ? ["testing", "debugging", "refactoring", "code-review"] : [];
  const projectTerms = [...signals.languages, ...signals.frameworks, ...signals.dependencies];
  const registryTerms = searchTerms.length ? searchTerms : projectTerms;
  const terms = [...new Set(searchTerms.length ? searchTerms : [...projectTerms, ...codingTerms])];
  const { warnings, suggestions, active, tracked, knownSources, blockedNames, untracked } = await inventory(root, context, registryTerms);
  const updates: Update[] = [];
  const registryNames = new Map<string, string>();
  let checkedUpstreams = 0;

  const found = await github.search().catch(error => {
    warnings.add(shortError(error));
    return [];
  });
  const repositories = new Map(found.map(item => [item.full_name.toLowerCase(), item]));
  for (const repo of new Set([...tracked.keys(), ...repositories.keys()])) {
    try {
      const head = await github.head(repo);
      const tree = await github.tree(repo, head);
      for (const skill of tracked.get(repo) ?? []) {
        try {
          const update = await upstreamChange(github, skill, head, tree);
          checkedUpstreams++;
          if (update) updates.push(update);
        } catch (error) {
          warnings.add(error instanceof GitHubRateLimit ? error.message : `${skill.reference}: ${shortError(error)}`);
        }
      }
      const metadata = repositories.get(repo);
      if (metadata) {
        await addRemoteSuggestions(github, repo, metadata, head, tree, terms, knownSources, suggestions);
      }
    } catch (error) {
      warnings.add(error instanceof GitHubRateLimit ? error.message : `${repo}: ${shortError(error)}`);
    }
  }

  // A registry skill claims its name before any GitHub result, in configured registry order
  // (inventory lists registry skills first and in that order).
  for (const item of suggestions) {
    if (item.reference && !blockedNames.has(item.name)) registryNames.set(item.name, item.reference);
  }
  const ranked = suggestions.filter(item => {
    const owner = registryNames.get(item.name);
    return owner === undefined || owner === item.reference;
  });
  ranked.sort((a, b) => b.matches.length - a.matches.length || Number(!!b.reference) - Number(!!a.reference) ||
    (b.stars ?? 0) - (a.stars ?? 0) || a.name.localeCompare(b.name) || (a.url ?? "").localeCompare(b.url ?? ""));
  const selected = ranked.filter(item => {
    if (blockedNames.has(item.name)) return false;
    blockedNames.add(item.name);
    return true;
  }).slice(0, 5);
  return { suggestions: selected, updates, checkedUpstreams, warnings: [...warnings], untracked, active: [...active] };
}
