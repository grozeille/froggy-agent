import { execFile } from 'child_process';
import { promisify } from 'util';
import { PIP_INSTALL_TIMEOUT_MS } from './pythonEnv';
import {
  formatCommandLine,
  MAX_SKILL_OUTPUT_CHARS,
  REQUIREMENTS_FILE_NAME,
  recordRunCommand,
  SKILL_TIMEOUT_MS,
  truncateOutput
} from './skillRun';

const execFileAsync = promisify(execFile);

/** Marker for failures where the Python interpreter itself is missing. */
export const PYTHON_NOT_FOUND_CODE = 'ENOENT';

/** Collect stdout+stderr from an execFile failure into one detail string. */
export function execFailureDetail(err: unknown): string {
  return [(err as { stdout?: unknown }).stdout, (err as { stderr?: unknown }).stderr]
    .filter((text): text is string => typeof text === 'string' && text.trim().length > 0)
    .join('\n');
}

function pythonNotFoundError(): Error {
  const err = new Error(
    'Python was not found. Install Python 3 on PATH or add a .venv to the workspace.'
  ) as Error & { code: string };
  err.code = PYTHON_NOT_FOUND_CODE;
  return err;
}

/** True when the interpreter went missing: no rebuild can fix the run. */
export function isPythonNotFoundError(err: unknown): boolean {
  return (
    (err instanceof Error && (err as { code?: unknown }).code === PYTHON_NOT_FOUND_CODE) ||
    (err instanceof Error && err.message.startsWith('Python was not found'))
  );
}

export interface RunPythonOptions {
  timeoutMs?: number;
  maxOutputChars?: number;
}

/**
 * Run a skill script with the runner sandboxing (workspace-root cwd, timeout,
 * truncated output). Records the command for the action log. Shared by the
 * skill runner and the factory dry-run so both enforce the same limits.
 */
export async function runPythonScript(
  interpreter: string,
  scriptPath: string,
  args: readonly string[],
  cwd: string,
  options: RunPythonOptions = {}
): Promise<string> {
  const timeoutMs = options.timeoutMs ?? SKILL_TIMEOUT_MS;
  const maxOutputChars = options.maxOutputChars ?? MAX_SKILL_OUTPUT_CHARS;
  recordRunCommand(formatCommandLine(interpreter, [scriptPath, ...args]));
  let stdout: string;
  let stderr: string;
  try {
    ({ stdout, stderr } = await execFileAsync(interpreter, [scriptPath, ...args], {
      cwd,
      timeout: timeoutMs,
      maxBuffer: 1024 * 1024,
      windowsHide: true
    }));
  } catch (err) {
    const code = (err as { code?: unknown }).code;
    if (code === PYTHON_NOT_FOUND_CODE) {
      throw pythonNotFoundError();
    }
    if (code === 'ETIMEDOUT') {
      throw new Error(`Skill timed out after ${timeoutMs / 1000}s.`);
    }
    const detail = execFailureDetail(err);
    throw new Error(
      `Skill failed (exit ${String(code)}).${detail ? `\n${truncateOutput(detail, 2000)}` : ''}`
    );
  }
  const output = stdout.trim() ? stdout : '(no output)';
  const warnings = stderr.trim() ? `\n[stderr]\n${stderr.trim()}` : '';
  return truncateOutput(`${output.trim()}${warnings}`, maxOutputChars);
}

/**
 * Install a skill's requirements.txt into the workspace interpreter.
 * Records the pip command for the action log.
 */
export async function installSkillRequirements(
  python: string,
  skillDirPath: string,
  timeoutMs: number = PIP_INSTALL_TIMEOUT_MS
): Promise<void> {
  recordRunCommand(
    formatCommandLine(python, ['-m', 'pip', 'install', '-r', REQUIREMENTS_FILE_NAME])
  );
  try {
    await execFileAsync(python, ['-m', 'pip', 'install', '-r', REQUIREMENTS_FILE_NAME], {
      cwd: skillDirPath,
      timeout: timeoutMs,
      windowsHide: true
    });
  } catch (err) {
    const code = (err as { code?: unknown }).code;
    if (code === PYTHON_NOT_FOUND_CODE) {
      throw pythonNotFoundError();
    }
    if (code === 'ETIMEDOUT') {
      throw new Error(
        `Installing the skill requirements timed out after ${timeoutMs / 1000}s.`
      );
    }
    const detail = execFailureDetail(err);
    throw new Error(
      `Failed to install the skill requirements.${detail ? `\n${truncateOutput(detail, 2000)}` : ''}`
    );
  }
}

/**
 * Compile-check a script: fast pre-filter before the dry-run. The message is
 * fix-prompt friendly (the loop adds the attempts context on exhaustion).
 */
export async function checkPythonSyntax(
  python: string,
  scriptPath: string,
  cwd: string,
  timeoutMs: number = SKILL_TIMEOUT_MS
): Promise<void> {
  try {
    await execFileAsync(python, ['-m', 'py_compile', scriptPath], {
      cwd,
      timeout: timeoutMs,
      windowsHide: true
    });
  } catch (err) {
    const code = (err as { code?: unknown }).code;
    if (code === PYTHON_NOT_FOUND_CODE) {
      throw pythonNotFoundError();
    }
    if (code === 'ETIMEDOUT') {
      throw new Error(`Skill check timed out after ${timeoutMs / 1000}s.`);
    }
    const detail = execFailureDetail(err);
    throw new Error(
      `Syntax check failed (py_compile).${detail ? `\n${truncateOutput(detail, 2000)}` : ''}`
    );
  }
}
