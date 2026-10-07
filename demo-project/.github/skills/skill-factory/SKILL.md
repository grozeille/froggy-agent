---
name: skill-factory
description: Build a new workspace skill that automates a task with a command-line Python script. Use when the user asks to create, add or generate a skill, or to automate a recurring task for reuse.
---

# Skill Factory

Build a new workspace skill: a `.github/skills/<name>/` folder with a `SKILL.md`
guide plus a command-line `run.py` script.

## When to use

- The user asks to create, add or generate a skill.
- The user asks to automate a recurring task or save a workflow for reuse.

## How to do it

1. Take the user's goal and expected output and, when it helps, a short
   lowercase skill name (letters, digits, hyphens); omit the name to derive
   one from the task. Never prescribe an implementation: the factory always
   builds a command-line Python script.
2. Call the `#createSkill` tool with the task. The main chat delegates the
   build to a dedicated Python-developer agent.
3. The agent ensures the workspace Python (alerting when Python is missing,
   creating `.venv` when absent and ignoring it via `.gitignore`), writes
   `.github/skills/<name>/SKILL.md` plus `run.py` (standard library preferred,
   third-party packages declared in `requirements.txt`), dry-runs the
   script in a staging folder (fixing it over up to 3 attempts), and hands
   the new skill back.
4. Confirm to the user what was created and run it via `#runSkill` on request.

## Rules

- Always delegate to the `#createSkill` tool so the dedicated builder agent
  writes the skill files. Do not write `SKILL.md`, `run.py` or
  `requirements.txt` yourself and do not scaffold them via terminal commands.
- Prefer the standard library; third-party packages go in `requirements.txt`,
  one pinned package per line — the runner installs them into the workspace
  `.venv`.
- Never overwrite an existing skill: if the name is taken, pick another one.
- Keep the task focused on one automation; one skill does one job.

## Example

User: "automate my weekly status report"

Tool call: `#createSkill` with `task: "generate a weekly status report from the data files"`

Reply: "Created the 'weekly-status-report' skill. Say the word and I'll run it."
