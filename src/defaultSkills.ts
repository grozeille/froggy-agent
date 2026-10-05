/**
 * Built-in skills shipped with the extension. The templates are embedded so
 * project setup needs no extra packaging: they compile into the extension
 * and are written to `.github/skills/<name>/` on a fresh workspace. Content
 * mirrors the demo-project skills (LF line endings, trailing newline).
 * This file intentionally stays LF-only so the templates are identical on
 * every checkout, whatever the platform line endings.
 */

export interface DefaultSkillFiles {
  /** Skill folder name under `.github/skills`. */
  name: string;
  /** Full `SKILL.md` content. */
  skillMd: string;
  /** Full `run.py` content, when the skill is runnable. */
  runPy?: string;
  /** `requirements.txt` content, when the skill needs third-party packages. */
  requirements?: string;
}

const BROWSER_SEARCH_SKILL_MD = `---
name: browser-search
description: Open a browser inside VS Code and run a Google search for what the user asks about. Use when the user wants to search the web, look something up, or google a question.
---

# Browser Search

Open a browser inside VS Code and search Google for what the user asks.

## When to use

- The user asks to search the web, google something, or look up information online.
- The user asks to open a browser without leaving VS Code.

## How to do it

1. Take the user's question or topic and turn it into a short search query.
2. Call the \`#googleSearch\` tool with that query.
3. The tool opens \`google.com\` search results in the VS Code Simple Browser.
4. Confirm to the user what you searched for.

## Rules

- Always use the \`#googleSearch\` tool so the browser opens **inside VS Code**.
  Do not open an external browser and do not run terminal commands to open URLs.
- Keep the query short: a few keywords, no full sentences.
- If the user's request is not a search (e.g. they want you to write code),
  do the task directly instead of searching.

## Example

User: "search for the VS Code Simple Browser docs"

Tool call: \`#googleSearch\` with \`query: "VS Code Simple Browser docs"\`

Reply: "I opened a Google search for 'VS Code Simple Browser docs' in VS Code."
`;

const COUNT_WORDS_SKILL_MD = `---
name: count-words
description: Count lines, words and characters of a data file. Use when the user wants basic stats about a file.
---

# Count Words

Count lines, words and characters of a file.

## When to use

- The user asks how long a file is, how many words or lines it has.

## How to do it

1. Run the \`count-words\` skill with the file path as argument (relative to
   the workspace root, e.g. \`data/notes.md\`).
2. Report the counts to the user.

## Rules

- The skill runs a pre-designed local script; do not read the file yourself
  just to count — let the script do it.
`;

const COUNT_WORDS_RUN_PY = `"""Count lines, words and characters of a file.

Usage: run.py <path>  (path relative to the workspace root, e.g. data/notes.md)
"""

import sys


def main() -> int:
    if len(sys.argv) != 2:
        print("usage: run.py <path>", file=sys.stderr)
        return 2
    with open(sys.argv[1], encoding="utf-8") as handle:
        text = handle.read()
    print(f"lines: {len(text.splitlines())}")
    print(f"words: {len(text.split())}")
    print(f"characters: {len(text)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
`;

const SKILL_FACTORY_SKILL_MD = `---
name: skill-factory
description: Build a new workspace skill that automates a task with a command-line Python script. Use when the user asks to create, add or generate a skill, or to automate a recurring task for reuse.
---

# Skill Factory

Build a new workspace skill: a \`.github/skills/<name>/\` folder with a \`SKILL.md\`
guide plus a command-line \`run.py\` script.

## When to use

- The user asks to create, add or generate a skill.
- The user asks to automate a recurring task or save a workflow for reuse.

## How to do it

1. Take the user's goal and expected output and, when it helps, a short
   lowercase skill name (letters, digits, hyphens); omit the name to derive
   one from the task. Never prescribe an implementation: the factory always
   builds a command-line Python script.
2. Call the \`#createSkill\` tool with the task. The main chat delegates the
   build to a dedicated Python-developer agent.
3. The agent ensures the workspace Python (alerting when Python is missing,
   creating \`.venv\` when absent and ignoring it via \`.gitignore\`), writes
   \`.github/skills/<name>/SKILL.md\` plus \`run.py\` (standard library preferred,
   third-party packages declared in \`requirements.txt\`), syntax-checks the
   script, and hands the new skill back.
4. Confirm to the user what was created and run it via \`#runSkill\` on request.

## Rules

- Always delegate to the \`#createSkill\` tool so the dedicated builder agent
  writes the skill files. Do not write \`SKILL.md\`, \`run.py\` or
  \`requirements.txt\` yourself and do not scaffold them via terminal commands.
- Prefer the standard library; third-party packages go in \`requirements.txt\`,
  one pinned package per line — the runner installs them into the workspace
  \`.venv\`.
- Never overwrite an existing skill: if the name is taken, pick another one.
- Keep the task focused on one automation; one skill does one job.

## Example

User: "automate my weekly status report"

Tool call: \`#createSkill\` with \`task: "generate a weekly status report from the data files"\`

Reply: "Created the 'weekly-status-report' skill. Say the word and I'll run it."
`;

/** Every skill a fresh project starts with. All standard library: no requirements. */
export const DEFAULT_SKILLS: readonly DefaultSkillFiles[] = [
  { name: 'browser-search', skillMd: BROWSER_SEARCH_SKILL_MD },
  { name: 'count-words', skillMd: COUNT_WORDS_SKILL_MD, runPy: COUNT_WORDS_RUN_PY },
  { name: 'skill-factory', skillMd: SKILL_FACTORY_SKILL_MD }
];

/** Built-in identity is the folder name: a same-named user skill counts as built-in. */
export const DEFAULT_SKILL_NAMES: readonly string[] = DEFAULT_SKILLS.map(
  (skill) => skill.name
);

export function isBuiltinSkill(skillName: string): boolean {
  return DEFAULT_SKILL_NAMES.includes(skillName);
}
