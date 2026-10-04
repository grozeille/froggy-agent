import { execFile } from 'child_process';
import { promisify } from 'util';
import * as vscode from 'vscode';
import { DEPS_MARKER_NAME, PIP_INSTALL_TIMEOUT_MS, hashRequirements } from './pythonEnv';
import { ensureWorkspacePython } from './pythonEnvSetup';
import { extractSkillDescription, extractSkillTitle } from './skills';
import {
  formatCommandLine,
  formatSkillList,
  MAX_SKILL_OUTPUT_CHARS,
  REQUIREMENTS_FILE_NAME,
  recordRunCommand,
  resolveSkillName,
  RUN_SKILL_TOOL_NAME,
  SKILL_SCRIPT_NAME,
  SKILL_TIMEOUT_MS,
  SKILLS_DIR_NAME,
  truncateOutput,
  venvPythonPath,
  type RunnableSkill,
  type RunSkillToolInput
} from './skillRun';

const execFileAsync = promisify(execFile);

async function exists(uri: vscode.Uri): Promise<boolean> {
  try {
    await vscode.workspace.fs.stat(uri);
    return true;
  } catch {
    return false;
  }
}

async function readSkillMeta(
  skillDir: vscode.Uri,
  fallback: string
): Promise<{ title: string; description: string }> {
  try {
    const raw = new TextDecoder('utf-8').decode(
      await vscode.workspace.fs.readFile(vscode.Uri.joinPath(skillDir, 'SKILL.md'))
    );
    return {
      title: extractSkillTitle(raw, fallback),
      description: extractSkillDescription(raw, '')
    };
  } catch {
    return { title: fallback, description: '' };
  }
}

/**
 * Runnable skills (folders with run.py) with their titles and descriptions,
 * for the per-request model catalog. Empty without an open workspace.
 */
export async function listRunnableSkills(): Promise<RunnableSkill[]> {
  const root = vscode.workspace.workspaceFolders?.[0]?.uri;
  if (!root) {
    return [];
  }
  const base = vscode.Uri.joinPath(root, ...SKILLS_DIR_NAME.split('/'));
  let entries: [string, vscode.FileType][];
  try {
    entries = await vscode.workspace.fs.readDirectory(base);
  } catch {
    return [];
  }
  const runnable: RunnableSkill[] = [];
  for (const [name, type] of entries) {
    if (type !== vscode.FileType.Directory || !resolveSkillName(name)) {
      continue;
    }
    const skillDir = vscode.Uri.joinPath(base, name);
    if (!(await exists(vscode.Uri.joinPath(skillDir, SKILL_SCRIPT_NAME)))) {
      continue;
    }
    const meta = await readSkillMeta(skillDir, '');
    runnable.push({ name, title: meta.title, description: meta.description });
  }
  return runnable;
}

/** Runs a skill's pre-designed Python script (`run.py`) from `.github/skills`. */
export class RunSkillTool implements vscode.LanguageModelTool<RunSkillToolInput> {
  public async prepareInvocation(
    options: vscode.LanguageModelToolInvocationPrepareOptions<RunSkillToolInput>,
    _token: vscode.CancellationToken
  ): Promise<vscode.PreparedToolInvocation> {
    const skill = options.input.skill?.trim() || '(list)';
    return { invocationMessage: `Running skill "${skill}"` };
  }

  public async invoke(
    options: vscode.LanguageModelToolInvocationOptions<RunSkillToolInput>,
    _token: vscode.CancellationToken
  ): Promise<vscode.LanguageModelToolResult> {
    const root = vscode.workspace.workspaceFolders?.[0]?.uri;
    if (!root) {
      throw new Error('No workspace folder is open.');
    }
    const raw = options.input.skill?.trim() ?? '';
    if (!raw) {
      return new vscode.LanguageModelToolResult([
        new vscode.LanguageModelTextPart(`Runnable skills:\n${formatSkillList(await listRunnableSkills())}`)
      ]);
    }
    const name = resolveSkillName(raw);
    if (!name) {
      throw new Error(
        `Invalid skill "${raw}". Use a skill folder name from .github/skills, or empty to list them.`
      );
    }
    const skillDir = vscode.Uri.joinPath(root, ...SKILLS_DIR_NAME.split('/'), name);
    if (!(await exists(skillDir))) {
      throw new Error(`Skill "${name}" was not found. Use an empty skill name to list them.`);
    }
    const script = vscode.Uri.joinPath(skillDir, SKILL_SCRIPT_NAME);
    if (!(await exists(script))) {
      throw new Error(
        `Skill "${name}" has no runnable script (expected ${SKILL_SCRIPT_NAME}).`
      );
    }
    let python: string | undefined;
    if (await exists(vscode.Uri.joinPath(skillDir, REQUIREMENTS_FILE_NAME))) {
      python = await this._ensureRequirements(root, skillDir);
    }
    const args = Array.isArray(options.input.args)
      ? options.input.args.filter((arg): arg is string => typeof arg === 'string')
      : [];
    return new vscode.LanguageModelToolResult([
      new vscode.LanguageModelTextPart(await this._run(root, script, args, python))
    ]);
  }

