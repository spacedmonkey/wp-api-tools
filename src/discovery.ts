import { DiscoveryError, NetworkError } from './errors.js';
import type { WpIndexResponse } from './types.js';

const LINK_REL_RE = /<([^>]+)>\s*;\s*rel="https:\/\/api\.w\.org\/"/;

export interface DiscoveryResult {
  index: WpIndexResponse;
  apiRoot: string;
}

async function safeFetch(url: string): Promise<Response> {
  try {
    return await fetch(url, { redirect: 'follow' });
  } catch (err) {
    const cause = err instanceof Error && 'cause' in err ? (err as any).cause : undefined;
    const detail = cause?.code ?? cause?.message ?? (err instanceof Error ? err.message : String(err));
    throw new NetworkError(`Could not reach ${url}: ${detail}`, err);
  }
}

function looksLikeIndex(value: unknown): value is WpIndexResponse {
  return (
    typeof value === 'object' &&
    value !== null &&
    'routes' in value &&
    typeof (value as any).routes === 'object' &&
    (value as any).routes !== null
  );
}

async function tryParseIndex(response: Response): Promise<WpIndexResponse | undefined> {
  if (!response.ok) return undefined;
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return undefined;
  }
  return looksLikeIndex(body) ? body : undefined;
}

export async function discover(baseUrl: string): Promise<DiscoveryResult> {
  const directUrl = `${baseUrl}/wp-json/`;
  const directResponse = await safeFetch(directUrl);
  const directIndex = await tryParseIndex(directResponse);
  if (directIndex) {
    return { index: directIndex, apiRoot: directResponse.url };
  }

  const rootResponse = await safeFetch(baseUrl);
  const linkHeader = rootResponse.headers.get('link') ?? '';
  const match = LINK_REL_RE.exec(linkHeader);
  if (match) {
    const linkTarget = new URL(match[1]!, rootResponse.url).toString();
    const linkResponse = await safeFetch(linkTarget);
    const linkIndex = await tryParseIndex(linkResponse);
    if (linkIndex) {
      return { index: linkIndex, apiRoot: linkResponse.url };
    }
  }

  throw new DiscoveryError(
    `Could not discover a REST API index at ${baseUrl}. Tried:\n` +
      `  - ${directUrl}\n` +
      `  - the site root's Link header (rel="https://api.w.org/")\n` +
      `Is this a reachable WordPress site with the REST API enabled?`
  );
}
