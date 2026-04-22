import type { Region } from '../../utils/config.js';
import {
  type BaseResp,
  assertBaseResp,
  getBaseUrl,
  postJson,
} from '../../utils/http.js';

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

interface RawResponse extends BaseResp {
  id?: string;
  data?: {
    image_urls?: string[];
    image_base64?: string[];
  };
  metadata?: {
    success_count?: string | number;
    failed_count?: string | number;
  };
}

/**
 * Call the MiniMax text-to-image endpoint.
 * `response_format` is hard-coded to `base64` so callers can pipe the
 * bytes straight into sharp for transcoding.
 */
export async function generateImage(opts: {
  region: Region;
  token: string;
  params: ImageGenerationParams;
  debug?: boolean;
}): Promise<ImageGenerationResult> {
  const { region, token, params, debug } = opts;

  const body: Record<string, unknown> = {
    model: params.model,
    prompt: params.prompt,
    n: params.n,
    response_format: 'base64' as const,
  };
  if (params.aspectRatio) body.aspect_ratio = params.aspectRatio;
  if (params.width !== undefined && params.height !== undefined) {
    body.width = params.width;
    body.height = params.height;
  }
  if (params.subjectReference && params.subjectReference.length > 0) {
    body.subject_reference = params.subjectReference;
  }
  if (params.seed !== undefined) body.seed = params.seed;
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

  const json = await postJson<RawResponse>({
    url: `${getBaseUrl(region)}/v1/image_generation`,
    token,
    body,
    debug,
  });

  assertBaseResp(json);

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
