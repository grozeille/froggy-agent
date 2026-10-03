export function isMarkdownFile(fileName: string): boolean {
  return /\.(md|markdown)$/i.test(fileName.trim());
}

/** Shared input validation for new/renamed files and folders. */
export function validateFileName(name: string): string | undefined {
  if (!name.trim()) {
    return 'Name cannot be empty.';
  }
  if (/[/\\]/.test(name)) {
    return 'Name cannot contain slashes.';
  }
  return undefined;
}

/** Name for the n-th copy: `a.txt` -> `a copy.txt` -> `a copy 2.txt`. */
export function copyNameFor(fileName: string, attempt: number): string {
  if (attempt <= 0) {
    return fileName;
  }
  const suffix = attempt === 1 ? ' copy' : ` copy ${attempt}`;
  const dot = fileName.lastIndexOf('.');
  if (dot <= 0) {
    return `${fileName}${suffix}`;
  }
  return `${fileName.slice(0, dot)}${suffix}${fileName.slice(dot)}`;
}
