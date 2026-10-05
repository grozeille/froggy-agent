import { snippetToText } from './htmlText';

/** Tool name must match the `languageModelTools` contribution in package.json. */
export const WEB_SEARCH_TOOL_NAME = 'froggyWebSearch';

export interface WebSearchToolInput {
  /** Keywords to look up on the internet, e.g. "current price of S&P 500". */
  query: string;
}

/**
 * Resolve a model-provided input to the query to search.
 * Returns undefined for missing or blank queries.
 */
export function resolveWebSearchQuery(input: unknown): string | undefined {
  if (typeof input !== 'object' || input === null) {
    return undefined;
  }
  const query = (input as { query?: unknown }).query;
  if (typeof query !== 'string') {
    return undefined;
  }
  const trimmed = query.trim();
  return trimmed ? trimmed : undefined;
}

export function buildDuckDuckGoUrl(query: string): string {
  return `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
}

export function buildWikipediaSearchUrl(query: string, limit = 5): string {
  return (
    `https://en.wikipedia.org/w/api.php?action=query&list=search` +
    `&srsearch=${encodeURIComponent(query)}&format=json&srlimit=${limit}`
  );
}

export function buildYahooQuoteUrl(symbol: string): string {
  return `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`;
}

export interface InstantAnswerTopic {
  text: string;
  url: string;
}

export interface InstantAnswer {
  answer: string;
  abstractText: string;
  abstractUrl: string;
  abstractSource: string;
  definition: string;
  topics: InstantAnswerTopic[];
}

export function emptyInstantAnswer(): InstantAnswer {
  return { answer: '', abstractText: '', abstractUrl: '', abstractSource: '', definition: '', topics: [] };
}

export interface WikipediaResult {
  title: string;
  snippet: string;
  url: string;
}

export interface MarketQuote {
  symbol: string;
  label: string;
  price: number;
  currency: string;
  changePercent?: number;
  /** ISO timestamp of the quote, when the feed provides one. */
  marketTime?: string;
  exchangeTimezone?: string;
}

