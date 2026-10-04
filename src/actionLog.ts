/** One recorded tool execution, shown in the per-session action log tab. */
export interface ActionLogEntry {
  at: number;
  tool: string;
  input: string;
  decision: 'auto' | 'approved' | 'declined';
  /** Commands executed during the run (skill runner), drained per tool call. */
  commands?: string[];
  output?: string;
}

/** How many runs are kept per session (in memory, newest wins). */
export const MAX_ACTION_LOG_ENTRIES = 50;

/** Append a run, dropping the oldest entries past the cap. */
export function appendActionLog(
  log: ActionLogEntry[],
  entry: ActionLogEntry,
  max: number = MAX_ACTION_LOG_ENTRIES
): ActionLogEntry[] {
  return [...log, entry].slice(-Math.max(max, 1));
}

/** Remove ANSI color codes so terminal output reads cleanly in the log tab. */
export function stripAnsi(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\u001B\[[0-9;]*m/g, '');
}

/** Render a session's runs as plain text for the log tab. */
export function formatActionLog(entries: ActionLogEntry[]): string {
  if (entries.length === 0) {
    return 'No tool actions recorded for this session yet.';
  }
  const blocks = entries.map((entry) => {
    const when = new Date(entry.at).toLocaleString();
    const head = `[${when}] ${entry.tool} (${entry.decision})\ninput: ${entry.input}`;
    const withCommands = entry.commands?.length
      ? `${head}\ncommands:\n${entry.commands.join('\n')}`
      : head;
    return entry.output ? `${withCommands}\noutput:\n${entry.output}` : withCommands;
  });
  return `Action log — tool runs for this session\n\n${blocks.join('\n\n---\n\n')}`;
}
