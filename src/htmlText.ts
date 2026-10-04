/**
 * Dependency-free HTML helpers shared by the web tools: search snippets and
 * fetched pages arrive as HTML and must be reduced to plain text for the
 * model. Kept deliberately small — no DOM, no entities table beyond the
 * common cases plus numeric references.
 */

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' '
};

/** Decode common named entities plus decimal/hex numeric references. */
export function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_match, digits: string) => {
      const code = Number.parseInt(digits, 10);
      return Number.isSafeInteger(code) ? String.fromCodePoint(code) : _match;
    })
    .replace(/&#x([0-9a-fA-F]+);/g, (_match, digits: string) => {
      const code = Number.parseInt(digits, 16);
      return Number.isSafeInteger(code) ? String.fromCodePoint(code) : _match;
    })
    .replace(/&(amp|lt|gt|quot|apos|nbsp);/g, (_match, name: string) => {
      return NAMED_ENTITIES[name] ?? _match;
    });
}

const UNREADABLE_BLOCKS = /<(script|style|noscript|template)[^>]*>[\s\S]*?<\/\1\s*>/gi;
const HTML_COMMENTS = /<!--[\s\S]*?-->/g;
const BLOCK_TAGS = /<\/?(p|div|section|article|header|footer|main|aside|nav|h[1-6]|ul|ol|li|dl|dt|dd|table|thead|tbody|tr|td|th|br|hr|pre|blockquote|figure|figcaption)[^>]*>/gi;
const INLINE_TAGS = /<[^>]+>/g;

/**
 * Strip tags (and unreadable blocks) from an HTML fragment. Block tags
 * become spaces so paragraphs stay separated; inline tags vanish so
 * `<span>S</span>&amp;<span>P</span>` still reads `S&P`.
 */
export function stripHtmlTags(html: string): string {
  return decodeHtmlEntities(
    html
      .replace(UNREADABLE_BLOCKS, ' ')
      .replace(HTML_COMMENTS, ' ')
      .replace(BLOCK_TAGS, ' ')
      .replace(INLINE_TAGS, '')
  );
}

/** Collapse runs of whitespace to single spaces and trim. */
export function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

export interface HtmlPageText {
  title: string;
  text: string;
}

/**
 * Reduce a full HTML page to its title plus readable text. Prefers the
 * `<body>` content when present; script/style/comments never leak through.
 */
export function htmlToText(html: string): HtmlPageText {
  const titleMatch = /<title[^>]*>([\s\S]*?)<\/title\s*>/i.exec(html);
  const title = titleMatch ? collapseWhitespace(stripHtmlTags(titleMatch[1])) : '';
  const bodyMatch = /<body[^>]*>([\s\S]*?)<\/body\s*>/i.exec(html);
  const source = bodyMatch ? bodyMatch[1] : html;
  const text = collapseWhitespace(stripHtmlTags(source));
  return { title, text };
}

/** Extract readable text from a short HTML snippet (search results). */
export function snippetToText(html: string): string {
  return collapseWhitespace(stripHtmlTags(html));
}
