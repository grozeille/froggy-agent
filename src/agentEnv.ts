/**
 * Short environment preamble prepended (unsaved) to every model request so
 * generated terminal commands match the machine. Kept to one or two lines:
 * it costs tokens on every turn.
 */
export function agentEnvironmentPreamble(platform = process.platform): string {
  if (platform === 'win32') {
    return (
      'System: Windows. Run shell commands with Windows CMD/PowerShell syntax ' +
      '(dir, type, systeminfo, findstr). Never use Linux/macOS commands ' +
      '(no ls, cat, grep, free, top, head) or Unix-style paths.'
    );
  }
  if (platform === 'darwin') {
    return 'System: macOS (zsh). Use Unix shell commands. Never use Windows-only commands.';
  }
  return 'System: Linux (bash). Use Unix shell commands. Never use Windows-only commands.';
}

/**
 * Terminal execution tools, builtin first: the builtin `pocRunTerminal` is
 * confirmed in-chat only, while `run_in_terminal` would also show VS Code's
 * native popup — so the model is nudged to the builtin when both are offered.
 */
const TERMINAL_TOOL_NAMES: readonly string[] = ['pocRunTerminal', 'run_in_terminal'];

/**
 * Grounding nudge, appended to every request: past turns replay tool calls
 * with their results, so the model must not redo completed actions and only
 * answers the latest user message.
 */
export function historyGroundingHint(): string {
  return (
    ' Previous turns may include tool calls with their results: do not repeat ' +
    'actions that were already completed; only respond to the latest user message.'
  );
}

/**
 * Default-to-tool nudge, appended to the preamble only when a terminal tool
 * is actually offered — so plain questions stay plain answers and models
 * without the tool are never told to call it.
 */
export function terminalToolHint(offeredToolNames: readonly string[]): string {
  const name = TERMINAL_TOOL_NAMES.find((candidate) => offeredToolNames.includes(candidate));
  if (!name) {
    return '';
  }
  return (
    ` When the user asks to run, execute or check something on this machine, ` +
    `call the "${name}" tool with the command instead of answering from knowledge.`
  );
}

/**
 * Clarification nudge, appended to every request: vague requests get one
 * short question instead of a guess — but only when the missing detail
 * actually changes the result, so obvious cases stay one-step answers.
 */
export function clarificationHint(): string {
  return (
    ' If the request is ambiguous in a way that changes the result (which file,' +
    ' how many items, what scope), ask one short clarifying question instead of' +
    ' guessing. Do not ask when the answer would not change what you do.'
  );
}
