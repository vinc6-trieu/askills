import pc from "picocolors";

import {
  resolveSkills,
  type ResolveOverrides
} from "../core/skill-resolver.js";

import {
  projectConfigExists,
  loadProjectConfig
} from "../core/project-config.js";

interface ResolveOptions {
  profile?: string;
  verbose?: boolean;
}

export async function resolveCommand(
  task: string,
  options: ResolveOptions
): Promise<void> {
  const root = process.cwd();

  let profile = options.profile ?? "coding";
  let overrides: ResolveOverrides = {};
  let configProfile = false;

  if (await projectConfigExists(root)) {
    const config =
      await loadProjectConfig(root);

    if (!options.profile) {
      profile = config.profile;
      configProfile = true;
    }

    overrides = {
      include:
        config.skills?.include ?? [],

      exclude:
        config.skills?.exclude ?? []
    };
  }

  const result = await resolveSkills(
    task,
    profile,
    root,
    overrides
  );

  console.log();
  console.log(pc.bold("Askills Resolver"));
  console.log();

  console.log(
    `Profile: ${pc.cyan(result.profile.name)}` +
    (configProfile
      ? pc.dim(" (.agent-skills.yaml)")
      : "")
  );

  if ((overrides.include ?? []).length > 0) {
    console.log(
      `Include: ${
        (overrides.include ?? []).join(", ")
      }`
    );
  }

  if ((overrides.exclude ?? []).length > 0) {
    console.log(
      `Exclude: ${
        (overrides.exclude ?? []).join(", ")
      }`
    );
  }

  console.log();
  console.log(pc.bold("Repository"));

  console.log(
    `  Languages: ${
      result.repo.languages.join(", ") || "-"
    }` +
    (result.repo.primaryLanguage
      ? pc.dim(
          ` (primary: ${result.repo.primaryLanguage})`
        )
      : "")
  );

  console.log(
    `  Frameworks: ${
      result.repo.frameworks.join(", ") || "-"
    }`
  );

  console.log();
  console.log(pc.bold("Always"));

  for (const skill of result.always) {
    console.log(
      `  ${pc.green("✓")} ${skill}`
    );
  }

  console.log();
  console.log(pc.bold("Selected skills"));

  for (const skill of result.selected) {
    console.log(
      `  ${pc.green("✓")} ${skill.id} ` +
      pc.dim(`(${skill.score.toFixed(1)})`)
    );

    if (skill.reasons.length > 0) {
      console.log(
        pc.dim(
          `      ${skill.reasons.join(", ")}`
        )
      );
    }
  }

  if (options.verbose) {
    const rejected = result.candidates.filter(
      skill => !skill.selected
    );

    console.log();
    console.log(pc.bold("Not selected"));

    if (rejected.length === 0) {
      console.log(pc.dim("  (none)"));
    }

    for (const skill of rejected) {
      console.log(
        `  ${pc.dim("·")} ${skill.id} ` +
        pc.dim(
          `(${skill.score.toFixed(1)}) — ${
            skill.rejection ?? "not selected"
          }`
        )
      );

      if (skill.reasons.length > 0) {
        console.log(
          pc.dim(
            `      ${skill.reasons.join(", ")}`
          )
        );
      }
    }
  }

  console.log();

  console.log(
    pc.dim(
      `${
        result.always.length +
        result.selected.length
      } skills total`
    )
  );
}
