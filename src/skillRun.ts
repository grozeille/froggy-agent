import * as path from 'path';

/** Tool name must match the `languageModelTools` contribution in package.json. */
export const RUN_SKILL_TOOL_NAME = 'pocRunSkill';

/** Executable skills are `.github/skills/<name>/` folders containing this script. */
export const SKILLS_DIR_NAME = '.github/skills';
export const SKILL_SCRIPT_NAME = 'run.py';
/** Optional third-party dependencies, installed into the workspace .venv before running. */
export const REQUIREMENTS_FILE_NAME = 'requirements.txt';

/** Kill skill scripts after this long; cap what comes back to the model. */
export const SKILL_TIMEOUT_MS = 60_000;
export const MAX_SKILL_OUTPUT_CHARS = 20_000;

export interface RunSkillToolInput {
  /** Skill folder name; empty lists the runnable skills instead of running one. */
  skill: string;
  /** Extra arguments passed to the script (paths relative to the workspace root). */
  args?: string[];
}

export interface RunnableSkill {
  name: string;
  title: string;
  /** Frontmatter description, '' when the SKILL.md has none. */
  description: string;
}

/**
 * Resolve a model-provided skill reference to a skill folder name.
 * Returns undefined for empty, nested, absolute or escaping names so tools
 * can never leave `<workspace>/.github/skills`.
 */
export function resolveSkillName(input: string): string | undefined {
  const trimmed = input.trim();
  if (!trimmed || trimmed === '.' || trimmed === '..') {
    return undefined;
  }
  if (/^([a-zA-Z]:|\/|\\\\)/.test(trimmed)) {
    return undefined;
  }
  if (trimmed.includes('/') || trimmed.includes('\\')) {
    return undefined;
  }
  return trimmed;
}

/** Project-local interpreter: `<workspace>/.venv/.../python(.exe)`. */
export function venvPythonPath(workspaceRoot: string, platform = process.platform): string {
  return platform === 'win32'
    ? path.win32.join(workspaceRoot, '.venv', 'Scripts', 'python.exe')
    : path.posix.join(workspaceRoot, '.venv', 'bin', 'python');
}

/** Truncate long script output, keeping the head and marking the cut. */
export function truncateOutput(text: string, maxChars: number): string {
  if (text.length <= maxChars) {
    return text;
  }
  return `${text.slice(0, maxChars)}\n…(output truncated)`;
}

/** One skill as `name — title: description` (empty parts omitted). */
function formatSkillLine(skill: RunnableSkill): string {
  const head = skill.title ? `${skill.name} — ${skill.title}` : skill.name;
  return skill.description ? `${head}: ${skill.description}` : head;
}

function sortedSkills(skills: readonly RunnableSkill[]): RunnableSkill[] {
  return [...skills].sort((a, b) => a.name.localeCompare(b.name));
}

/** One skill per line, alphabetical, for the model. */
export function formatSkillList(skills: RunnableSkill[]): string {
  if (skills.length === 0) {
    return '(none)';
  }
  return sortedSkills(skills).map(formatSkillLine).join('\n');
}

/**
 * Preamble nudge listing the runnable skills (name + description) so the
 * model routes matching requests to the skill runner instead of the
 * terminal or its own knowledge. Empty when no skill is runnable.
 */
export function formatSkillsHint(skills: readonly RunnableSkill[], toolName: string): string {
  if (skills.length === 0) {
    return '';
  }
  const catalog = sortedSkills(skills).map(formatSkillLine).join('; ');
  return (
    ` Runnable skills: ${catalog}.` +
    ` When the user's request matches a skill, call the "${toolName}" tool with that skill` +
    ` (file arguments as paths relative to the workspace root, e.g. "data/notes.md") instead of` +
    ` using the terminal or answering from knowledge.`
  );
}

/**
 * Render an executable + arguments as one command line for the action log:
 * parts with whitespace or quotes are double-quoted (inner quotes doubled).
 */
export function formatCommandLine(executable: string, args: readonly string[]): string {
  return [executable, ...args].map(quoteCommandPart).join(' ');
}

function quoteCommandPart(part: string): string {
  if (!/[\s"]/.test(part)) {
    return part;
  }
  return `"${part.replace(/"/g, '""')}"`;
}

/**
 * Commands executed by the skill runner during the current tool call (pip
 * install, python run). The tool records them, the panel drains them into
 * the action log right after each invocation. Best-effort: the agent loop
 * invokes tools sequentially, so one buffer per call is enough.
 */
let runCommands: string[] = [];

export function recordRunCommand(command: string): void {
  runCommands.push(command);
}

export function takeRunCommands(): string[] {
  const commands = runCommands;
  runCommands = [];
  return commands;
}
