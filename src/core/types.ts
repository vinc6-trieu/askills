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
}

export interface ScoredSkill {
  id: string;

  kind: SkillKind;

  score: number;

  reasons: string[];
}

export interface ResolveResult {
  profile: ResolvedProfile;

  repo: RepoContext;

  always: string[];

  selected: ScoredSkill[];
}