export interface WebSearchData {
  instant: InstantAnswer;
  wiki: WikipediaResult[];
  quote?: MarketQuote;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : undefined;
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/**
 * Parse a DuckDuckGo Instant Answer payload. Unknown shapes degrade to an
 * empty answer — never throws, so one bad field cannot lose the whole search.
 */
export function parseDuckDuckGoResponse(body: unknown): InstantAnswer {
  const data = asRecord(body);
  if (!data) {
    return emptyInstantAnswer();
  }
  return {
    answer: asString(data['Answer']).trim(),
    abstractText: asString(data['AbstractText']).trim(),
    abstractUrl: asString(data['AbstractURL']).trim(),
    abstractSource: asString(data['AbstractSource']).trim(),
    definition: asString(data['Definition']).trim(),
    topics: flattenRelatedTopics(data['RelatedTopics'])
  };
}

function flattenRelatedTopics(value: unknown, depth = 0): InstantAnswerTopic[] {
  if (!Array.isArray(value) || depth > 2) {
    return [];
  }
  const topics: InstantAnswerTopic[] = [];
  for (const entry of value) {
    const record = asRecord(entry);
    if (!record) {
      continue;
    }
    // Category entries group nested topics under `Topics`.
    if (Array.isArray(record['Topics'])) {
      topics.push(...flattenRelatedTopics(record['Topics'], depth + 1));
      continue;
    }
    const text = asString(record['Text']).trim();
    if (text) {
      topics.push({ text, url: asString(record['FirstURL']).trim() });
    }
    if (topics.length >= 5) {
      break;
    }
  }
  return topics.slice(0, 5);
}

const WIKIPEDIA_ARTICLE_BASE = 'https://en.wikipedia.org/wiki/';

export function wikipediaArticleUrl(title: string): string {
  return `${WIKIPEDIA_ARTICLE_BASE}${encodeURIComponent(title.replace(/ /g, '_'))}`;
}

/** Parse a Wikipedia `list=search` payload; malformed entries are skipped. */
export function parseWikipediaResponse(body: unknown): WikipediaResult[] {
  const query = asRecord(asRecord(body)?.['query']);
  const search = query?.['search'];
  if (!Array.isArray(search)) {
    return [];
  }
  const results: WikipediaResult[] = [];
  for (const entry of search) {
    const record = asRecord(entry);
    const title = record ? asString(record['title']).trim() : '';
    if (!title) {
      continue;
    }
    results.push({
      title,
      snippet: record ? snippetToText(asString(record['snippet'])) : '',
      url: wikipediaArticleUrl(title)
    });
    if (results.length >= 5) {
      break;
    }
  }
  return results;
}

/**
 * Parse a Yahoo Finance chart payload for one symbol. Returns undefined when
 * the payload carries no usable price (unknown symbol, error shape, ...).
 */
export function parseYahooQuoteResponse(
  body: unknown,
  symbol: string,
  label: string
): MarketQuote | undefined {
  const results = asRecord(asRecord(body)?.['chart'])?.['result'];
  const meta = asRecord(Array.isArray(results) ? results[0] : undefined)?.['meta'];
  const metaRecord = asRecord(meta);
  const price = metaRecord ? asNumber(metaRecord['regularMarketPrice']) : undefined;
  if (price === undefined) {
    return undefined;
  }
  const quote: MarketQuote = {
    symbol,
    label,
    price,
    currency: metaRecord ? asString(metaRecord['currency']).trim() || 'USD' : 'USD'
  };
  const changePercent = metaRecord ? asNumber(metaRecord['regularMarketChangePercent']) : undefined;
  if (changePercent !== undefined) {
    quote.changePercent = changePercent;
  }
  const marketTime = metaRecord ? asNumber(metaRecord['regularMarketTime']) : undefined;
  if (marketTime !== undefined) {
    quote.marketTime = new Date(marketTime * 1000).toISOString();
  }
  const exchangeTimezone = metaRecord ? asString(metaRecord['exchangeTimezoneName']).trim() : '';
  if (exchangeTimezone) {
    quote.exchangeTimezone = exchangeTimezone;
  }
  return quote;
}

export interface QuoteTarget {
  symbol: string;
  label: string;
}

/**
 * Well-known indices, commodities, forex pairs and crypto mapped to their
 * Yahoo Finance symbols. Keys are pre-normalized (lowercase, `&` kept,
 * single spaces) to match `normalizeQuoteQuery`.
 */
const QUOTE_ALIASES: ReadonlyArray<readonly [string, QuoteTarget]> = [
  ['dow jones industrial average', { symbol: '^DJI', label: 'Dow Jones Industrial Average' }],
  ['dow jones', { symbol: '^DJI', label: 'Dow Jones Industrial Average' }],
  ['nasdaq composite', { symbol: '^IXIC', label: 'NASDAQ Composite' }],
  ['russell 2000', { symbol: '^RUT', label: 'Russell 2000' }],
  ['russell2000', { symbol: '^RUT', label: 'Russell 2000' }],
  ['s&p/tsx composite', { symbol: '^GSPTSE', label: 'S&P/TSX Composite' }],
  ['nikkei 225', { symbol: '^N225', label: 'Nikkei 225' }],
  ['nikkei225', { symbol: '^N225', label: 'Nikkei 225' }],
  ['stoxx 600', { symbol: '^STOXX', label: 'STOXX Europe 600' }],
  ['stoxx600', { symbol: '^STOXX', label: 'STOXX Europe 600' }],
  ['sse composite', { symbol: '000001.SS', label: 'SSE Composite' }],
  ['ftse 100', { symbol: '^FTSE', label: 'FTSE 100' }],
  ['ftse100', { symbol: '^FTSE', label: 'FTSE 100' }],
  ['hang seng', { symbol: '^HSI', label: 'Hang Seng' }],
  ['ibex 35', { symbol: '^IBEX', label: 'IBEX 35' }],
  ['ibex35', { symbol: '^IBEX', label: 'IBEX 35' }],
  ['brent crude', { symbol: 'BZ=F', label: 'Brent Crude Oil' }],
  ['wti crude', { symbol: 'CL=F', label: 'WTI Crude Oil' }],
  ['crude oil', { symbol: 'CL=F', label: 'WTI Crude Oil' }],
  ['euro dollar', { symbol: 'EURUSD=X', label: 'EUR/USD' }],
  ['eur usd', { symbol: 'EURUSD=X', label: 'EUR/USD' }],
  ['gold price', { symbol: 'GC=F', label: 'Gold' }],
  ['oil price', { symbol: 'CL=F', label: 'WTI Crude Oil' }],
  ['s&p 500', { symbol: '^GSPC', label: 'S&P 500' }],
  ['s&p500', { symbol: '^GSPC', label: 'S&P 500' }],
  ['cac 40', { symbol: '^FCHI', label: 'CAC 40' }],
  ['cac40', { symbol: '^FCHI', label: 'CAC 40' }],
  ['snp500', { symbol: '^GSPC', label: 'S&P 500' }],
  ['sp500', { symbol: '^GSPC', label: 'S&P 500' }],
  ['ethereum', { symbol: 'ETH-USD', label: 'Ethereum' }],
  ['bitcoin', { symbol: 'BTC-USD', label: 'Bitcoin' }],
  ['nasdaq', { symbol: '^IXIC', label: 'NASDAQ Composite' }],
  ['nikkei', { symbol: '^N225', label: 'Nikkei 225' }],
  ['sensex', { symbol: '^BSESN', label: 'SENSEX' }],
  ['brent', { symbol: 'BZ=F', label: 'Brent Crude Oil' }],
  ['stoxx', { symbol: '^STOXX', label: 'STOXX Europe 600' }],
  ['djia', { symbol: '^DJI', label: 'Dow Jones Industrial Average' }],
  ['gold', { symbol: 'GC=F', label: 'Gold' }],
  ['silver', { symbol: 'SI=F', label: 'Silver' }],
  ['eurusd', { symbol: 'EURUSD=X', label: 'EUR/USD' }],
  ['kospi', { symbol: '^KS11', label: 'KOSPI' }],
  ['gdaxi', { symbol: '^GDAXI', label: 'DAX' }],
  ['bsesn', { symbol: '^BSESN', label: 'SENSEX' }],
  ['gspc', { symbol: '^GSPC', label: 'S&P 500' }],
  ['ixic', { symbol: '^IXIC', label: 'NASDAQ Composite' }],
  ['fchi', { symbol: '^FCHI', label: 'CAC 40' }],
  ['ftse', { symbol: '^FTSE', label: 'FTSE 100' }],
  ['n225', { symbol: '^N225', label: 'Nikkei 225' }],
  ['ibex', { symbol: '^IBEX', label: 'IBEX 35' }],
  ['axjo', { symbol: '^AXJO', label: 'ASX 200' }],
  ['ks11', { symbol: '^KS11', label: 'KOSPI' }],
  ['gsptse', { symbol: '^GSPTSE', label: 'S&P/TSX Composite' }],
  ['xauusd', { symbol: 'GC=F', label: 'Gold' }],
  ['btc', { symbol: 'BTC-USD', label: 'Bitcoin' }],
  ['eth', { symbol: 'ETH-USD', label: 'Ethereum' }],
  ['asx', { symbol: '^AXJO', label: 'ASX 200' }],
  ['tsx', { symbol: '^GSPTSE', label: 'S&P/TSX Composite' }],
  ['dax', { symbol: '^GDAXI', label: 'DAX' }],
  ['dow', { symbol: '^DJI', label: 'Dow Jones Industrial Average' }],
  ['dji', { symbol: '^DJI', label: 'Dow Jones Industrial Average' }],
  ['rut', { symbol: '^RUT', label: 'Russell 2000' }],
  ['hsi', { symbol: '^HSI', label: 'Hang Seng' }],
  ['aex', { symbol: '^AEX', label: 'AEX' }],
  ['smi', { symbol: '^SSMI', label: 'SMI' }],
  ['spx', { symbol: '^GSPC', label: 'S&P 500' }],
  ['xau', { symbol: 'GC=F', label: 'Gold' }],
  ['xag', { symbol: 'SI=F', label: 'Silver' }],
  ['oil', { symbol: 'CL=F', label: 'WTI Crude Oil' }],
  ['wti', { symbol: 'CL=F', label: 'WTI Crude Oil' }]
];

/** Words never treated as a ticker in the `<word> stock(s)` pattern. */
const TICKER_STOPWORDS = new Set([
  'the', 'a', 'an', 'of', 'its', 'this', 'that', 'my', 'your', 'our',
  'stock', 'stocks', 'share', 'shares', 'market', 'markets', 'price', 'prices',
  'index', 'indexes', 'current', 'live', 'us'
]);

function normalizeQuoteQuery(query: string): string {
  return query
    .toLowerCase()
    .replace(/[^a-z0-9& ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Map a natural-language query to a Yahoo Finance symbol when it names a
 * known index/commodity/pair/coin, a `$TICKER`, or `<ticker> stock(s)`.
 * Returns undefined for anything else — the quote layer is then skipped.
 */
export function resolveQuoteSymbol(query: string): QuoteTarget | undefined {
  const normalized = normalizeQuoteQuery(query);
  if (!normalized) {
    return undefined;
  }
  // Longest alias first so "dow jones industrial average" wins over "dow".
  const aliases = [...QUOTE_ALIASES].sort((a, b) => b[0].length - a[0].length);
  for (const [alias, target] of aliases) {
    const pattern = new RegExp(`(^|[^a-z0-9])${escapeRegExp(alias)}([^a-z0-9]|$)`);
    if (pattern.test(normalized)) {
      return target;
    }
  }
  const dollar = /\$([a-z]{1,5})\b/.exec(query.toLowerCase());
  if (dollar) {
    const symbol = dollar[1].toUpperCase();
    return { symbol, label: symbol };
  }
  const stockWord = /\b([a-z]{1,5})\s+(stocks?|shares?)\b/.exec(query.toLowerCase());
  if (stockWord && !TICKER_STOPWORDS.has(stockWord[1])) {
    const symbol = stockWord[1].toUpperCase();
    return { symbol, label: symbol };
  }
  return undefined;
}

/** Whether the instant answer carries nothing worth showing the model. */
export function isThinInstantAnswer(instant: InstantAnswer): boolean {
  return (
    !instant.answer && !instant.abstractText && !instant.definition && instant.topics.length === 0
  );
}

function truncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) {
    return text;
  }
  return `${text.slice(0, maxChars)}…(truncated)`;
}

function formatQuote(quote: MarketQuote): string {
  const price = quote.price.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4
  });
  const parts = [`Market quote — ${quote.label} (${quote.symbol}): ${price} ${quote.currency}`];
  if (quote.changePercent !== undefined) {
    const sign = quote.changePercent >= 0 ? '+' : '';
    parts.push(`(${sign}${quote.changePercent.toFixed(2)}%)`);
  }
  if (quote.marketTime) {
    const zone = quote.exchangeTimezone ? ` (${quote.exchangeTimezone})` : '';
    parts.push(`as of ${quote.marketTime}${zone}`);
  }
  return parts.join(' ');
}

