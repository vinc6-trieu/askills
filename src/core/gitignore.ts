import fs from "node:fs/promises";
import path from "node:path";

const GENERATED_ENTRIES = [
  ".askills/",
  ".agents/skills/askills--*",

  // Legacy path from previous askills implementation.
  ".agents/skills/askills-generated/"
];

export async function ensureAskillsGitignore(
  root = process.cwd()
): Promise<void> {
  const file = path.join(
    root,
    ".gitignore"
  );

  let content = "";

  try {
    content = await fs.readFile(
      file,
      "utf8"
    );
  } catch {
    // .gitignore does not exist yet.
  }

  const existing = new Set(
    content
      .split(/\r?\n/)
      .map(line => line.trim())
  );

  const missing =
    GENERATED_ENTRIES.filter(
      entry => !existing.has(entry)
    );

  if (missing.length === 0) {
    return;
  }

  let next = content;

  if (
    next.length > 0 &&
    !next.endsWith("\n")
  ) {
    next += "\n";
  }

  next += "\n# askills generated runtime\n";

  for (const entry of missing) {
    next += `${entry}\n`;
  }

  await fs.writeFile(
    file,
    next,
    "utf8"
  );
}
