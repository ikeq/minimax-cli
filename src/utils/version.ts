import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

interface PackageJson {
  name?: string;
  version?: string;
}

/**
 * Resolve the CLI's own version by `require()`-ing the nearest
 * `package.json`. The path differs between layouts:
 *   - dev (tsx):   src/utils/version.ts → ../../package.json
 *   - prod (tsup): dist/index.js        → ../package.json
 * so we try a few sensible candidates and pick the one whose name
 * matches this package (guards against accidentally reading a parent
 * monorepo's package.json).
 */
function loadVersion(): string {
  for (const rel of ['../package.json', '../../package.json']) {
    try {
      const pkg = require(rel) as PackageJson;
      if (pkg.name === '@ikeq/minimax-cli' && pkg.version) return pkg.version;
    } catch {
      // Keep looking.
    }
  }
  return '0.0.0';
}

export const VERSION = loadVersion();
