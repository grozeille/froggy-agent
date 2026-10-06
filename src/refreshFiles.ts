/** Tool name must match the `languageModelTools` contribution in package.json. */
export const REFRESH_FILES_TOOL_NAME = 'froggyRefreshFiles';

/**
 * Files-view refresh nudge, appended to the preamble only when the refresh
 * tool is actually offered — so files the model creates, modifies, moves,
 * renames or deletes (terminal commands, skill scripts) show up in the
 * Files view without the user hunting for the refresh button.
 */
export function refreshFilesHint(offeredToolNames: readonly string[]): string {
  if (!offeredToolNames.includes(REFRESH_FILES_TOOL_NAME)) {
    return '';
  }
  return (
    ` When you create, modify, move, rename or delete files, call the` +
    ` "${REFRESH_FILES_TOOL_NAME}" tool afterwards (before answering) so the` +
    ` Files view lists the change.`
  );
}
