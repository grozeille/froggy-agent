/** Tool name must match the `languageModelTools` contribution in package.json. */
export const CREATE_SKILL_TOOL_NAME = 'pocCreateSkill';

/** The two files every built skill contains. */
export const SKILL_MD_NAME = 'SKILL.md';

/** Cap the task echoed into the builder prompt; cap each generated file. */
export const MAX_SKILL_TASK_CHARS = 2000;
export const MAX_SKILL_FILE_CHARS = 50_000;

/** Markers framing the builder agent's answer so its files can be parsed. */
export const SKILL_MD_MARKER = '---SKILL.MD---';
export const RUN_PY_MARKER = '---RUN.PY---';
export const BUILDER_END_MARKER = '---END---';
export const REQUIREMENTS_MARKER = '---REQUIREMENTS.TXT---';

export interface CreateSkillToolInput {
  /** What the new skill should automate. */
  task: string;
  /** Short lowercase skill folder name; omitted derives one from the task. */
  skill?: string;
}

export interface BuiltSkillFiles {
  skillMd: string;
  script: string;
  /** requirements.txt content, when the builder declared third-party packages. */
  requirements?: string;
}

/**
 * Resolve a model-provided task to the text sent to the builder agent.
 * Returns undefined for missing or blank tasks.
 */
export function resolveTask(input: unknown): string | undefined {
  if (typeof input !== 'object' || input === null) {
    return undefined;
  }
  const task = (input as { task?: unknown }).task;
  if (typeof task !== 'string') {
    return undefined;
  }
  const trimmed = task.trim();
  return trimmed ? trimmed.slice(0, MAX_SKILL_TASK_CHARS) : undefined;
}

/**
 * Resolve a model-provided skill name to a folder name.
 * Lowercase letters, digits and hyphens only, starting with a letter or
 * digit; returns undefined for anything else so tools can never leave
 * `<workspace>/.github/skills`.
 */
export function resolveNewSkillName(input: string): string | undefined {
  const trimmed = input.trim().toLowerCase();
  if (!trimmed || trimmed.length > 64) {
    return undefined;
  }
  if (!/^[a-z0-9][a-z0-9-]*$/.test(trimmed) || trimmed.endsWith('-')) {
    return undefined;
  }
  return trimmed;
}

/**
 * Derive a valid skill folder name from a task ("Count words!" ->
 * "count-words"), capped at 32 chars. Always returns a name that
 * `resolveNewSkillName` accepts.
 */
export function suggestSkillName(task: string): string {
  const slug = task
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+/, '')
    .slice(0, 32)
    .replace(/-+$/, '');
  return resolveNewSkillName(slug) ?? 'new-skill';
}

/** First sentence of the task (capped), for generated frontmatter. */
export function skillDescriptionFromTask(task: string): string {
  const first = task.split(/[.!\n]/, 1)[0]?.trim() ?? '';
  const singleLine = first.replace(/\s+/g, ' ').trim();
  if (!singleLine) {
    return 'Workspace skill built by the skill factory.';
  }
  const max = 140;
  return singleLine.length > max ? `${singleLine.slice(0, max).trimEnd()}…` : singleLine;
}

/**
 * Prompt for the dedicated Python-developer sub-agent: role, the two files a
 * skill is made of, CLI conventions (workspace-root cwd, stdout results,
 * stderr usage errors), and the strict marker layout its answer must follow.
 */
export function buildSkillBuilderPrompt(task: string, skillName: string): string {
  return (
    `You are a Python developer agent that builds workspace skills. ` +
    `A skill automates one task with a command-line Python script.\n\n` +
    `Build the skill "${skillName}" for this task: ${task}\n\n` +
    `A skill is a folder ".github/skills/${skillName}/" with two files you must write:\n\n` +
    `1. SKILL.md — starts with YAML frontmatter, then usage notes:\n` +
    `---\nname: ${skillName}\ndescription: <one line: what it does and when to use it>\n---\n\n` +
    `# <Title>\n\n` +
    `...when to use it, how to run it (via the skill runner with ` +
    `workspace-relative paths like "data/notes.md"), and rules...\n\n` +
    `2. run.py — a command-line Python script. Prefer the standard library; use ` +
    `third-party packages only when the task genuinely needs them, declared one ` +
    `per line (pinned, e.g. "requests==2.32.3") in a third file, requirements.txt, ` +
    `which the runner installs into the workspace .venv before running:\n` +
    `- reads file arguments as paths relative to the workspace root ` +
    `(it runs with the workspace root as its working directory);\n` +
    `- prints its result to stdout; usage errors go to stderr with exit code 2;\n` +
    `- parses arguments with argparse or sys.argv and shows a usage line;\n` +
    `- runs non-interactively (no stdin, no tty): never use input(); every ` +
    `user-adjustable value is a CLI argument with a sensible default, documented ` +
    `in SKILL.md so the main chat can ask the user before running.\n\n` +
    `Rules: keep both files short and focused on the task; never invent data ` +
    `files; never use network access unless the task needs it. If the task names ` +
    `PowerShell, CMD, shell commands, or another language, treat that as context ` +
    `about WHAT is needed, not HOW: always implement in Python using only the ` +
    `standard library.\n\n` +
    `Reply with exactly this layout (file contents between the markers):\n` +
    `${SKILL_MD_MARKER}\n<full SKILL.md content>\n${RUN_PY_MARKER}\n<full run.py content>\n${BUILDER_END_MARKER}\n` +
    `When third-party packages are needed, insert ${REQUIREMENTS_MARKER} plus the ` +
    `requirements.txt content (one pinned package per line) between the run.py ` +
    `content and ${BUILDER_END_MARKER}.`
  );
}