/**
 * Render the layered results as the text the model summarizes. Sections the
 * backends could not fill are omitted; a fully empty search degrades to a
 * short no-results note instead of an error.
 */
export function formatSearchResults(query: string, data: WebSearchData): string {
  const lines = [`Web search results for "${query.trim()}":`, ''];
  if (data.quote) {
    lines.push(formatQuote(data.quote), '');
  }
  const instant = data.instant;
  if (instant.answer) {
    lines.push(`Answer: ${truncate(instant.answer, 500)}`, '');
  }
  if (instant.abstractText) {
    lines.push(truncate(instant.abstractText, 800));
    if (instant.abstractUrl) {
      const source = instant.abstractSource ? ` (${instant.abstractSource})` : '';
      lines.push(`Source: ${instant.abstractUrl}${source}`);
    }
    lines.push('');
  }
  if (instant.definition) {
    lines.push(`Definition: ${truncate(instant.definition, 500)}`, '');
  }
  if (instant.topics.length > 0) {
    lines.push('Related:');
    for (const topic of instant.topics) {
      const suffix = topic.url ? ` — ${topic.url}` : '';
      lines.push(`- ${truncate(topic.text, 200)}${suffix}`);
    }
    lines.push('');
  }
  if (data.wiki.length > 0) {
    lines.push('Wikipedia:');
    data.wiki.forEach((result, index) => {
      lines.push(`${index + 1}. ${truncate(result.title, 120)} — ${result.url}`);
      if (result.snippet) {
        lines.push(`   ${truncate(result.snippet, 300)}`);
      }
    });
    lines.push('');
  }
  if (!data.quote && isThinInstantAnswer(instant) && data.wiki.length === 0) {
    lines.push('No web results found. Try different keywords.');
  }
  return lines.join('\n').trimEnd();
}

