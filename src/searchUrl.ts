export const GOOGLE_SEARCH_TOOL_NAME = 'pocGoogleSearch';

export interface GoogleSearchToolInput {
  query: string;
}

export function buildGoogleSearchUrl(query: string): string {
  return `https://www.google.com/search?q=${encodeURIComponent(query.trim())}`;
}
