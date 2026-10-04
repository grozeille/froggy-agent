/** Tool name must match the `languageModelTools` contribution in package.json. */
export const TERMINAL_TOOL_NAME = 'pocRunTerminal';

/** Kill terminal commands after this long; cap what comes back to the model. */
export const TERMINAL_TIMEOUT_MS = 60_000;
export const MAX_TERMINAL_OUTPUT_CHARS = 20_000;

export interface TerminalToolInput {
  /** Shell command to run, with OS-matching syntax (see the agent preamble). */
  command: string;
  /** Short explanation of what the command does, shown in the confirmation card. */
  explanation?: string;
}

/**
 * Resolve a model-provided terminal input to the command to run.
 * Returns undefined for missing or blank commands so the tool can never
 * run an empty shell invocation.
 */
export function resolveTerminalCommand(input: unknown): string | undefined {
  if (typeof input !== 'object' || input === null) {
    return undefined;
  }
  const command = (input as { command?: unknown }).command;
  if (typeof command !== 'string') {
    return undefined;
  }
  const trimmed = command.trim();
  return trimmed ? trimmed : undefined;
}