/** Structural subset of the fetch API the search layers need (stub-friendly). */
export interface WebFetchResponse {
  readonly ok: boolean;
  readonly status: number;
  json(): Promise<unknown>;
  text(): Promise<string>;
}

export interface WebFetchInit {
  signal?: AbortSignal;
  headers?: Record<string, string>;
}

export interface WebFetch {
  (url: string, init?: WebFetchInit): Promise<WebFetchResponse>;
}

export interface WebSearchOptions {
  /** Per-request timeout in milliseconds (default 10000). */
  timeoutMs?: number;
}

const DUCKDUCKGO_HEADERS = { Accept: 'application/json', 'User-Agent': 'froggy-agent/0.0.1' };
const WIKIPEDIA_HEADERS = { Accept: 'application/json', 'User-Agent': 'froggy-agent/0.0.1' };
const YAHOO_HEADERS = { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0' };

async function fetchJson(
  fetchImpl: WebFetch,
  url: string,
  headers: Record<string, string>,
  timeoutMs: number
): Promise<unknown> {
  const response = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs), headers });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return response.json();
}

/**
 * Run the layered search: DuckDuckGo instant answers first, Wikipedia when
 * they come back thin, plus a market quote when the query names a known
 * symbol. Every layer degrades silently — a dead backend yields fewer
 * sections, never a failed search.
 */
export async function runWebSearch(
  query: string,
  fetchImpl: WebFetch,
  options?: WebSearchOptions
): Promise<WebSearchData> {
  const timeoutMs = options?.timeoutMs ?? 10_000;
  const target = resolveQuoteSymbol(query);
  const [instant, quote] = await Promise.all([
    fetchJson(fetchImpl, buildDuckDuckGoUrl(query), DUCKDUCKGO_HEADERS, timeoutMs)
      .then(parseDuckDuckGoResponse)
      .catch(() => emptyInstantAnswer()),
    target
      ? fetchJson(fetchImpl, buildYahooQuoteUrl(target.symbol), YAHOO_HEADERS, timeoutMs)
          .then((body) => parseYahooQuoteResponse(body, target.symbol, target.label))
          .catch(() => undefined)
      : Promise.resolve(undefined)
  ]);
  let wiki: WikipediaResult[] = [];
  if (isThinInstantAnswer(instant)) {
    wiki = await fetchJson(
      fetchImpl,
      buildWikipediaSearchUrl(query),
      WIKIPEDIA_HEADERS,
      timeoutMs
    )
      .then(parseWikipediaResponse)
      .catch(() => []);
  }
  return quote ? { instant, wiki, quote } : { instant, wiki };
}
