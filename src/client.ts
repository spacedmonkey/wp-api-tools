import { addQueryArgs } from '@wordpress/url';
import { HttpError, NetworkError, ParseError } from './errors.js';
import type { HttpMethod, WpErrorResponse } from './types.js';

export interface SendOptions {
  method: HttpMethod;
  url: string;
  query?: Record<string, unknown>;
  body?: unknown;
  headers?: Record<string, string>;
}

export interface SendResult {
  data: unknown;
  headers: Headers;
  status: number;
  url: string;
}

export function buildRouteUrl(apiRoot: string, routePath: string): string {
  if (apiRoot.includes('rest_route=')) {
    return addQueryArgs(apiRoot, { rest_route: routePath });
  }
  const base = apiRoot.endsWith('/') ? apiRoot : `${apiRoot}/`;
  return base + routePath.replace(/^\//, '');
}

export async function send(options: SendOptions): Promise<SendResult> {
  const { method, query, body, headers = {} } = options;
  let url = options.url;
  if (query && Object.keys(query).length > 0) {
    url = addQueryArgs(url, query);
  }

  const finalHeaders: Record<string, string> = { Accept: 'application/json', ...headers };
  let requestBody: string | undefined;
  if (body !== undefined) {
    requestBody = JSON.stringify(body);
    finalHeaders['Content-Type'] = 'application/json';
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers: finalHeaders,
      body: requestBody,
      redirect: 'follow',
    });
  } catch (err) {
    const cause = err instanceof Error && 'cause' in err ? (err as { cause?: any }).cause : undefined;
    const detail = cause?.code ?? cause?.message ?? (err instanceof Error ? err.message : String(err));
    throw new NetworkError(`Request to ${url} failed: ${detail}`, err);
  }

  const text = await response.text();
  let data: unknown = null;
  if (text.length > 0) {
    try {
      data = JSON.parse(text);
    } catch {
      throw new ParseError('Response body was not valid JSON.', response.status, text.slice(0, 200));
    }
  }

  if (!response.ok) {
    const wpError = isWpError(data) ? data : undefined;
    const message = wpError?.message ?? `Request failed with status ${response.status}`;
    const code = wpError?.code ?? 'http_error';
    throw new HttpError(message, code, response.status, wpError);
  }

  return { data, headers: response.headers, status: response.status, url: response.url };
}

function isWpError(value: unknown): value is WpErrorResponse {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Record<string, unknown>).code === 'string' &&
    typeof (value as Record<string, unknown>).message === 'string'
  );
}
