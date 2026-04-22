import type { Region } from './config.js';

const BASE_URLS: Record<Region, string> = {
  china: 'https://api.minimaxi.com',
  global: 'https://api.minimax.io',
};

export function getBaseUrl(region: Region): string {
  return BASE_URLS[region];
}

export interface BaseResp {
  base_resp?: {
    status_code: number;
    status_msg: string;
  };
}

/** Throw a descriptive error when `base_resp.status_code` is non-zero. */
export function assertBaseResp(json: BaseResp): void {
  if (json.base_resp && json.base_resp.status_code !== 0) {
    throw new Error(
      `API error ${json.base_resp.status_code}: ${json.base_resp.status_msg}`,
    );
  }
}

export interface PostJsonOptions {
  url: string;
  token: string;
  body: unknown;
  /** Extra request headers merged with the defaults. */
  headers?: Record<string, string>;
  /** When true, dump request/response to stderr with masked auth. */
  debug?: boolean;
}

/**
 * POST JSON to the MiniMax API with standardised error handling and
 * optional debug logging. `Content-Type` / `Authorization` headers
 * are filled in automatically.
 */
export async function postJson<T>(opts: PostJsonOptions): Promise<T> {
  const { url, token, body, headers: extra, debug } = opts;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
    ...(extra ?? {}),
  };
  const serialized = JSON.stringify(body);

  if (debug) logRequest(url, 'POST', headers, serialized);

  const start = Date.now();
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: serialized,
  });

  if (debug) {
    const text = await res
      .clone()
      .text()
      .catch(() => '');
    logResponse(res.status, res.statusText, Date.now() - start, text);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(
      `HTTP ${res.status} ${res.statusText}${text ? `: ${text}` : ''}`,
    );
  }

  return (await res.json()) as T;
}

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
