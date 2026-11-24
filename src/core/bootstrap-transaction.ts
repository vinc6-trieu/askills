import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { loadProjectLock, writeProjectLock } from "./project-lock.js";
import { createRegistryContext, prepareProjectLock } from "./registry-config.js";
import type { RegistryContext } from "./registry-context.js";

function missing(error: unknown) {
  return (error as NodeJS.ErrnoException).code === "ENOENT";
}

/** Keep backups on the destination filesystem so restoring links/directories is a rename. */
export class BootstrapTransaction {
  private readonly undo: Array<() => Promise<void>> = [];
  private readonly backups: string[] = [];

  async remove(target: string) {
    const backup = path.join(path.dirname(target), ".askills-backup-" + randomUUID());
    try {
      await fs.rename(target, backup);
    } catch (error) {
      if (missing(error)) return;
      throw error;
    }
    this.backups.push(backup);
    this.undo.push(() => fs.rename(backup, target));
  }

  async directory(target: string) {
    // Only remove directories created by this transaction, and only if empty.
    const first = await fs.mkdir(target, { recursive: true });
    if (!first) return;
    this.undo.push(async () => {
      let leaf = path.resolve(target);
      for (;;) {
        await fs.rmdir(leaf).catch(error => {
          if (!missing(error) && error.code !== "ENOTEMPTY" && error.code !== "EEXIST") throw error;
        });
        if (leaf === path.resolve(first)) break;
        leaf = path.dirname(leaf);
      }
    });
  }

  async link(source: string, target: string) {
    await this.directory(path.dirname(target));
    await this.remove(target);
    await fs.symlink(source, target, process.platform === "win32" ? "junction" : "dir");
    this.undo.push(() => fs.unlink(target));
  }

  async writeFile(file: string, content: string) {
    const stat = await fs.stat(file).catch(error => { if (!missing(error)) throw error; });
    if (stat && !stat.isFile()) throw new Error(`Expected a regular file at ${file}`);
    // Preserve project-owned symlinks to guides and ignore files.
    const target = stat ? await fs.realpath(file) : file;
    const previous = stat ? await fs.readFile(target) : undefined;
    if (previous?.equals(Buffer.from(content))) return;
    const write = async (data: string | Buffer) => {
      const tmp = path.join(path.dirname(target), ".askills-write-" + randomUUID());
      try {
        await fs.writeFile(tmp, data, {flag:"wx", mode:stat?.mode});
        if (stat) await fs.chmod(tmp, stat.mode & 0o777);
        await fs.rename(tmp, target);
      } finally {
        await fs.rm(tmp, {force:true});
      }
    };
    await write(content);
    this.undo.push(() => previous === undefined ? fs.unlink(target) : write(previous));
  }

  async rollback() {
    const errors = [];
    for (const restore of this.undo.reverse()) {
      try { await restore(); } catch (error) { errors.push(error); }
    }
    if (errors.length) throw new AggregateError(errors, "Could not fully restore bootstrap outputs. Inspect remaining .askills-backup-* files.");
  }

  async cleanup() {
    for (const backup of this.backups) await fs.rm(backup, {recursive:true,force:true});
  }
}

export async function withProjectBootstrap<T>(root: string, update: boolean,
  apply: (context: RegistryContext, transaction: BootstrapTransaction) => Promise<T>): Promise<T> {
  const runtime = path.join(root, ".askills");
  await fs.mkdir(runtime, {recursive:true});
  const guard = path.join(runtime, "bootstrap.lock");
  try {
    await fs.mkdir(guard);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      throw new Error(`Bootstrap already in progress at ${root}. If it was interrupted, check for a running bootstrap before removing ${guard} and retrying.`);
    }
    throw error;
  }
  try {
    const previous = await loadProjectLock(root);
    const next = update || !previous ? await prepareProjectLock(root) : previous;
    const context = await createRegistryContext(root, {lock:next});
    const transaction = new BootstrapTransaction();
    let result: T;
    try {
      result = await apply(context, transaction);
      if (JSON.stringify(previous) !== JSON.stringify(next)) await writeProjectLock(next, root);
    } catch (error) {
      try { await transaction.rollback(); } catch (restoreError) {
        throw new AggregateError([error, restoreError], `Bootstrap failed and rollback needs attention at ${root}`);
      }
      throw error;
    }
    await transaction.cleanup().catch(error => console.warn("Bootstrap completed with backup cleanup pending:", error.message));
    return result;
  } finally {
    await fs.rmdir(guard);
  }
}
