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

export interface ImageGenerationParams {
  model: string;
  prompt: string;
  aspectRatio: AspectRatio;
  n: number;
  subjectReference?: SubjectReference[];
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
    aspect_ratio: params.aspectRatio,
    n: params.n,
    response_format: 'base64' as const,
  };
  if (params.subjectReference && params.subjectReference.length > 0) {
    body.subject_reference = params.subjectReference;
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
