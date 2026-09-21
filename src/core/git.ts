import {
  spawn
} from "node:child_process";

export async function runGit(
  args: string[]
): Promise<void> {
  await new Promise<void>(
    (resolve, reject) => {
      const child = spawn(
        "git",
        args,
        {
          stdio: "inherit"
        }
      );

      child.on(
        "error",
        reject
      );

      child.on(
        "exit",
        code => {
          if (code === 0) {
            resolve();
            return;
          }

          reject(
            new Error(
              `git exited with code ${code}`
            )
          );
        }
      );
    }
  );
}

export async function runGitOutput(
  args: string[]
): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const child = spawn("git", args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", chunk => { stdout += String(chunk); });
    child.stderr.on("data", chunk => { stderr += String(chunk); });
    child.on("error", reject);
    child.on("exit", code => {
      if (code === 0) {
        resolve(stdout.trim());
        return;
      }

      reject(new Error(`git ${args.join(" ")} failed: ${stderr.trim() || `exit ${code}`}`));
    });
  });
}
