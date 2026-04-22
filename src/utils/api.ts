import type { Region } from './config.js';

const BASE_URLS: Record<Region, string> = {
  china: 'https://api.minimaxi.com',
  global: 'https://api.minimax.io',
};

export function getBaseUrl(region: Region): string {
  return BASE_URLS[region];
}

export type AspectRatio =
  | '1:1'
  | '16:9'
  | '4:3'
  | '3:2'
  | '2:3'
  | '3:4'
  | '9:16'
  | '21:9';

export const ASPECT_RATIOS: AspectRatio[] = [
  '1:1',
  '16:9',
  '4:3',
  '3:2',
  '2:3',
  '3:4',
  '9:16',
  '21:9',
];

export interface SubjectReference {
  type: string;
  image_file: string;
}

export type StyleType = '漫画' | '元气' | '中世纪' | '水彩';
export const STYLE_TYPES: StyleType[] = ['漫画', '元气', '中世纪', '水彩'];

export interface StyleSetting {
  /** Only applied when `model` is `image-01-live`; ignored otherwise. */
  styleType: StyleType;
  /** Range (0, 1], default 0.8. */
  styleWeight?: number;
}

export interface ImageGenerationParams {
  model: string;
  prompt: string;
  /** One of ASPECT_RATIOS. Ignored by the server when width+height are set. */
  aspectRatio?: AspectRatio;
  /** If both width and height are set, they take effect; aspect_ratio wins when both groups are provided. */
  width?: number;
  height?: number;
  n: number;
  subjectReference?: SubjectReference[];
  seed?: number;
  promptOptimizer?: boolean;
  aigcWatermark?: boolean;
  style?: StyleSetting;
}

export interface ImageGenerationResult {
  id: string;
  /** Raw base64 strings without the `data:` prefix. */
  images: string[];
  successCount: number;
  failedCount: number;
}

interface RawResponse {
  id?: string;
  data?: {
    image_urls?: string[];
    image_base64?: string[];
  };
  metadata?: {
    success_count?: string | number;
    failed_count?: string | number;
  };
  base_resp?: {
    status_code: number;
    status_msg: string;
  };
}

/**
 * Call the MiniMax text-to-image endpoint.
 * `response_format` is hard-coded to `base64` so callers can pipe the
 * bytes straight into sharp for transcoding.
 *
 * When `debug` is true, the outgoing request and incoming response are
 * logged to stderr. The `Authorization` token is masked and large
 * base64 bodies are truncated.
 */
export async function generateImage(opts: {
  region: Region;
  token: string;
  params: ImageGenerationParams;
  debug?: boolean;
}): Promise<ImageGenerationResult> {
  const { region, token, params, debug } = opts;
  const url = `${getBaseUrl(region)}/v1/image_generation`;

  const body: Record<string, unknown> = {
    model: params.model,
    prompt: params.prompt,
    n: params.n,
    response_format: 'base64' as const,
  };
  if (params.aspectRatio) {
    body.aspect_ratio = params.aspectRatio;
  }
  if (params.width !== undefined && params.height !== undefined) {
    body.width = params.width;
    body.height = params.height;
  }
  if (params.subjectReference && params.subjectReference.length > 0) {
    body.subject_reference = params.subjectReference;
  }
  if (params.seed !== undefined) {
    body.seed = params.seed;
  }
  if (params.promptOptimizer !== undefined) {
    body.prompt_optimizer = params.promptOptimizer;
  }
  if (params.aigcWatermark !== undefined) {
    body.aigc_watermark = params.aigcWatermark;
  }
  if (params.style) {
    const style: Record<string, unknown> = {
      style_type: params.style.styleType,
    };
    if (params.style.styleWeight !== undefined) {
      style.style_weight = params.style.styleWeight;
    }
    body.style = style;
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
  const serializedBody = JSON.stringify(body);

  if (debug) {
    logRequest(url, 'POST', headers, serializedBody);
  }

  const start = Date.now();
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: serializedBody,
  });

  if (debug) {
    const cloned = res.clone();
    const text = await cloned.text().catch(() => '');
    logResponse(res.status, res.statusText, Date.now() - start, text);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(
      `HTTP ${res.status} ${res.statusText}${text ? `: ${text}` : ''}`,
    );
  }

  const json = (await res.json()) as RawResponse;

  if (json.base_resp && json.base_resp.status_code !== 0) {
    throw new Error(
      `API error ${json.base_resp.status_code}: ${json.base_resp.status_msg}`,
    );
  }

  const images = json.data?.image_base64 ?? [];
  if (images.length === 0) {
    throw new Error('API returned no images (image_base64 is empty)');
  }

  return {
    id: json.id ?? '',
    images,
    successCount: Number(json.metadata?.success_count ?? images.length),
    failedCount: Number(json.metadata?.failed_count ?? 0),
  };
}