  /** Project interpreter: the workspace `.venv` when present, else PATH `python`. */
  private async _defaultPython(root: vscode.Uri): Promise<string> {
    const venvPython = venvPythonPath(root.fsPath);
    return (await exists(vscode.Uri.file(venvPython))) ? venvPython : 'python';
  }

  /**
   * Install the skill requirements.txt into the workspace `.venv`
   * (created when missing) and return its interpreter. Skips reinstalls
   * while the requirements and the interpreter are unchanged.
   */
  private async _ensureRequirements(root: vscode.Uri, skillDir: vscode.Uri): Promise<string> {
    const { python } = await ensureWorkspacePython(root);
    const requirements = vscode.Uri.joinPath(skillDir, REQUIREMENTS_FILE_NAME);
    const reqText = new TextDecoder('utf-8').decode(
      await vscode.workspace.fs.readFile(requirements)
    );
    const expected = `${hashRequirements(reqText)}:${(await vscode.workspace.fs.stat(vscode.Uri.file(python))).mtime}`;
    const marker = vscode.Uri.joinPath(skillDir, DEPS_MARKER_NAME);
    try {
      const current = new TextDecoder('utf-8').decode(await vscode.workspace.fs.readFile(marker));
      if (current.trim() === expected) {
        return python;
      }
    } catch {
      // Missing or unreadable marker: install below.
    }
    recordRunCommand(formatCommandLine(python, ['-m', 'pip', 'install', '-r', REQUIREMENTS_FILE_NAME]));
    try {
      await execFileAsync(python, ['-m', 'pip', 'install', '-r', REQUIREMENTS_FILE_NAME], {
        cwd: skillDir.fsPath,
        timeout: PIP_INSTALL_TIMEOUT_MS,
        windowsHide: true
      });
    } catch (err) {
      const code = (err as { code?: unknown }).code;
      if (code === 'ETIMEDOUT') {
        throw new Error(
          `Installing the skill requirements timed out after ${PIP_INSTALL_TIMEOUT_MS / 1000}s.`
        );
      }
      const detail = [(err as { stdout?: unknown }).stdout, (err as { stderr?: unknown }).stderr]
        .filter((text): text is string => typeof text === 'string' && text.trim().length > 0)
        .join('\n');
      throw new Error(
        `Failed to install the skill requirements.${detail ? `\n${truncateOutput(detail, 2000)}` : ''}`
      );
    }
    try {
      await vscode.workspace.fs.writeFile(marker, new TextEncoder().encode(expected));
    } catch {
      // Marker is best-effort: worst case the next run reinstalls.
    }
    return python;
  }

  private async _run(
    root: vscode.Uri,
    script: vscode.Uri,
    args: string[],
    python?: string
  ): Promise<string> {
    // Prefer the caller's interpreter, else the project's own environment,
    // else PATH.
    const interpreter = python ?? (await this._defaultPython(root));
    recordRunCommand(formatCommandLine(interpreter, [script.fsPath, ...args]));
    let stdout: string;
    let stderr: string;
    try {
      ({ stdout, stderr } = await execFileAsync(interpreter, [script.fsPath, ...args], {
        cwd: root.fsPath,
        timeout: SKILL_TIMEOUT_MS,
        maxBuffer: 1024 * 1024,
        windowsHide: true
      }));
    } catch (err) {
      const code = (err as { code?: unknown }).code;
      const out = (err as { stdout?: unknown; stderr?: unknown }).stdout;
      const errText = (err as { stderr?: unknown }).stderr;
      if (code === 'ENOENT') {
        throw new Error(
          'Python was not found. Install Python 3 on PATH or add a .venv to the workspace.'
        );
      }
      if (code === 'ETIMEDOUT') {
        throw new Error(`Skill timed out after ${SKILL_TIMEOUT_MS / 1000}s.`);
      }
      const detail = [out, errText]
        .filter((text): text is string => typeof text === 'string' && text.trim().length > 0)
        .join('\n');
      throw new Error(
        `Skill failed (exit ${String(code)}).${detail ? `\n${truncateOutput(detail, 2000)}` : ''}`
      );
    }
    const output = stdout.trim() ? stdout : '(no output)';
    const warnings = stderr.trim() ? `\n[stderr]\n${stderr.trim()}` : '';
    return truncateOutput(`${output.trim()}${warnings}`, MAX_SKILL_OUTPUT_CHARS);
  }
}

export function registerRunSkillTool(): vscode.Disposable | undefined {
  if (!vscode.lm?.registerTool) {
    return undefined;
  }
  return vscode.lm.registerTool(RUN_SKILL_TOOL_NAME, new RunSkillTool());
}
