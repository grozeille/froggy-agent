import { MEMORY_FILE_NAME } from './sections';

/** Tool names must match the `languageModelTools` contributions in package.json. */
export const READ_MEMORY_TOOL_NAME = 'froggyReadMemory';
export const APPEND_MEMORY_TOOL_NAME = 'froggyAppendMemory';

/** Memory file at the workspace root, shared with the sidebar Memory item. */
export const MEMORY_PATH = MEMORY_FILE_NAME;

/** Memory stays small by design: refuse to send or store more than this. */
export const MAX_MEMORY_BYTES = 20_000;

/** One appended note is a single fact: refuse longer dumps. */
export const MAX_MEMORY_NOTE_CHARS = 2000;

export interface AppendMemoryToolInput {
  /** One short fact to remember, e.g. the user's name. */
  note: string;
}

/**
 * Resolve a model-provided input to the note to append.
 * Returns undefined for missing or blank notes.
 */
export function resolveMemoryNote(input: unknown): string | undefined {
  if (typeof input !== 'object' || input === null) {
    return undefined;
  }
  const note = (input as { note?: unknown }).note;
  if (typeof note !== 'string') {
    return undefined;
  }
  const trimmed = note.trim();
  return trimmed ? trimmed : undefined;
}

/** Render memory.md content for the model, marking the empty state. */
export function formatMemoryContent(text: string): string {
  return text.trim() ? text : '(empty — nothing memorized yet)';
}
