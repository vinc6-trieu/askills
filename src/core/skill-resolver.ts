import { resolveProfile } from "./profile-resolver.js";

import { loadSkillMetas } from "./skill-registry.js";

import { detectRepository } from "./repo-detector.js";

import type {
  ResolveResult,
  ScoredSkill,
  SkillKind,
  SkillMeta,
} from "./types.js";

function normalize(value: string): string {
  return value.toLowerCase().trim();
}

function includesText(task: string, candidate: string): boolean {
  return task.includes(normalize(candidate));
}

function intersection(a: string[], b: string[]): string[] {
  const right = new Set(b.map(normalize));

  return a.map(normalize).filter((value) => right.has(value));
}

function scoreSkill(
  taskRaw: string,
  meta: SkillMeta,
  repo: Awaited<ReturnType<typeof detectRepository>>,
): ScoredSkill {
  const task = normalize(taskRaw);

  let score = 0;

  const reasons: string[] = [];

  if (includesText(task, meta.id)) {
    score += 100;
    reasons.push("explicit skill match");
  }

  for (const intent of meta.intents ?? []) {
    if (includesText(task, intent)) {
      score += 35;
      reasons.push(`intent:${intent}`);
    }
  }

  let keywordScore = 0;

  for (const keyword of meta.keywords ?? []) {
    if (includesText(task, keyword)) {
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

  score += Math.min(meta.priority ?? 0, 100) / 10;

  return {
    id: meta.id,
    kind: meta.kind,
    score,
    reasons,
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

  const excluded = new Set(overrides.exclude ?? []);

  const always = profile.always.filter((id) => !excluded.has(id));

  const candidatePool = [
    ...new Set([...profile.pool, ...(overrides.include ?? [])]),
  ].filter((id) => !excluded.has(id) && !always.includes(id));

  const metas = await loadSkillMetas(candidatePool);

  const scored: ScoredSkill[] = [];

  for (const meta of metas.values()) {
    if (meta.auto === false) {
      continue;
    }

    scored.push(scoreSkill(task, meta, repo));
  }

  scored.sort((a, b) => b.score - a.score);

  const selected: ScoredSkill[] = [];

  const countByKind = new Map<SkillKind, number>();

  for (const kind of KIND_ORDER) {
    const limit = SLOT_LIMITS[kind] ?? 0;

    if (limit <= 0) {
      continue;
    }

    const candidates = scored.filter(
      (item) => item.kind === kind && item.score >= 15,
    );

    for (const candidate of candidates) {
      const current = countByKind.get(kind) ?? 0;

      if (current >= limit) {
        break;
      }

      if (selected.length >= profile.maxAutoSkills) {
        break;
      }

      selected.push(candidate);

      countByKind.set(kind, current + 1);
    }
  }

  return {
    profile,
    repo,
    always,
    selected,
  };
}
