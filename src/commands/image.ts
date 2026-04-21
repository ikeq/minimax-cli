import { promises as fs } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { loadConfig } from '../utils/config.js';
import {
  ASPECT_RATIOS,
  type AspectRatio,
  generateImage,
} from '../utils/api.js';

export type ImageFormat = 'png' | 'jpg' | 'webp';
export const IMAGE_FORMATS: ImageFormat[] = ['png', 'jpg', 'webp'];

export interface ImageCommandOptions {
  output: string;
  aspectRatio: string;
  n: string | number;
  format: string;
  reference?: string[];
  debug?: boolean;
}

/**
 * Implementation of `minimax image <prompt>`.
 *
 * Behaviour:
 *   - Requires a prior `init` so region / token / imageModel are set.
 *   - Requests base64 from the API, then uses sharp to transcode.
 *   - `--output` is a file path. If it has one of the supported
 *     extensions (png / jpg / jpeg / webp), that extension wins over
 *     `-f`. Otherwise the chosen `-f` decides.
 *   - When n > 1, files are numbered `<base>-1.<ext>`, `<base>-2.<ext>`, …
 */
export async function runImage(
  prompt: string,
  opts: ImageCommandOptions,
): Promise<void> {
  // 1. Load and validate config
  const config = await loadConfig();
  if (!config.region || !config.token || !config.imageModel) {
    throw new Error(
      'Config is incomplete. Run `minimax init` first to set region / token / imageModel.',
    );
  }

  // 2. Validate arguments
  if (!prompt || prompt.trim() === '') {
    throw new Error('prompt must not be empty');
  }

  const aspectRatio = opts.aspectRatio as AspectRatio;
  if (!ASPECT_RATIOS.includes(aspectRatio)) {
    throw new Error(
      `Invalid --aspect-ratio "${opts.aspectRatio}". Allowed: ${ASPECT_RATIOS.join(', ')}`,
    );
  }

  const n = Number(opts.n);
  if (!Number.isInteger(n) || n < 1 || n > 9) {
    throw new Error(`-n must be an integer between 1 and 9, got: ${opts.n}`);
  }

  if (!opts.output || opts.output.trim() === '') {
    throw new Error('--output must not be empty');
  }

  // Resolve the final format: extension in --output wins over --format.
  const { base, format } = resolveOutputTarget(opts.output, opts.format);

  // Validate reference URLs, if any.
  const references = (opts.reference ?? []).map((u) => u.trim()).filter(Boolean);
  for (const url of references) {
    if (!/^https?:\/\//.test(url)) {
      throw new Error(
        `--reference must contain http(s) URLs, got: ${url}`,
      );
    }
  }

  // Refuse to continue if any target file already exists — we never want
  // to overwrite, and the check must happen BEFORE the API call so a
  // mistake costs zero tokens.
  const plannedPaths = planOutputPaths(base, format, n);
  for (const p of plannedPaths) {
    if (await pathExists(p)) {
      throw new Error(
        `Target file already exists: ${p}. Remove it or choose a different --output.`,
      );
    }
  }

  // 3. Call the API
  console.log(`Generating ${n} image(s) at ${aspectRatio} as ${format}...`);
  const result = await generateImage({
    region: config.region,
    token: config.token,
    params: {
      model: config.imageModel,
      prompt,
      aspectRatio,
      n,
      subjectReference:
        references.length > 0
          ? references.map((url) => ({ type: 'character', image_file: url }))
          : undefined,
    },
    debug: opts.debug === true,
  });

  if (result.failedCount > 0) {
    console.warn(
      `⚠️  ${result.failedCount} image(s) blocked by safety check; ${result.successCount} succeeded.`,
    );
  }

  // 4. Transcode with sharp and write to disk.
  // We re-derive paths from the actual image count the server returned,
  // which may be smaller than `n` if some results were filtered.
  const paths = await writeImages(result.images, base, format);

  console.log('\n✅ Saved:');
  for (const p of paths) console.log(`   ${p}`);
}

/**
 * Parse the user-provided `--output` into a base path (no extension)
 * plus the final image format. Extension in `--output` wins over `--format`.
 */
function resolveOutputTarget(
  output: string,
  formatFlag: string,
): { base: string; format: ImageFormat } {
  const absolute = path.resolve(output);
  const ext = path.extname(absolute).toLowerCase(); // includes leading "."

  const fromExt = extToFormat(ext);
  if (fromExt) {
    return {
      base: absolute.slice(0, -ext.length),
      format: fromExt,
    };
  }

  const fallback = (formatFlag || '').toLowerCase() as ImageFormat;
  if (!IMAGE_FORMATS.includes(fallback)) {
    throw new Error(
      `Invalid --format "${formatFlag}". Allowed: ${IMAGE_FORMATS.join(', ')}`,
    );
  }
  return { base: absolute, format: fallback };
}

function extToFormat(ext: string): ImageFormat | undefined {
  switch (ext) {
    case '.png':
      return 'png';
    case '.jpg':
    case '.jpeg':
      return 'jpg';
    case '.webp':
      return 'webp';
    default:
      return undefined;
  }
}

/**
 * Given a base path, format and count, produce the list of target
 * file paths the CLI would write.
 *   n === 1 → `<base>.<format>`
 *   n  >  1 → `<base>-1.<format>` … `<base>-n.<format>`
 */
function planOutputPaths(base: string, format: ImageFormat, n: number): string[] {
  if (n === 1) return [`${base}.${format}`];
  return Array.from({ length: n }, (_, i) => `${base}-${i + 1}.${format}`);
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * Transcode base64 images with sharp and write them to disk.
 * - n == 1: writes `<base>.<format>`
 * - n  > 1: writes `<base>-1.<format>`, `<base>-2.<format>`, ...
 * - Parent directory is created if missing.
 * - Never overwrites: fails if a target path appeared since the
 *   pre-flight check.
 */
async function writeImages(
  base64List: string[],
  base: string,
  format: ImageFormat,
): Promise<string[]> {
  await fs.mkdir(path.dirname(base), { recursive: true });

  const multiple = base64List.length > 1;
  const paths: string[] = [];

  for (let i = 0; i < base64List.length; i++) {
    const suffix = multiple ? `-${i + 1}` : '';
    const target = `${base}${suffix}.${format}`;

    const buf = Buffer.from(base64List[i], 'base64');
    const pipeline = sharp(buf);
    const encoded =
      format === 'png'
        ? await pipeline.png().toBuffer()
        : format === 'jpg'
          ? await pipeline.jpeg().toBuffer()
          : await pipeline.webp().toBuffer();

    // `wx` flag: write-only, fail if already exists.
    await fs.writeFile(target, encoded, { flag: 'wx' });
    paths.push(target);
  }

  return paths;
}
