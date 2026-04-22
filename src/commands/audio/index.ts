import { promises as fs } from 'node:fs';
import path from 'node:path';
import { Command, Option } from 'commander';
import { showHelpOnError } from '../../utils/command.js';
import { loadConfig } from '../../utils/config.js';
import { assertAbsolutePath, pathExists } from '../../utils/fs.js';
import {
  parseEnumInt,
  parseInteger,
  parseNumber,
} from '../../utils/parse.js';
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
} from './api.js';

interface AudioCommandOptions {
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
async function runAudio(
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
  assertAbsolutePath(opts.output, '--output');

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

  const { target, format } = resolveOutputTarget(opts.output, opts.format);

  const emotion = opts.emotion ? (opts.emotion as Emotion) : undefined;
  if (emotion && !EMOTIONS.includes(emotion)) {
    throw new Error(
      `Invalid --emotion "${opts.emotion}". Allowed: ${EMOTIONS.join(', ')}`,
    );
  }
  const speed = parseNumber(opts.speed, '--speed', 0.5, 2);
  const vol = parseNumber(opts.volume, '--volume', 0.000001, 10);
  const pitch = parseInteger(opts.pitch, '--pitch', -12, 12);

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
  const channel = parseEnumInt(opts.channel, '--channel', AUDIO_CHANNELS) as
    | AudioChannel
    | undefined;

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

export default function (program: Command): void {
  const cmd = program
    .command('audio')
    .description('Text-to-audio generation')
    .argument('<text>', 'Text to synthesize (Required)')
    .addOption(
      new Option(
        '-o, --output <path>',
        'Absolute output file path; parent directory is created if missing. If the path has a .mp3/.wav/.pcm/.flac extension, that extension wins over --format (Required)',
      ).makeOptionMandatory(true),
    )
    .option('--model <name>', 'Override the saved audioModel')
    .addOption(
      new Option('-f, --format <format>', 'Output format')
        .choices(['mp3', 'wav', 'pcm', 'flac'])
        .default('mp3'),
    )
    .option('--voice <voice-id>', 'Override the saved voiceId')
    .addOption(
      new Option('--emotion <emotion>', 'Voice emotion').choices([
        'happy',
        'sad',
        'angry',
        'fearful',
        'disgusted',
        'surprised',
        'calm',
        'fluent',
        'whisper',
      ]),
    )
    .option('--speed <number>', 'Speaking speed, [0.5, 2], default 1.0')
    .option('--volume <number>', 'Volume, (0, 10], default 1.0')
    .option('--pitch <integer>', 'Pitch, [-12, 12], default 0')
    .addOption(
      new Option('--sample-rate <hz>', 'Sample rate').choices([
        '8000',
        '16000',
        '22050',
        '24000',
        '32000',
        '44100',
      ]),
    )
    .addOption(
      new Option('--bitrate <bps>', 'Bitrate').choices([
        '32000',
        '64000',
        '128000',
        '256000',
      ]),
    )
    .addOption(
      new Option('--channel <n>', 'Audio channel count').choices(['1', '2']),
    )
    .option('--debug', 'Print HTTP request/response for debugging')
    .action(async (text: string, opts) => {
      try {
        await runAudio(text, {
          output: opts.output,
          format: opts.format,
          model: opts.model,
          voice: opts.voice,
          emotion: opts.emotion,
          speed: opts.speed,
          volume: opts.volume,
          pitch: opts.pitch,
          sampleRate: opts.sampleRate,
          bitrate: opts.bitrate,
          channel: opts.channel,
          debug: opts.debug,
        });
      } catch (err) {
        console.error(
          'Audio generation failed:',
          err instanceof Error ? err.message : err,
        );
        process.exit(1);
      }
    });

  showHelpOnError(cmd);
}
