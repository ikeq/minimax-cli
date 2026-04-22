import { promises as fs } from 'node:fs';

/** Resolve-safe `fs.access`, returning a boolean instead of throwing. */
export async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}
