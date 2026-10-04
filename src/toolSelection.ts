/** Setting `poc-vscode-addin.tools`: extra tool names offered to the model. */
export const TOOL_SETTING_KEY = 'tools';

/**
 * Builtins-only default: no external tool is offered, so every confirmation
 * happens in-chat and VS Code never shows a native tool popup. Extra names
 * from the setting are offered as-is; external action tools may still show
 * their own native popup on top of the in-chat card.
 */
export const TOOL_SETTING_DEFAULT: readonly string[] = [];

/** Setting `poc-vscode-addin.confirmTools`: tools needing user confirmation. */
export const CONFIRM_SETTING_KEY = 'confirmTools';

/**
 * Tools asking for confirmation before running: terminal execution and the
 * skill runner (model-chosen skill + args). Reads outside `<workspace>/data`
 * are only possible through these, so gating them covers that too.
 */
export const CONFIRM_SETTING_DEFAULT: readonly string[] = [
  'pocRunTerminal',
  'run_in_terminal',
  'send_to_terminal',
  'pocRunSkill'
];

/**
 * External terminal tools superseded by the builtin `pocRunTerminal`: they
 * stay usable but are not offered to the model when the builtin is available,
 * because invoking them would show VS Code's own confirmation popup on top
 * of the in-chat card (double prompt for a single run).
 */
export const EXTERNAL_TERMINAL_TOOL_NAMES: readonly string[] = [
  'run_in_terminal',
  'send_to_terminal'
];

/** Structural subset of `vscode.LanguageModelToolInformation` used for matching. */
export interface AgentToolInfo {
  name: string;
}

/** Whether invoking `toolName` needs an explicit user confirmation. */
export function needsConfirmation(toolName: string, confirmList: readonly string[]): boolean {
  return confirmList.includes(toolName);
}

/** User-facing confirmation card content: a plain question plus what will run. */
export interface ToolCallDescription {
  title: string;
  detail: string;
}

function stringField(input: unknown, names: readonly string[]): string | undefined {
  if (typeof input !== 'object' || input === null) {
    return undefined;
  }
  const record = input as Record<string, unknown>;
  for (const name of names) {
    const value = record[name];
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }
  return undefined;
}

function stringArrayField(input: unknown, name: string): string[] {
  if (typeof input !== 'object' || input === null) {
    return [];
  }
  const value = (input as Record<string, unknown>)[name];
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === 'string');
}

function truncateDetail(text: string, maxChars: number): string {
  if (text.length <= maxChars) {
    return text;
  }
  return `${text.slice(0, maxChars)}…(truncated)`;
}

/**
 * Describe a gated tool call for the in-chat confirmation card. Terminal
 * tools show the command plus the model's explanation (the popup summary,
 * without the popup); the skill runner shows the skill and its arguments;
 * anything else falls back to the tool name with a JSON summary.
 */
export function describeToolCall(
  toolName: string,
  input: unknown,
  maxChars: number
): ToolCallDescription {
  if (toolName === 'pocRunTerminal' || EXTERNAL_TERMINAL_TOOL_NAMES.includes(toolName)) {
    const command = stringField(input, ['command', 'text', 'value']);
    if (command) {
      const explanation = stringField(input, ['explanation', 'goal']);
      const detail = explanation ? `${command}\n${explanation}` : command;
      return { title: 'Run this command?', detail: truncateDetail(detail, maxChars) };
    }
  }
  if (toolName === 'pocRunSkill') {
    const skill = stringField(input, ['skill']);
    if (!skill) {
      return { title: 'List the runnable skills?', detail: summarizeToolInput(input, maxChars) };
    }
    const args = stringArrayField(input, 'args');
    const lines = [`Skill: ${skill}`];
    if (args.length > 0) {
      lines.push(`Arguments: ${args.join(' ')}`);
    }
    return {
      title: `Run the "${skill}" skill?`,
      detail: truncateDetail(lines.join('\n'), maxChars)
    };
  }
  return { title: `Run "${toolName}"?`, detail: summarizeToolInput(input, maxChars) };
}

/** One-line JSON summary of a tool input for the confirmation dialog. */
export function summarizeToolInput(input: unknown, maxChars: number): string {
  let rendered: string;
  try {
    rendered = JSON.stringify(input) ?? String(input);
  } catch {
    rendered = '[unserializable input]';
  }
  if (rendered.length <= maxChars) {
    return rendered;
  }
  return `${rendered.slice(0, maxChars)}…(truncated)`;
}

/**
 * Resolve the tools to offer the model: builtins first (in order), then the
 * extra names from the setting (in order). Unknown names are skipped and
 * duplicates collapsed; matching is case-sensitive on tool names.
 */
export function resolveAgentTools<T extends AgentToolInfo>(
  available: readonly T[],
  builtinNames: readonly string[],
  extraNames: readonly string[]
): T[] {
  const byName = new Map(available.map((tool) => [tool.name, tool]));
  const picked: T[] = [];
  const seen = new Set<string>();
  for (const name of [...builtinNames, ...extraNames]) {
    if (seen.has(name)) {
      continue;
    }
    seen.add(name);
    const tool = byName.get(name);
    if (tool) {
      picked.push(tool);
    }
  }
  return picked;
}

/**
 * Drop external terminal tools when the builtin terminal tool was resolved:
 * the leftover would otherwise trigger VS Code's native confirmation popup
 * in addition to the in-chat card. Without the builtin, keep everything.
 */
export function dropSupersededTerminalTools<T extends AgentToolInfo>(
  picked: readonly T[],
  builtinTerminalName: string
): T[] {
  if (!picked.some((tool) => tool.name === builtinTerminalName)) {
    return [...picked];
  }
  return picked.filter((tool) => !EXTERNAL_TERMINAL_TOOL_NAMES.includes(tool.name));
}
