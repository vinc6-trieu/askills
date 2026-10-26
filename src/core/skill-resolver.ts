import { resolveProfile } from "./profile-resolver.js";

import { loadSkillMetas } from "./skill-registry.js";

import { createRegistryContext } from "./registry-config.js";

import type { RegistryContext } from "./registry-context.js";

import { detectRepository } from "./repo-detector.js";
import { scopedRepository, taskPaths } from "./task-scope.js";

import type {
  ResolveResult,
  ScoredSkill,
  SkillKind,
  SkillMeta,
} from "./types.js";

const SCORE_THRESHOLD = 15;

interface TaskQuery {
  text: string;
  tokens: Set<string>;
}

function normalize(value: string): string {
  return value.normalize("NFC").toLowerCase().trim().replace(/\s+/gu, " ");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function tokenize(value: string): Set<string> {
  return new Set(
    normalize(value)
      .split(/[^\p{L}\p{M}\p{N}#+.]+/u)
      .filter(Boolean),
  );
}

export function buildQuery(taskRaw: string): TaskQuery {
  return {
    text: normalize(taskRaw),
    tokens: tokenize(taskRaw),
  };
}

/*
 * Match a routing term against the task.
 *
 * Multi-word or path/hyphen terms are matched as a
 * word-bounded phrase; single tokens must appear as a
 * whole word in the task (with a light plural fold), so
 * "go" no longer matches "goal" and "react" no longer
 * matches "reaction".
 */
export function matchesTerm(query: TaskQuery, term: string): boolean {
  const needle = normalize(term);

  if (!needle) {
    return false;
  }

  if (/[\s\-/]/.test(needle)) {
    const pattern = new RegExp(
      `(^|[^\\p{L}\\p{M}\\p{N}_])${escapeRegExp(needle)}([^\\p{L}\\p{M}\\p{N}_]|$)`,
      "u",
    );

    return pattern.test(query.text);
  }

  if (query.tokens.has(needle)) {
    return true;
  }

  if (query.tokens.has(`${needle}s`)) {
    return true;
  }

  return needle.endsWith("s") && query.tokens.has(needle.slice(0, -1));
}

function intersection(a: string[], b: string[]): string[] {
  const right = new Set(b.map(normalize));

  return a.map(normalize).filter((value) => right.has(value));
}

function scoreSkill(
  query: TaskQuery,
  meta: SkillMeta,
  repo: Awaited<ReturnType<typeof detectRepository>>,
): ScoredSkill {
  let score = 0;

  const reasons: string[] = [];

  const idTail = meta.id.split("/").pop() ?? meta.id;

  if (matchesTerm(query, meta.id) || matchesTerm(query, idTail)) {
    score += 100;
    reasons.push("explicit skill match");
  }

  for (const intent of meta.intents ?? []) {
    if (matchesTerm(query, intent)) {
      score += 35;
      reasons.push(`intent:${intent}`);
    }
  }

  let keywordScore = 0;

  for (const keyword of meta.keywords ?? []) {
    if (matchesTerm(query, keyword)) {
      keywordScore += 10;
      reasons.push(`keyword:${keyword}`);
    }
  }

  score += Math.min(keywordScore, 40);

  const languageMatches = intersection(meta.languages ?? [], repo.languages);

  if (languageMatches.length > 0) {
    score += 40;

    reasons.push(`language:${languageMatches.join(",")}`);
  }

  const frameworkMatches = intersection(meta.frameworks ?? [], repo.frameworks);

  if (frameworkMatches.length > 0) {
    score += 35;

    reasons.push(`framework:${frameworkMatches.join(",")}`);
  }

  const dependencyMatches = intersection(
    meta.repo_signals?.dependencies ?? [],
    repo.dependencies,
  );

  if (dependencyMatches.length > 0) {
    score += 25;

    reasons.push(`dependency:${dependencyMatches.join(",")}`);
  }

  const fileMatches = intersection(meta.repo_signals?.files ?? [], repo.files);

  if (fileMatches.length > 0) {
    score += 25;

    reasons.push(`repo:${fileMatches.join(",")}`);
  }

  const priority = Math.min(meta.priority ?? 0, 100);

  score += priority / 10;

  return {
    id: meta.id,
    kind: meta.kind,
    score,
    reasons,
    priority: meta.priority ?? 0,
  };
}

const SOFT_LIMITS: Record<SkillKind, number> = {
  process: 2,
  domain: 2,
  language: 1,
  framework: 2,
  quality: 1,
  meta: 0,
};

export interface ResolveOverrides {
  pool?: string[];
  include?: string[];
  exclude?: string[];
  skills?: string[];
  paths?: string[];
}

export async function resolveSkills(
  task: string,
  profileName: string | string[],
  root = process.cwd(),
  overrides: ResolveOverrides = {},
  context?: RegistryContext
): Promise<ResolveResult> {
  const registryContext = context ?? await createRegistryContext(root);
  const resolvedProfiles = await Promise.all([...new Set(typeof profileName === "string" ? [profileName] : profileName)]
    .map(name => resolveProfile(name, registryContext, root)));
  const profiles = [...new Map(resolvedProfiles.map(profile => [profile.name, profile])).values()];
  if (profiles.length === 0) throw new Error("At least one profile is required");
  const profile = {
    name: profiles.map(p => p.name).join(" + "),
    always: [...new Set(profiles.flatMap(p => p.always))],
    pool: [...new Set(profiles.flatMap(p => p.pool))],
    maxAutoSkills: Math.min(...profiles.map(p => p.maxAutoSkills))
  };

  const repo = await scopedRepository(root, await taskPaths(root, overrides.paths ?? []));

  const query = buildQuery(task);

  const normalizeIds = async (ids: string[]): Promise<string[]> =>
    Promise.all(ids.map(async id =>
      (await registryContext.resolveSkill(id)).reference
    ));

  const normalizedExclude = await normalizeIds(overrides.exclude ?? []);
  const normalizedInclude = await normalizeIds(overrides.include ?? []);
  const normalizedPool = await normalizeIds(overrides.pool ?? []);
  const requested = await normalizeIds(overrides.skills ?? []);
  const excluded = new Set(normalizedExclude);

  for (const id of requested) {
    if (excluded.has(id)) throw new Error(`Explicit skill "${id}" is excluded by project configuration`);
  }

  const forced = new Set(
    [...normalizedInclude, ...requested].filter((id) => !excluded.has(id)),
  );

  const always = profile.always.filter((id) => !excluded.has(id));

  const candidatePool = [
    ...new Set([...profile.pool, ...normalizedPool, ...normalizedInclude, ...requested]),
  ].filter((id) => !excluded.has(id) && !always.includes(id));

  const metas = await loadSkillMetas(candidatePool, registryContext);
  for (const id of forced) {
    if (!always.includes(id) && !metas.has(id)) throw new Error(`Cannot load metadata for required skill "${id}"`);
  }

  const scored: ScoredSkill[] = [];

  for (const meta of metas.values()) {
    const item = scoreSkill(query, meta, repo);

    if (meta.auto === false && !forced.has(meta.id)) {
      item.rejection = "auto: false";
      scored.push(item);
      continue;
    }

    scored.push(item);
  }

  scored.sort(
    (a, b) =>
      b.score - a.score ||
      b.priority - a.priority ||
      a.id.localeCompare(b.id),
  );

  const selectable = scored.filter((item) => {
    if (item.rejection) return false;
    if (item.score < SCORE_THRESHOLD) {
      item.rejection = `score ${item.score.toFixed(1)} < ${SCORE_THRESHOLD}`;
      return false;
    }
    if (item.kind === "meta") {
      item.rejection = 'category "meta" is not auto-selected';
      return false;
    }
    if (!Object.hasOwn(SOFT_LIMITS, item.kind)) {
      item.rejection = `unknown category "${item.kind}"`;
      return false;
    }
    return true;
  });

  const selected: ScoredSkill[] = [];

  const selectedIds = new Set<string>();

  const countByKind = new Map<SkillKind, number>();

  function select(candidate: ScoredSkill): void {
    if (selectedIds.has(candidate.id) || selected.length >= profile.maxAutoSkills) return;
    candidate.selected = true;
    selected.push(candidate);
    selectedIds.add(candidate.id);
    countByKind.set(candidate.kind, (countByKind.get(candidate.kind) ?? 0) + 1);
  }

  // Explicit names in the task get first use of the automatic budget.
  for (const candidate of selectable.filter(item => item.reasons.includes("explicit skill match"))) select(candidate);

  // Reserve at most one process and one quality slot, only with task evidence.
  // TDD is quality in the registry. Repository signals alone cannot earn a floor.
  const floors = ["process", "quality"].flatMap(kind => {
    if ((countByKind.get(kind as SkillKind) ?? 0) > 0) return [];
    const candidate = selectable.find(item => item.kind === kind && item.reasons.some(reason =>
      reason.startsWith("intent:") || reason.startsWith("keyword:")
    ));
    return candidate ? [candidate] : [];
  }).sort((a, b) => b.score - a.score || b.priority - a.priority || a.id.localeCompare(b.id));
  for (const candidate of floors) select(candidate);

  // Global rank, with soft category ceilings for diversity.
  for (const candidate of selectable) {
    if ((countByKind.get(candidate.kind) ?? 0) < SOFT_LIMITS[candidate.kind]) select(candidate);
  }
  // Do not leave useful slots empty just because a soft ceiling was reached.
  for (const candidate of selectable) select(candidate);
  for (const candidate of selectable) {
    if (!candidate.selected) candidate.rejection = `max_auto_skills ${profile.maxAutoSkills} reached`;
  }

  /*
   * Skills listed in `.agent-skills.yaml` include are an
   * explicit request. They bypass the score threshold and
   * the category / max_auto_skills limits.
   */
  for (const id of forced) {
    if (always.includes(id)) {
      continue;
    }

    const item = scored.find((entry) => entry.id === id);

    if (!item) {
      continue;
    }

    item.selected = true;
    item.rejection = undefined;
    item.reasons.unshift(requested.includes(id) ? "CLI skill (forced)" : "config include (forced)");

    if (!selectedIds.has(id)) {
      selected.push(item);
      selectedIds.add(id);
    }
  }

  return {
    profile,
    profiles: profiles.map(p => p.name),
    repo,
    always,
    selected,
    candidates: scored,
  };
}
