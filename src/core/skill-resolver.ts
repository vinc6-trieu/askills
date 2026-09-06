import { resolveProfile } from "./profile-resolver.js";

import { loadSkillMetas } from "./skill-registry.js";

import { detectRepository } from "./repo-detector.js";

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
  return value.toLowerCase().trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function tokenize(value: string): Set<string> {
  return new Set(
    normalize(value)
      .split(/[^a-z0-9#+.]+/)
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
      `(^|[^a-z0-9])${escapeRegExp(needle)}([^a-z0-9]|$)`,
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

const SLOT_LIMITS: Partial<Record<SkillKind, number>> = {
  process: 2,
  domain: 2,
  language: 1,
  framework: 2,
  quality: 1,
  meta: 0,
};

const KIND_ORDER: SkillKind[] = [
  "process",
  "domain",
  "language",
  "framework",
  "quality",
  "meta",
];

export interface ResolveOverrides {
  include?: string[];
  exclude?: string[];
}

export async function resolveSkills(
  task: string,
  profileName: string,
  root = process.cwd(),
  overrides: ResolveOverrides = {},
): Promise<ResolveResult> {
  const profile = await resolveProfile(profileName);

  const repo = await detectRepository(root);

  const query = buildQuery(task);

  const excluded = new Set(overrides.exclude ?? []);

  const forced = new Set(
    (overrides.include ?? []).filter((id) => !excluded.has(id)),
  );

  const always = profile.always.filter((id) => !excluded.has(id));

  const candidatePool = [
    ...new Set([...profile.pool, ...(overrides.include ?? [])]),
  ].filter((id) => !excluded.has(id) && !always.includes(id));

  const metas = await loadSkillMetas(candidatePool);

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

  const selectable = scored.filter((item) => item.rejection === undefined);

  const selected: ScoredSkill[] = [];

  const selectedIds = new Set<string>();

  const countByKind = new Map<SkillKind, number>();

  for (const kind of KIND_ORDER) {
    const limit = SLOT_LIMITS[kind] ?? 0;

    const candidates = selectable.filter((item) => item.kind === kind);

    for (const candidate of candidates) {
      if (candidate.score < SCORE_THRESHOLD) {
        candidate.rejection =
          `score ${candidate.score.toFixed(1)} < ${SCORE_THRESHOLD}`;
        continue;
      }

      if (limit <= 0) {
        candidate.rejection = `category "${kind}" is not auto-selected`;
        continue;
      }

      const current = countByKind.get(kind) ?? 0;

      if (current >= limit) {
        candidate.rejection = `category "${kind}" limit ${limit} reached`;
        continue;
      }

      if (selected.length >= profile.maxAutoSkills) {
        candidate.rejection =
          `max_auto_skills ${profile.maxAutoSkills} reached`;
        continue;
      }

      candidate.selected = true;
      selected.push(candidate);
      selectedIds.add(candidate.id);
      countByKind.set(kind, current + 1);
    }
  }

  /*
   * Skills listed in `.agent-skills.yaml` include are an
   * explicit request. They bypass the score threshold and
   * the category / max_auto_skills limits.
   */
  for (const id of forced) {
    if (selectedIds.has(id) || always.includes(id)) {
      continue;
    }

    const item = scored.find((entry) => entry.id === id);

    if (!item) {
      continue;
    }

    item.selected = true;
    item.rejection = undefined;
    item.reasons.unshift("config include (forced)");

    selected.push(item);
    selectedIds.add(id);
  }

  return {
    profile,
    repo,
    always,
    selected,
    candidates: scored,
  };
}
