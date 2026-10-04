import { execFile } from 'child_process';
import { promisify } from 'util';
import * as vscode from 'vscode';
import {
  PYTHON_NOT_FOUND_MESSAGE,
  PYTHON_PROBE_TIMEOUT_MS,
  VENV_DIR_NAME,
  VENV_TIMEOUT_MS,
  ensureGitignoreEntry
} from './pythonEnv';
import { truncateOutput, venvPythonPath } from './skillRun';

const execFileAsync = promisify(execFile);

async function exists(uri: vscode.Uri): Promise<boolean> {
  try {
    await vscode.workspace.fs.stat(uri);
    return true;
  } catch {
    return false;
  }
}

export interface WorkspacePython {
  python: string;
  envNote: string;
}

/**
 * Ensure the workspace can run Python: the existing `.venv` wins, otherwise
 * PATH `python` seeds a new `.venv` (ignored via `.gitignore`). Alerts when
 * no interpreter exists at all. Returns the interpreter plus the summary
 * note (empty when the environment was already in place). Shared by the
 * skill factory and the skill runner.
 */
export async function ensureWorkspacePython(root: vscode.Uri): Promise<WorkspacePython> {
  const venvPython = venvPythonPath(root.fsPath);
  if (await exists(vscode.Uri.file(venvPython))) {
    return { python: venvPython, envNote: '' };
  }
  try {
    await execFileAsync('python', ['--version'], {
      timeout: PYTHON_PROBE_TIMEOUT_MS,
      windowsHide: true
    });
  } catch (err) {
    if ((err as { code?: unknown }).code === 'ENOENT') {
      throw new Error(PYTHON_NOT_FOUND_MESSAGE);
    }
    // Any other probe failure surfaces below, with the venv output attached.
  }
  try {
    await execFileAsync('python', ['-m', 'venv', VENV_DIR_NAME], {
      cwd: root.fsPath,
      timeout: VENV_TIMEOUT_MS,
      windowsHide: true
    });
  } catch (err) {
    const code = (err as { code?: unknown }).code;
    if (code === 'ETIMEDOUT') {
      throw new Error(`Creating the workspace .venv timed out after ${VENV_TIMEOUT_MS / 1000}s.`);
    }
    const detail = [(err as { stdout?: unknown }).stdout, (err as { stderr?: unknown }).stderr]
      .filter((text): text is string => typeof text === 'string' && text.trim().length > 0)
      .join('\n');
    throw new Error(
      `Failed to create the workspace .venv.${detail ? `\n${truncateOutput(detail, 2000)}` : ''}`
    );
  }
  return { python: venvPython, envNote: await ignoreVenv(root) };
}

/**
 * Best-effort `.gitignore` update for the new venv; returns the summary
 * sentence. A failure here must not fail the caller, so it degrades to a
 * warning instead.
 */
async function ignoreVenv(root: vscode.Uri): Promise<string> {
  const gitignore = vscode.Uri.joinPath(root, '.gitignore');
  let current: string | undefined;
  try {
    current = new TextDecoder('utf-8').decode(await vscode.workspace.fs.readFile(gitignore));
  } catch {
    current = undefined;
  }
  const update = ensureGitignoreEntry(current);
  if (!update.changed) {
    return ' Created the workspace .venv (already ignored via .gitignore).';
  }
  try {
    await vscode.workspace.fs.writeFile(gitignore, new TextEncoder().encode(update.content));
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return ` Created the workspace .venv but could not update .gitignore (${reason}).`;
  }
  return ' Created the workspace .venv and ignored it via .gitignore.';
}
