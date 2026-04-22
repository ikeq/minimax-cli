import { promises as fs } from 'node:fs';
import path from 'node:path';

/** Resolve-safe `fs.access`, returning a boolean instead of throwing. */
export async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * Guard for `--output`-style flags: the value must be an absolute path
 * (e.g. starts with `/` on POSIX, `C:\` on Windows). This prevents
 * accidents like the user pasting a commit trailer or free-form text,
 * which `path.resolve` would otherwise silently glue onto `cwd`.
 */
export function assertAbsolutePath(raw: string, label: string): void {
  if (!path.isAbsolute(raw)) {
    throw new Error(
      `${label} must be an absolute path, got: ${JSON.stringify(raw)}`,
    );
  }
}
