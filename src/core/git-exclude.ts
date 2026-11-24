import type { BootstrapTransaction } from "./bootstrap-transaction.js";
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
  root: string,
  transaction: BootstrapTransaction
): Promise<void> {
  const file =
    await getExcludeFile(root);

  if (!file) {
    return;
  }

  await transaction.directory(path.dirname(file));

  let content = "";

  try {
    content =
      await fs.readFile(
        file,
        "utf8"
      );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
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

  await transaction.writeFile(file, content);
}

function escapeRegExp(
  value: string
): string {
  return value.replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&"
  );
}
