/** Tool names must match the `languageModelTools` contributions in package.json. */
export const READ_DATA_FILE_TOOL_NAME = 'pocReadDataFile';
export const LIST_DATA_FILES_TOOL_NAME = 'pocListDataFiles';

/** Refuse to send more than this many bytes of file content to the model. */
export const MAX_DATA_FILE_BYTES = 100_000;

export interface ReadDataFileToolInput {
  path: string;
}

export interface ListDataFilesToolInput {
  /** Subfolder inside the data folder; omit for the root. */
  path?: string;
}

export interface DataDirEntry {
  name: string;
  isDirectory: boolean;
}

/**
 * Resolve a model-provided path to a slash-separated path relative to the
 * data folder. Returns undefined for empty, absolute or escaping (`..`)
 * paths so tools can never leave `<workspace>/data`.
 */
export function resolveDataRelativePath(input: string): string | undefined {
  const trimmed = input.trim().replace(/\\/g, '/');
  if (!trimmed) {
    return undefined;
  }
  if (/^([a-zA-Z]:|\/)/.test(trimmed)) {
    return undefined;
  }
  const segments = trimmed.split('/').filter((segment) => segment !== '' && segment !== '.');
  if (segments.length === 0 || segments.some((segment) => segment === '..')) {
    return undefined;
  }
  return segments.join('/');
}

/** One entry per line (`name/` for folders), folders first, alphabetical. */
export function formatFileListing(entries: DataDirEntry[]): string {
  return [...entries]
    .sort(
      (a, b) => Number(b.isDirectory) - Number(a.isDirectory) || a.name.localeCompare(b.name)
    )
    .map((entry) => (entry.isDirectory ? `${entry.name}/` : entry.name))
    .join('\n');
}
