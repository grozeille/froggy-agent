import { createHash } from 'crypto';

/** Project Python environment helpers for the skill factory and runner (pure parts). */

/** Workspace virtual environment folder name. */
export const VENV_DIR_NAME = '.venv';

/** Entry appended to `.gitignore` so the created venv stays untracked. */
export const VENV_GITIGNORE_ENTRY = '.venv/';

/** Probing PATH python must answer instantly; anything slower is broken. */
export const PYTHON_PROBE_TIMEOUT_MS = 15_000;

/** Creating the venv may install pip: allow longer than a script run. */
export const VENV_TIMEOUT_MS = 120_000;

/** Skill dependency marker: requirements hash + interpreter fingerprint. */
export const DEPS_MARKER_NAME = '.deps-installed';

/** Installing skill requirements may download wheels: allow longer. */
export const PIP_INSTALL_TIMEOUT_MS = 180_000;

/** Alert text when neither a workspace `.venv` nor PATH python exists. */
export const PYTHON_NOT_FOUND_MESSAGE =
  'Python 3 was not found: no workspace .venv and no python on PATH. ' +
  'Install Python 3 and try again.';

export interface GitignoreUpdate {
  content: string;
  changed: boolean;
}

/**
 * Ensure the venv entry is present in a `.gitignore`. `current` is undefined
 * when the workspace has no `.gitignore` yet. Matches both `.venv` and
 * `.venv/` lines (whitespace-tolerant); otherwise appends the entry,
 * preserving existing content, comments, blank lines and line endings.
 */
export function ensureGitignoreEntry(
  current: string | undefined,
  entry: string = VENV_GITIGNORE_ENTRY
): GitignoreUpdate {
  if (current === undefined) {
    return { content: `${entry}\n`, changed: true };
  }
  const wanted = entry.replace(/\/+$/, '');
  for (const line of current.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed === entry || trimmed === wanted) {
      return { content: current, changed: false };
    }
  }
  const eol = current.includes('\r\n') ? '\r\n' : '\n';
  const prefix = current === '' || current.endsWith('\n') ? current : current + eol;
  return { content: `${prefix}${entry}${eol}`, changed: true };
}

/** Stable fingerprint of a requirements.txt, for the reinstall marker. */
export function hashRequirements(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}
