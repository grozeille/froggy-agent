import * as vscode from 'vscode';
import { DEPS_MARKER_NAME, hashRequirements } from './pythonEnv';
import { ensureWorkspacePython } from './pythonEnvSetup';
import { installSkillRequirements, runPythonScript } from './skillExec';
import { extractSkillDescription, extractSkillTitle } from './skills';
import {
  formatSkillList,
  REQUIREMENTS_FILE_NAME,
  resolveSkillName,
  RUN_SKILL_TOOL_NAME,
  SKILL_SCRIPT_NAME,
  SKILLS_DIR_NAME,
  venvPythonPath,
  type RunnableSkill,
  type RunSkillToolInput
} from './skillRun';

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
    await installSkillRequirements(python, skillDir.fsPath);
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
    return runPythonScript(interpreter, script.fsPath, args, root.fsPath);
  }
}

export function registerRunSkillTool(): vscode.Disposable | undefined {
  if (!vscode.lm?.registerTool) {
    return undefined;
  }
  return vscode.lm.registerTool(RUN_SKILL_TOOL_NAME, new RunSkillTool());
}
