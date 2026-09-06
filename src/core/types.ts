export type SkillKind =
  | "process"
  | "domain"
  | "language"
  | "framework"
  | "quality"
  | "meta";

export interface SkillMeta {
  id: string;
  kind: SkillKind;

  intents?: string[];
  keywords?: string[];

  languages?: string[];
  frameworks?: string[];

  repo_signals?: {
    files?: string[];
    dependencies?: string[];
  };

  paths?: string[];

  stages?: string[];

  priority?: number;

  auto?: boolean;
}

export interface SkillIndexEntry {
  id: string;
  name?: string;
  kind?: SkillKind;
  description?: string;
  path: string;
  priority?: number;
}

export interface ProfileFile {
  name: string;

  extends?: string[];

  always?: string[];

  pool?: string[];

  policy?: {
    max_auto_skills?: number;
  };
}

export interface ResolvedProfile {
  name: string;

  always: string[];

  pool: string[];

  maxAutoSkills: number;
}

export interface RepoContext {
  root: string;

  languages: string[];

  frameworks: string[];

  dependencies: string[];

  files: string[];

  /*
   * Best guess at the repository's primary language,
   * taken from the root manifest when there is one,
   * otherwise the most common language across detected
   * sub-projects. Used to bias profile detection in
   * polyglot repositories.
   */
  primaryLanguage?: string;
}

export interface ScoredSkill {
  id: string;

  kind: SkillKind;

  score: number;

  reasons: string[];

  priority: number;

  /*
   * Populated by the resolver after selection.
   */
  selected?: boolean;

  rejection?: string;
}

export interface ResolveResult {
  profile: ResolvedProfile;

  repo: RepoContext;

  always: string[];

  selected: ScoredSkill[];

  /*
   * Every scored candidate, sorted best-first and
   * annotated with selected / rejection. Used by
   * `askills resolve --verbose`.
   */
  candidates: ScoredSkill[];
}
