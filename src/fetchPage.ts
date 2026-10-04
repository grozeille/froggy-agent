import { htmlToText } from './htmlText';
import { isSafeHttpUrl } from './urls';
import type { WebFetchInit } from './webSearch';

/** Tool name must match the `languageModelTools` contribution in package.json. */
export const FETCH_PAGE_TOOL_NAME = 'pocFetchWebPage';

export interface FetchPageToolInput {
  /** Full http(s) URL of the page to read. */
  url: string;
}

/** Refuse to download more than this: fetched pages are summarized, not stored. */
export const MAX_FETCH_BYTES = 1_000_000;

/** Text handed to the model is capped here (with a truncation marker). */
export const MAX_FETCH_TEXT_CHARS = 8000;

/** Host suffixes that always resolve to the local network. */
const LOCAL_SUFFIXES = ['.localhost', '.local', '.internal', '.lan', '.home'];

/**
 * Whether a hostname targets the local machine or a private network. The
 * fetch tool reads pages for the model without confirmation, so local URLs
 * (intranet routers, dev servers, cloud metadata endpoints) stay out of
 * reach. Best-effort string matching — no DNS resolution.
 */
export function isBlockedFetchHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
  if (!host || host === 'localhost' || host === '0.0.0.0') {
    return true;
  }
  if (LOCAL_SUFFIXES.some((suffix) => host.endsWith(suffix))) {
    return true;
  }
  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (ipv4) {
    const [a, b] = [Number(ipv4[1]), Number(ipv4[2])];
    return (
      a === 127 || a === 10 || a === 0 ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 169 && b === 254)
    );
  }
  if (host.includes(':')) {
    return (
      host === '::1' ||
      host === '::' ||
      /^fe[89ab][0-9a-f]*:/.test(host) || // fe80::/10 link-local
      host.startsWith('fc') ||
      host.startsWith('fd') // fc00::/7 unique-local
    );
  }
  return false;
}

/**
 * Resolve a model-provided input to the page URL to fetch. Returns undefined
 * for missing, blank, non-http(s), credential-bearing or local URLs so the
 * tool can neither leak intranet content nor phone home with credentials.
 */
export function resolveFetchPageUrl(input: unknown): string | undefined {
  if (typeof input !== 'object' || input === null) {
    return undefined;
  }
  const url = (input as { url?: unknown }).url;
  if (typeof url !== 'string') {
    return undefined;
  }
  const trimmed = url.trim();
  if (!trimmed || !isSafeHttpUrl(trimmed)) {
    return undefined;
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return undefined;
  }
  if (parsed.username || parsed.password) {
    return undefined;
  }
  return isBlockedFetchHost(parsed.hostname) ? undefined : trimmed;
}

/** Structural subset of the fetch API the page fetcher needs (stub-friendly). */
export interface PageFetchResponse {
  readonly ok: boolean;
  readonly status: number;
  readonly headers: { get(name: string): string | null };
  text(): Promise<string>;
}

export interface PageFetch {
  (url: string, init?: WebFetchInit): Promise<PageFetchResponse>;
}

export interface FetchPageOptions {
  /** Per-request timeout in milliseconds (default 15000). */
  timeoutMs?: number;
}

export interface FetchedPage {
  url: string;
  title: string;
  text: string;
}

const FETCH_HEADERS = {
  Accept: 'text/html,application/xhtml+xml,text/*;q=0.8,application/json;q=0.7,*/*;q=0.5',
  'User-Agent': 'froggy-agent/0.0.1'
};

function isReadableContentType(contentType: string): boolean {
  const base = contentType.split(';', 1)[0].trim().toLowerCase();
  if (!base) {
    return true;
  }
  return (
    base.startsWith('text/') ||
    base === 'application/json' ||
    base === 'application/xml' ||
    base.endsWith('+json') ||
    base.endsWith('+xml') ||
    base === 'image/svg+xml'
  );
}

/**
 * Fetch a page and reduce it to readable text. Throws a plain-English error
 * for HTTP failures, binary content and oversized bodies — the tool result
 * then tells the model what went wrong instead of failing silently.
 */
export async function fetchPageText(
  url: string,
  fetchImpl: PageFetch,
  options?: FetchPageOptions
): Promise<FetchedPage> {
  const timeoutMs = options?.timeoutMs ?? 15_000;
  const response = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs), headers: FETCH_HEADERS });
  if (!response.ok) {
    throw new Error(`Fetching ${url} failed (HTTP ${response.status}).`);
  }
  const contentType = response.headers.get('content-type') ?? '';
  if (!isReadableContentType(contentType)) {
    const base = contentType.split(';', 1)[0].trim() || 'unknown type';
    throw new Error(`Fetching ${url} failed: ${base} is not readable text.`);
  }
  const contentLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > MAX_FETCH_BYTES) {
    throw new Error(`Fetching ${url} failed: page too large (${contentLength} bytes).`);
  }
  const raw = await response.text();
  if (raw.length > MAX_FETCH_BYTES) {
    throw new Error(`Fetching ${url} failed: page too large (${raw.length} bytes).`);
  }
  if (contentType.toLowerCase().includes('json')) {
    return { url, title: '', text: raw.trim() };
  }
  const { title, text } = htmlToText(raw);
  return { url, title, text };
}

/** Render a fetched page as the text the model summarizes. */
export function formatFetchedPage(page: FetchedPage): string {
  const lines = [`Fetched ${page.url}:`];
  if (page.title) {
    lines.push(`Title: ${page.title}`);
  }
  lines.push('');
  if (!page.text) {
    lines.push('(the page contains no readable text)');
    return lines.join('\n');
  }
  if (page.text.length <= MAX_FETCH_TEXT_CHARS) {
    lines.push(page.text);
    return lines.join('\n');
  }
  lines.push(page.text.slice(0, MAX_FETCH_TEXT_CHARS));
  lines.push(`…(truncated, showing the first ${MAX_FETCH_TEXT_CHARS} of ${page.text.length} characters)`);
  return lines.join('\n');
}
