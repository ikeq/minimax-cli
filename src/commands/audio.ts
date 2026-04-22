import { promises as fs } from 'node:fs';
import path from 'node:path';
import { loadConfig } from '../utils/config.js';
import {
  AUDIO_BITRATES,
  AUDIO_CHANNELS,
  AUDIO_FORMATS,
  AUDIO_SAMPLE_RATES,
  type AudioBitrate,
  type AudioChannel,
  type AudioFormat,
  type AudioSampleRate,
  EMOTIONS,
  type Emotion,
  generateAudio,
} from '../utils/api.js';

export interface AudioCommandOptions {
  output: string;
  format?: string;
  model?: string;
  voice?: string;
  emotion?: string;
  speed?: string;
  volume?: string;
  pitch?: string;
  sampleRate?: string;
  bitrate?: string;
  channel?: string;
  debug?: boolean;
}

/**
 * Implementation of `minimax audio <text>`.
 *
 * Behaviour mirrors `image` for output handling:
 *   - `--output` is a file path. If it has an extension that matches a
 *     supported audio format (.mp3/.wav/.pcm/.flac), that extension
 *     wins over `--format`.
 *   - Never overwrites: a pre-flight existence check runs BEFORE the
 *     API call so a mistake costs zero tokens.
 *   - `--model` and `--voice` default to the values set by `init`
 *     (`audioModel` / `voiceId`). Command-line flags override them.
 */
export async function runAudio(
  text: string,
  opts: AudioCommandOptions,
): Promise<void> {
  const config = await loadConfig();
  if (!config.region || !config.token) {
    throw new Error(
      'Config is incomplete. Run `minimax init` first to set region / token.',
    );
  }

  if (!text || text.trim() === '') {
    throw new Error('text must not be empty');
  }

  if (!opts.output || opts.output.trim() === '') {
    throw new Error('--output must not be empty');
  }

  const model = (opts.model ?? config.audioModel ?? '').trim();
  if (!model) {
    throw new Error(
      'No audio model set. Pass --model, or run `minimax init` to save an audioModel.',
    );
  }

  const voiceId = (opts.voice ?? config.voiceId ?? '').trim();
  if (!voiceId) {
    throw new Error(
      'No voice set. Pass --voice, or run `minimax init` to save a voiceId.',
    );
  }

  // Resolve output path and final format. Extension wins over --format.
  const { target, format } = resolveOutputTarget(opts.output, opts.format);

  // Validate optional voice fields.
  const emotion = opts.emotion ? (opts.emotion as Emotion) : undefined;
  if (emotion && !EMOTIONS.includes(emotion)) {
    throw new Error(
      `Invalid --emotion "${opts.emotion}". Allowed: ${EMOTIONS.join(', ')}`,
    );
  }
  const speed = parseNumber(opts.speed, '--speed', 0.5, 2);
  const vol = parseNumber(opts.volume, '--volume', 0.000001, 10);
  const pitch = parseInteger(opts.pitch, '--pitch', -12, 12);

  // Validate optional audio settings.
  const sampleRate = parseEnumInt(
    opts.sampleRate,
    '--sample-rate',
    AUDIO_SAMPLE_RATES,
  ) as AudioSampleRate | undefined;
  const bitrate = parseEnumInt(
    opts.bitrate,
    '--bitrate',
    AUDIO_BITRATES,
  ) as AudioBitrate | undefined;
  const channel = parseEnumInt(
    opts.channel,
    '--channel',
    AUDIO_CHANNELS,
  ) as AudioChannel | undefined;

  // Pre-flight existence check — never overwrite.
  if (await pathExists(target)) {
    throw new Error(
      `Target file already exists: ${target}. Remove it or choose a different --output.`,
    );
  }

  console.log(`Generating audio as ${format} using ${model} / ${voiceId}...`);
  const result = await generateAudio({
    region: config.region,
    token: config.token,
    params: {
      model,
      text,
      voice: { voiceId, speed, vol, pitch, emotion },
      audio: { format, sampleRate, bitrate, channel },
    },
    debug: opts.debug === true,
  });

  await fs.mkdir(path.dirname(target), { recursive: true });
  // `wx` flag: write-only, fail if already exists.
  await fs.writeFile(target, result.buffer, { flag: 'wx' });

  console.log(`\n✅ Saved: ${target}`);
}

/** Parse the --output path into (absolute target, resolved format). */
function resolveOutputTarget(
  output: string,
  formatFlag: string | undefined,
): { target: string; format: AudioFormat } {
  const absolute = path.resolve(output);
  const ext = path.extname(absolute).toLowerCase();

  const fromExt = extToFormat(ext);
  if (fromExt) {
    return { target: absolute, format: fromExt };
  }

  const fallback = ((formatFlag ?? 'mp3') || 'mp3').toLowerCase() as AudioFormat;
  if (!AUDIO_FORMATS.includes(fallback)) {
    throw new Error(
      `Invalid --format "${formatFlag}". Allowed: ${AUDIO_FORMATS.join(', ')}`,
    );
  }
  return { target: `${absolute}.${fallback}`, format: fallback };
}

function extToFormat(ext: string): AudioFormat | undefined {
  switch (ext) {
    case '.mp3':
      return 'mp3';
    case '.wav':
      return 'wav';
    case '.pcm':
      return 'pcm';
    case '.flac':
      return 'flac';
    default:
      return undefined;
  }
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

function parseNumber(
  raw: string | undefined,
  label: string,
  min: number,
  max: number,
): number | undefined {
  if (raw === undefined || raw === '') return undefined;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < min || n > max) {
    throw new Error(`${label} must be a number in [${min}, ${max}], got: ${raw}`);
  }
  return n;
}

function parseInteger(
  raw: string | undefined,
  label: string,
  min: number,
  max: number,
): number | undefined {
  if (raw === undefined || raw === '') return undefined;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new Error(
      `${label} must be an integer in [${min}, ${max}], got: ${raw}`,
    );
  }
  return n;
}

function parseEnumInt(
  raw: string | undefined,
  label: string,
  allowed: readonly number[],
): number | undefined {
  if (raw === undefined || raw === '') return undefined;
  const n = Number(raw);
  if (!Number.isInteger(n) || !allowed.includes(n)) {
    throw new Error(
      `${label} must be one of ${allowed.join(', ')}, got: ${raw}`,
    );
  }
  return n;
}
