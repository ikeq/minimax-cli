import type { Region } from '../../utils/config.js';
import {
  type BaseResp,
  assertBaseResp,
  getBaseUrl,
  postJson,
} from '../../utils/http.js';

export type AudioFormat = 'mp3' | 'pcm' | 'flac' | 'wav';
export const AUDIO_FORMATS: AudioFormat[] = ['mp3', 'pcm', 'flac', 'wav'];

export type Emotion =
  | 'happy'
  | 'sad'
  | 'angry'
  | 'fearful'
  | 'disgusted'
  | 'surprised'
  | 'calm'
  | 'fluent'
  | 'whisper';
export const EMOTIONS: Emotion[] = [
  'happy',
  'sad',
  'angry',
  'fearful',
  'disgusted',
  'surprised',
  'calm',
  'fluent',
  'whisper',
];

export const AUDIO_SAMPLE_RATES = [
  8000, 16000, 22050, 24000, 32000, 44100,
] as const;
export type AudioSampleRate = (typeof AUDIO_SAMPLE_RATES)[number];

export const AUDIO_BITRATES = [32000, 64000, 128000, 256000] as const;
export type AudioBitrate = (typeof AUDIO_BITRATES)[number];

export const AUDIO_CHANNELS = [1, 2] as const;
export type AudioChannel = (typeof AUDIO_CHANNELS)[number];

export interface VoiceSetting {
  voiceId: string;
  speed?: number;
  vol?: number;
  pitch?: number;
  emotion?: Emotion;
}

export interface AudioSetting {
  format?: AudioFormat;
  sampleRate?: AudioSampleRate;
  bitrate?: AudioBitrate;
  channel?: AudioChannel;
}

export interface AudioGenerationParams {
  model: string;
  text: string;
  voice: VoiceSetting;
  audio?: AudioSetting;
}

export interface AudioGenerationResult {
  /** Decoded audio bytes ready to write to disk. */
  buffer: Buffer;
  format: AudioFormat;
  extra?: Record<string, unknown>;
  traceId?: string;
}

interface RawAudioResponse extends BaseResp {
  data?: {
    audio?: string;
    status?: number;
  };
  extra_info?: Record<string, unknown> & { audio_format?: string };
  trace_id?: string;
}

/**
 * Call the MiniMax text-to-audio HTTP endpoint (POST /v1/t2a_v2).
 * Returns the decoded audio bytes plus metadata. `output_format` is
 * pinned to `hex` so the caller gets a Buffer directly.
 */
export async function generateAudio(opts: {
  region: Region;
  token: string;
  params: AudioGenerationParams;
  debug?: boolean;
}): Promise<AudioGenerationResult> {
  const { region, token, params, debug } = opts;

  const voiceSetting: Record<string, unknown> = {
    voice_id: params.voice.voiceId,
  };
  if (params.voice.speed !== undefined) voiceSetting.speed = params.voice.speed;
  if (params.voice.vol !== undefined) voiceSetting.vol = params.voice.vol;
  if (params.voice.pitch !== undefined) voiceSetting.pitch = params.voice.pitch;
  if (params.voice.emotion !== undefined) {
    voiceSetting.emotion = params.voice.emotion;
  }

  const audioSetting: Record<string, unknown> = {};
  if (params.audio?.format) audioSetting.format = params.audio.format;
  if (params.audio?.sampleRate) {
    audioSetting.sample_rate = params.audio.sampleRate;
  }
  if (params.audio?.bitrate) audioSetting.bitrate = params.audio.bitrate;
  if (params.audio?.channel) audioSetting.channel = params.audio.channel;

  const body: Record<string, unknown> = {
    model: params.model,
    text: params.text,
    stream: false,
    output_format: 'hex',
    voice_setting: voiceSetting,
  };
  if (Object.keys(audioSetting).length > 0) {
    body.audio_setting = audioSetting;
  }

  const json = await postJson<RawAudioResponse>({
    url: `${getBaseUrl(region)}/v1/t2a_v2`,
    token,
    body,
    debug,
  });

  assertBaseResp(json);

  const hex = json.data?.audio;
  if (!hex) {
    throw new Error('API returned no audio (data.audio is empty)');
  }

  const buffer = Buffer.from(hex, 'hex');
  if (buffer.length === 0) {
    throw new Error('Decoded audio buffer is empty');
  }

  const reportedFormat =
    (json.extra_info?.audio_format as AudioFormat | undefined) ??
    params.audio?.format ??
    'mp3';

  return {
    buffer,
    format: reportedFormat,
    extra: json.extra_info,
    traceId: json.trace_id,
  };
}
