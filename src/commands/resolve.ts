import pc from "picocolors";

import {
  resolveSkills
} from "../core/skill-resolver.js";

interface ResolveOptions {
  profile?: string;
}

export async function resolveCommand(
  task: string,
  options: ResolveOptions
): Promise<void> {
  const profile = options.profile ?? "coding";

  const result = await resolveSkills(
    task,
    profile
  );

  console.log();
  console.log(pc.bold("Askills Resolver"));
  console.log();

  console.log(
    `Profile: ${pc.cyan(result.profile.name)}`
  );

  console.log();
  console.log(pc.bold("Repository"));

  console.log(
    `  Languages: ${
      result.repo.languages.join(", ") || "-"
    }`
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
