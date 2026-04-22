import { promises as fs } from 'node:fs';
import path from 'node:path';
import { Command, Option } from 'commander';
import sharp from 'sharp';
import { showHelpOnError } from '../../utils/command.js';
import { loadConfig } from '../../utils/config.js';
import { pathExists } from '../../utils/fs.js';
import {
  ASPECT_RATIOS,
  type AspectRatio,
  STYLE_TYPES,
  type StyleType,
  generateImage,
} from './api.js';

export type ImageFormat = 'png' | 'jpg' | 'webp';
export const IMAGE_FORMATS: ImageFormat[] = ['png', 'jpg', 'webp'];

const DEFAULT_ASPECT_RATIO: AspectRatio = '16:9';

interface ImageCommandOptions {
  output: string;
  n: string | number;
  format: string;
  model?: string;
  aspectRatio?: string;
  width?: string;
  height?: string;
  reference?: string[];
  seed?: string;
  promptOptimizer?: boolean;
  watermark?: boolean;
  styleType?: string;
  styleWeight?: string;
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
async function runImage(
  prompt: string,
  opts: ImageCommandOptions,
): Promise<void> {
  const config = await loadConfig();
  if (!config.region || !config.token) {
    throw new Error(
      'Config is incomplete. Run `minimax init` first to set region / token.',
    );
  }

  if (!prompt || prompt.trim() === '') {
    throw new Error('prompt must not be empty');
  }

  if (!opts.output || opts.output.trim() === '') {
    throw new Error('--output must not be empty');
  }

  const model = (opts.model ?? config.imageModel ?? '').trim();
  if (!model) {
    throw new Error(
      'No image model set. Pass --model, or run `minimax init` to save an imageModel.',
    );
  }

  const width = parseSizeDimension(opts.width, '--width');
  const height = parseSizeDimension(opts.height, '--height');
  if ((width === undefined) !== (height === undefined)) {
    throw new Error('--width and --height must be provided together');
  }

  let aspectRatio: AspectRatio | undefined;
  if (opts.aspectRatio) {
    if (!ASPECT_RATIOS.includes(opts.aspectRatio as AspectRatio)) {
      throw new Error(
        `Invalid --aspect-ratio "${opts.aspectRatio}". Allowed: ${ASPECT_RATIOS.join(', ')}`,
      );
    }
    aspectRatio = opts.aspectRatio as AspectRatio;
  } else if (width === undefined) {
    aspectRatio = DEFAULT_ASPECT_RATIO;
  }

  const n = Number(opts.n);
  if (!Number.isInteger(n) || n < 1 || n > 9) {
    throw new Error(`-n must be an integer between 1 and 9, got: ${opts.n}`);
  }

  const { base, format } = resolveOutputTarget(opts.output, opts.format);

  const references = (opts.reference ?? []).map((u) => u.trim()).filter(Boolean);
  for (const url of references) {
    if (!/^https?:\/\//.test(url)) {
      throw new Error(`--reference must contain http(s) URLs, got: ${url}`);
    }
  }

  let seed: number | undefined;
  if (opts.seed !== undefined && opts.seed !== '') {
    const s = Number(opts.seed);
    if (!Number.isInteger(s)) {
      throw new Error(`--seed must be an integer, got: ${opts.seed}`);
    }
    seed = s;
  }

  let style: { styleType: StyleType; styleWeight?: number } | undefined;
  if (opts.styleType) {
    if (!STYLE_TYPES.includes(opts.styleType as StyleType)) {
      throw new Error(
        `Invalid --style-type "${opts.styleType}". Allowed: ${STYLE_TYPES.join(', ')}`,
      );
    }
    let styleWeight: number | undefined;
    if (opts.styleWeight !== undefined && opts.styleWeight !== '') {
      const w = Number(opts.styleWeight);
      if (!Number.isFinite(w) || w <= 0 || w > 1) {
        throw new Error(
          `--style-weight must be a number in (0, 1], got: ${opts.styleWeight}`,
        );
      }
      styleWeight = w;
    }
    style = { styleType: opts.styleType as StyleType, styleWeight };
  } else if (opts.styleWeight !== undefined) {
    throw new Error('--style-weight has no effect without --style-type');
  }

  // Refuse to overwrite: pre-flight check runs BEFORE the API call so
  // a mistake costs zero tokens.
  const plannedPaths = planOutputPaths(base, format, n);
  for (const p of plannedPaths) {
    if (await pathExists(p)) {
      throw new Error(
        `Target file already exists: ${p}. Remove it or choose a different --output.`,
      );
    }
  }

  const sizeLabel =
    width !== undefined
      ? `${width}x${height}${aspectRatio ? ` (aspect_ratio=${aspectRatio} will win server-side)` : ''}`
      : (aspectRatio ?? DEFAULT_ASPECT_RATIO);
  console.log(
    `Generating ${n} image(s) at ${sizeLabel} as ${format} using ${model}...`,
  );
  const result = await generateImage({
    region: config.region,
    token: config.token,
    params: {
      model,
      prompt,
      aspectRatio,
      width,
      height,
      n,
      subjectReference:
        references.length > 0
          ? references.map((url) => ({ type: 'character', image_file: url }))
          : undefined,
      seed,
      promptOptimizer: opts.promptOptimizer === true ? true : undefined,
      aigcWatermark: opts.watermark === true ? true : undefined,
      style,
    },
    debug: opts.debug === true,
  });

  if (result.failedCount > 0) {
    console.warn(
      `⚠️  ${result.failedCount} image(s) blocked by safety check; ${result.successCount} succeeded.`,
    );
  }

  const paths = await writeImages(result.images, base, format);

  console.log('\n✅ Saved:');
  for (const p of paths) console.log(`   ${p}`);
}

/** Parse a width/height value. Must be an integer in [512, 2048] and a multiple of 8. */
function parseSizeDimension(
  raw: string | undefined,
  label: string,
): number | undefined {
  if (raw === undefined || raw === '') return undefined;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 512 || n > 2048 || n % 8 !== 0) {
    throw new Error(
      `${label} must be an integer in [512, 2048] and a multiple of 8, got: ${raw}`,
    );
  }
  return n;
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
  const ext = path.extname(absolute).toLowerCase();

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

/**
 * Transcode base64 images with sharp and write them to disk.
 * Parent directory is created if missing. Never overwrites (uses `wx`).
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

    await fs.writeFile(target, encoded, { flag: 'wx' });
    paths.push(target);
  }

  return paths;
}

export default function (program: Command): void {
  const cmd = program
    .command('image')
    .description('Text-to-image generation')
    .argument('<prompt>', 'Text description of the image (Required)')
    .addOption(
      new Option(
        '-o, --output <path>',
        'Output file path; parent directory is created if missing. If the path has a .png/.jpg/.jpeg/.webp extension, that extension wins over --format. With -n>1 files are numbered -1, -2, ... (Required)',
      ).makeOptionMandatory(true),
    )
    .addOption(
      new Option(
        '-r, --aspect-ratio <ratio>',
        'Aspect ratio; ignored by the server when --width/--height are set',
      )
        .choices(['1:1', '16:9', '4:3', '3:2', '2:3', '3:4', '9:16', '21:9'])
        .default('16:9'),
    )
    .option('--model <name>', 'Override the saved imageModel')
    .option(
      '--width <pixels>',
      'Image width in pixels, [512, 2048], multiple of 8 (requires --height)',
    )
    .option(
      '--height <pixels>',
      'Image height in pixels, [512, 2048], multiple of 8 (requires --width)',
    )
    .addOption(
      new Option('-n, --number <count>', 'Number of images to generate').default(
        '1',
      ),
    )
    .addOption(
      new Option('-f, --format <format>', 'Output format')
        .choices(['png', 'jpg', 'webp'])
        .default('webp'),
    )
    .option(
      '--reference <urls>',
      'Comma-separated http(s) URLs used as subject references, e.g. img1,img2',
      (raw: string) =>
        raw
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
    )
    .option('--seed <integer>', 'Random seed for reproducible output')
    .option('--prompt-optimizer', 'Enable server-side prompt auto-optimization')
    .option('--watermark', 'Enable the AIGC watermark on generated images')
    .addOption(
      new Option(
        '--style-type <type>',
        'Style preset; only applied when model is image-01-live',
      ).choices(['漫画', '元气', '中世纪', '水彩']),
    )
    .option('--style-weight <number>', 'Style weight in (0, 1], default 0.8')
    .option('--debug', 'Print HTTP request/response for debugging')
    .action(async (prompt: string, opts) => {
      try {
        await runImage(prompt, {
          output: opts.output,
          aspectRatio: opts.aspectRatio,
          width: opts.width,
          height: opts.height,
          n: opts.number,
          format: opts.format,
          model: opts.model,
          reference: opts.reference,
          seed: opts.seed,
          promptOptimizer: opts.promptOptimizer,
          watermark: opts.watermark,
          styleType: opts.styleType,
          styleWeight: opts.styleWeight,
          debug: opts.debug,
        });
      } catch (err) {
        console.error(
          'Image generation failed:',
          err instanceof Error ? err.message : err,
        );
        process.exit(1);
      }
    });

  showHelpOnError(cmd);
}
