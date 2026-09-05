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
