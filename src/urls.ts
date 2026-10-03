/** Only plain web links may be opened from webview content. */
export function isSafeHttpUrl(url: string): boolean {
  try {
    const protocol = new URL(url.trim()).protocol;
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}
