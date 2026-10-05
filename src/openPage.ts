import { isSafeHttpUrl } from './urls';

/** Tool name must match the `languageModelTools` contribution in package.json. */
export const OPEN_PAGE_TOOL_NAME = 'froggyOpenBrowserPage';

export interface OpenPageToolInput {
  /** Full http(s) URL of the page to open. */
  url: string;
}

/**
 * Resolve a model-provided input to the page URL to open.
 * Returns undefined for missing, blank or non-http(s) URLs so the tool can
 * never open a dangerous scheme.
 */
export function resolveOpenPageUrl(input: unknown): string | undefined {
  if (typeof input !== 'object' || input === null) {
    return undefined;
  }
  const url = (input as { url?: unknown }).url;
  if (typeof url !== 'string') {
    return undefined;
  }
  const trimmed = url.trim();
  return trimmed && isSafeHttpUrl(trimmed) ? trimmed : undefined;
}