/**
 * Extract the skill files from the builder agent's answer: SKILL.md, run.py,
 * plus requirements.txt when the builder declared third-party packages.
 * Lenient about prose around the markers, strict about their order and
 * non-empty contents.
 */
export function parseBuilderOutput(text: string): BuiltSkillFiles | undefined {
  const mdStart = text.indexOf(SKILL_MD_MARKER);
  const pyStart = text.indexOf(RUN_PY_MARKER);
  if (mdStart === -1 || pyStart === -1 || pyStart <= mdStart) {
    return undefined;
  }
  const endStart = text.indexOf(BUILDER_END_MARKER);
  const reqStart = text.indexOf(REQUIREMENTS_MARKER);
  const hasRequirements = reqStart !== -1 && reqStart > pyStart;
  let scriptEnd = text.length;
  if (hasRequirements) {
    scriptEnd = reqStart;
  } else if (endStart !== -1 && endStart > pyStart) {
    scriptEnd = endStart;
  }
  const skillMd = text.slice(mdStart + SKILL_MD_MARKER.length, pyStart).trim();
  const script = text.slice(pyStart + RUN_PY_MARKER.length, scriptEnd).trim();
  if (!skillMd || !script) {
    return undefined;
  }
  if (!hasRequirements) {
    return { skillMd, script };
  }
  const reqEnd = endStart !== -1 && endStart > reqStart ? endStart : text.length;
  const requirements = text.slice(reqStart + REQUIREMENTS_MARKER.length, reqEnd).trim();
  return requirements ? { skillMd, script, requirements } : { skillMd, script };
}

/**
 * Guarantee usable frontmatter: builder output starting with `---` is kept
 * as-is (routing reads its `description:`), otherwise a generated block is
 * prepended so the new skill still routes correctly.
 */
export function ensureSkillMdFrontmatter(
  skillMd: string,
  skillName: string,
  description: string
): string {
  if (skillMd.split(/\r?\n/, 1)[0]?.trim() === '---') {
    return skillMd;
  }
  const oneLine = description.replace(/\s+/g, ' ').trim() || skillName;
  return `---\nname: ${skillName}\ndescription: ${oneLine}\n---\n\n${skillMd.trim()}\n`;
}

/** Reject empty or oversized generated files with a human-readable reason. */
export function validateBuiltSkillFiles(files: BuiltSkillFiles): string | undefined {
  if (!files.skillMd.trim()) {
    return 'The skill builder returned an empty SKILL.md. Rephrase the task and try again.';
  }
  if (!files.script.trim()) {
    return 'The skill builder returned an empty run.py. Rephrase the task and try again.';
  }
  if (files.requirements !== undefined && !files.requirements.trim()) {
    return 'The skill builder returned an empty requirements.txt. Rephrase the task and try again.';
  }
  if (
    files.skillMd.length > MAX_SKILL_FILE_CHARS ||
    files.script.length > MAX_SKILL_FILE_CHARS ||
    (files.requirements?.length ?? 0) > MAX_SKILL_FILE_CHARS
  ) {
    return `The skill builder returned files over ${MAX_SKILL_FILE_CHARS} characters. Rephrase the task and try again.`;
  }
  return undefined;
}

/**
 * Preamble nudge so the main chat delegates skill-creation requests to the
 * factory instead of writing scripts itself or via the terminal.
 */
export function formatCreateSkillHint(toolName: string): string {
  return (
    ` When the user asks to create, add or generate a skill, or to automate a recurring` +
    ` task for reuse, call the "${toolName}" tool instead of writing scripts yourself` +
    ` or via the terminal. The factory always builds a command-line Python script:` +
    ` describe the goal and the expected output in the task, never an implementation` +
    ` (no language, shell, or commands to use).`
  );
}

/**
 * Result text handed back to the main chat once the skill is on disk.
 * `envNote` is the preformatted environment sentence (empty when the
 * workspace Python was already in place). `hasRequirements` names
 * requirements.txt in the file list.
 */
export function formatCreatedSkillSummary(
  skillName: string,
  description: string,
  runSkillToolName: string,
  envNote = '',
  hasRequirements = false
): string {
  return (
    `Created skill "${skillName}" in .github/skills/${skillName}/ (` +
    `${hasRequirements ? 'SKILL.md + run.py + requirements.txt' : 'SKILL.md + run.py'}, ` +
    `script syntax-checked).` +
    (description ? ` Description: ${description}` : '') +
    ` It is now runnable via the "${runSkillToolName}" tool.` +
    envNote
  );
}