/** Mask Bearer tokens in header maps for safe logging. */
function maskHeaders(headers: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase() === 'authorization' && v.startsWith('Bearer ')) {
      const tok = v.slice(7);
      const masked =
        tok.length <= 12 ? tok : `${tok.slice(0, 6)}...${tok.slice(-6)}`;
      out[k] = `Bearer ${masked}`;
    } else {
      out[k] = v;
    }
  }
  return out;
}

/** Truncate any base64 image payload so debug output stays readable. */
function truncateBody(body: string, limit = 4000): string {
  if (body.length <= limit) return body;
  return `${body.slice(0, limit)}\n... [truncated ${body.length - limit} chars]`;
}

function logRequest(
  url: string,
  method: string,
  headers: Record<string, string>,
  body: string,
): void {
  const cyan = (s: string) => `\x1b[36m${s}\x1b[0m`;
  console.error(cyan('─── HTTP Request ───'));
  console.error(cyan(`${method} ${url}`));
  console.error(
    cyan(`Headers: ${JSON.stringify(maskHeaders(headers), null, 2)}`),
  );
  console.error(cyan(`Body: ${truncateBody(body)}`));
}

function logResponse(
  status: number,
  statusText: string,
  elapsedMs: number,
  body: string,
): void {
  const cyan = (s: string) => `\x1b[36m${s}\x1b[0m`;
  console.error(cyan(`─── HTTP Response (${elapsedMs}ms) ───`));
  console.error(cyan(`Status: ${status} ${statusText}`));
  console.error(cyan(`Body: ${truncateBody(body)}`));
}

/**
 * Call the MiniMax coding-plan web search endpoint.
 * Mirrors what the official MCP server (`minimax-coding-plan-mcp`) does:
 * POST /v1/coding_plan/search with `{ q }` and the `MM-API-Source` header.
 * Returns the raw JSON response as-is so the caller can pretty-print it.
 */
export async function webSearch(opts: {
  region: Region;
  token: string;
  query: string;
  debug?: boolean;
}): Promise<unknown> {
  const { region, token, query, debug } = opts;
  const url = `${getBaseUrl(region)}/v1/coding_plan/search`;

  const body = { q: query };

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
    'MM-API-Source': 'Minimax-MCP',
  };
  const serializedBody = JSON.stringify(body);

  if (debug) {
    logRequest(url, 'POST', headers, serializedBody);
  }

  const start = Date.now();
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: serializedBody,
  });

  if (debug) {
    const cloned = res.clone();
    const text = await cloned.text().catch(() => '');
    logResponse(res.status, res.statusText, Date.now() - start, text);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(
      `HTTP ${res.status} ${res.statusText}${text ? `: ${text}` : ''}`,
    );
  }

  return await res.json();
}

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

interface RawAudioResponse {
  data?: {
    audio?: string;
    status?: number;
  };
  extra_info?: Record<string, unknown> & { audio_format?: string };
  trace_id?: string;
  base_resp?: {
    status_code: number;
    status_msg: string;
  };
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
  const url = `${getBaseUrl(region)}/v1/t2a_v2`;

  const voiceSetting: Record<string, unknown> = {
    voice_id: params.voice.voiceId,
  };
  if (params.voice.speed !== undefined) voiceSetting.speed = params.voice.speed;
  if (params.voice.vol !== undefined) voiceSetting.vol = params.voice.vol;
  if (params.voice.pitch !== undefined) voiceSetting.pitch = params.voice.pitch;
  if (params.voice.emotion !== undefined)
    voiceSetting.emotion = params.voice.emotion;

  const audioSetting: Record<string, unknown> = {};
  if (params.audio?.format) audioSetting.format = params.audio.format;
  if (params.audio?.sampleRate) audioSetting.sample_rate = params.audio.sampleRate;
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

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
  const serializedBody = JSON.stringify(body);

  if (debug) {
    logRequest(url, 'POST', headers, serializedBody);
  }

  const start = Date.now();
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: serializedBody,
  });

  if (debug) {
    const cloned = res.clone();
    const text = await cloned.text().catch(() => '');
    logResponse(res.status, res.statusText, Date.now() - start, text);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(
      `HTTP ${res.status} ${res.statusText}${text ? `: ${text}` : ''}`,
    );
  }

  const json = (await res.json()) as RawAudioResponse;

  if (json.base_resp && json.base_resp.status_code !== 0) {
    throw new Error(
      `API error ${json.base_resp.status_code}: ${json.base_resp.status_msg}`,
    );
  }

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
