import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync =
  promisify(execFile);

const START =
  "# >>> askills generated >>>";

const END =
  "# <<< askills generated <<<";

async function getExcludeFile(
  root: string
): Promise<string | null> {
  try {
    const { stdout } =
      await execFileAsync(
        "git",
        [
          "rev-parse",
          "--git-path",
          "info/exclude"
        ],
        {
          cwd: root
        }
      );

    const result =
      stdout.trim();

    if (!result) {
      return null;
    }

    return path.isAbsolute(result)
      ? result
      : path.resolve(
          root,
          result
        );
  } catch {
    /*
     * Non-Git repositories are still
     * allowed to use askills.
     */
    return null;
  }
}

export async function writeAskillsLocalExcludes(
  entries: string[],
  root = process.cwd()
): Promise<void> {
  const file =
    await getExcludeFile(root);

  if (!file) {
    return;
  }

  await fs.mkdir(
    path.dirname(file),
    {
      recursive: true
    }
  );

  let content = "";

  try {
    content =
      await fs.readFile(
        file,
        "utf8"
      );
  } catch {
    // File may not exist yet.
  }

  const blockPattern =
    new RegExp(
      `${escapeRegExp(START)}[\\s\\S]*?${escapeRegExp(END)}\\n?`,
      "g"
    );

  content =
    content.replace(
      blockPattern,
      ""
    );

  if (
    content.length > 0 &&
    !content.endsWith("\n")
  ) {
    content += "\n";
  }

  const unique =
    [...new Set(entries)]
      .sort();

  if (unique.length > 0) {
    content += "\n";
    content += `${START}\n`;

    for (const entry of unique) {
      content += `${entry}\n`;
    }

    content += `${END}\n`;
  }

  await fs.writeFile(
    file,
    content,
    "utf8"
  );
}

function escapeRegExp(
  value: string
): string {
  return value.replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&"
  );
}
