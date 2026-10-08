import * as os from 'os';
import * as vscode from 'vscode';
import { MODEL_SETTING_DEFAULT, MODEL_SETTING_KEY, pickChatModel } from './modelSelection';
import {
  CREATE_SKILL_TOOL_NAME,
  ensureSkillMdFrontmatter,
  formatCreatedSkillSummary,
  resolveNewSkillName,
  resolveTask,
  runSkillBuildLoop,
  SKILL_DRY_RUN_ARGS,
  SKILL_MD_NAME,
  skillDescriptionFromTask,
  suggestSkillName,
  type BuiltSkillFiles,
  type CreateSkillToolInput,
  type SkillDryRunResult
} from './skillCreate';
import {
  checkPythonSyntax,
  installSkillRequirements,
  isPythonNotFoundError,
  runPythonScript
} from './skillExec';
import { ensureWorkspacePython } from './pythonEnvSetup';
import { extractSkillDescription } from './skills';
import {
  RUN_SKILL_TOOL_NAME,
  SKILL_SCRIPT_NAME,
  SKILLS_DIR_NAME,
  REQUIREMENTS_FILE_NAME
} from './skillRun';

async function exists(uri: vscode.Uri): Promise<boolean> {
  try {
    await vscode.workspace.fs.stat(uri);
    return true;
  } catch {
    return false;
  }
}

/**
 * Skill factory: ensures the workspace Python (alerting when none exists,
 * creating `.venv` when absent), then runs a write→run→fix loop with a
 * dedicated Python-developer sub-agent (one model call per attempt, no
 * tools): each attempt is written to a staging folder in the OS temp dir,
 * syntax-checked and dry-run (`run.py --help` must exit 0), and on failure
 * the traceback goes back to the builder for a fix. Only a green attempt is
 * promoted to `.github/skills/<name>/`, and a summary goes back to the main
 * chat. Attempts stay invisible: only the executed commands and the final
 * outcome reach the action log.
 */
export class CreateSkillTool implements vscode.LanguageModelTool<CreateSkillToolInput> {
  private readonly _onDidCreateSkill?: () => void;

  public constructor(onDidCreateSkill?: () => void) {
    this._onDidCreateSkill = onDidCreateSkill;
  }

  public async prepareInvocation(
    options: vscode.LanguageModelToolInvocationPrepareOptions<CreateSkillToolInput>,
    _token: vscode.CancellationToken
  ): Promise<vscode.PreparedToolInvocation> {
    const skill = options.input.skill?.trim() || '(from task)';
    return { invocationMessage: `Creating skill "${skill}"` };
  }

  public async invoke(
    options: vscode.LanguageModelToolInvocationOptions<CreateSkillToolInput>,
    token: vscode.CancellationToken
  ): Promise<vscode.LanguageModelToolResult> {
    const root = vscode.workspace.workspaceFolders?.[0]?.uri;
    if (!root) {
      throw new Error('No workspace folder is open.');
    }
    const task = resolveTask(options.input);
    if (!task) {
      throw new Error('Describe the task the new skill should automate.');
    }
    const rawName = options.input.skill?.trim() ?? '';
    let skillName: string;
    if (rawName) {
      const resolved = resolveNewSkillName(rawName);
      if (!resolved) {
        throw new Error(
          `Invalid skill name "${rawName}". Use lowercase letters, digits and hyphens ` +
            `(e.g. "summarize-notes"), or omit it to derive one from the task.`
        );
      }
      skillName = resolved;
    } else {
      skillName = suggestSkillName(task);
    }
    const skillDir = vscode.Uri.joinPath(root, ...SKILLS_DIR_NAME.split('/'), skillName);
    if (await exists(skillDir)) {
      throw new Error(
        `Skill "${skillName}" already exists. Pick another name or delete .github/skills/${skillName} first.`
      );
    }
    const { python, envNote } = await ensureWorkspacePython(root);
    const model = await this._selectBuilderModel();
    const staging = await this._createStagingDir(skillName);
    try {
      const { files, attempts } = await runSkillBuildLoop(task, skillName, {
        build: (prompt) => this._runBuilder(model, prompt, token),
        dryRun: (built) => this._dryRun(root, staging, python, built),
        throwIfCancelled: () => {
          if (token.isCancellationRequested) {
            throw new vscode.CancellationError();
          }
        }
      });
      if (await exists(skillDir)) {
        throw new Error(
          `Skill "${skillName}" already exists. Pick another name or delete .github/skills/${skillName} first.`
        );
      }
      const description = skillDescriptionFromTask(task);
      const skillMd = ensureSkillMdFrontmatter(files.skillMd, skillName, description);
      await vscode.workspace.fs.createDirectory(skillDir);
      try {
        const encoder = new TextEncoder();
        await vscode.workspace.fs.writeFile(
          vscode.Uri.joinPath(skillDir, SKILL_MD_NAME),
          encoder.encode(skillMd)
        );
        await vscode.workspace.fs.writeFile(
          vscode.Uri.joinPath(skillDir, SKILL_SCRIPT_NAME),
          encoder.encode(files.script)
        );
        if (files.requirements !== undefined) {
          await vscode.workspace.fs.writeFile(
            vscode.Uri.joinPath(skillDir, REQUIREMENTS_FILE_NAME),
            encoder.encode(files.requirements)
          );
        }
      } catch (err) {
        // Leave no half-built skill behind: a retry starts from a clean folder.
        try {
          await vscode.workspace.fs.delete(skillDir, { recursive: true });
        } catch {
          // Keep the original error: the cleanup is best-effort.
        }
        throw err;
      }
      // The skill is on disk and checked: force the Skills view to refresh so
      // the new skill shows up without waiting for the file watcher.
      this._onDidCreateSkill?.();
      return new vscode.LanguageModelToolResult([
        new vscode.LanguageModelTextPart(
          formatCreatedSkillSummary(
            skillName,
            extractSkillDescription(skillMd, description),
            RUN_SKILL_TOOL_NAME,
            envNote,
            files.requirements !== undefined,
            attempts
          )
        )
      ]);
    } finally {
      try {
        await vscode.workspace.fs.delete(staging, { recursive: true });
      } catch {
        // Staging lives in the OS temp dir: leftovers age out on their own.
      }
    }
  }

  private async _selectBuilderModel(): Promise<vscode.LanguageModelChat> {
    const models = await vscode.lm.selectChatModels();
    const setting = vscode.workspace
      .getConfiguration('froggy-agent')
      .get<string>(MODEL_SETTING_KEY, MODEL_SETTING_DEFAULT);
    return pickChatModel(models, setting);
  }

  /**
   * Dedicated Python-dev sub-agent: one model call with the given prompt and
   * no tools, so file contents come back as plain text between markers. The
   * loop calls it once per attempt (initial prompt, then fix prompts).
   */
  private async _runBuilder(
    model: vscode.LanguageModelChat,
    prompt: string,
    token: vscode.CancellationToken
  ): Promise<string> {
    const response = await model.sendRequest(
      [vscode.LanguageModelChatMessage.User(prompt)],
      {},
      token
    );
    let text = '';
    for await (const part of response.stream) {
      if (token.isCancellationRequested) {
        break;
      }
      if (part instanceof vscode.LanguageModelTextPart) {
        text += part.value;
      }
    }
    if (token.isCancellationRequested) {
      throw new vscode.CancellationError();
    }
    if (!text.trim()) {
      throw new Error('The skill builder returned an empty answer. Try again.');
    }
    return text;
  }

  /**
   * Fresh staging folder in the OS temp dir: attempts are written and
   * dry-run here, promoted to `.github/skills/<name>/` only once green.
   * Outside the workspace so watchers and the skills view never see it.
   */
  private async _createStagingDir(skillName: string): Promise<vscode.Uri> {
    const staging = vscode.Uri.joinPath(
      vscode.Uri.file(os.tmpdir()),
      `froggy-skill-${skillName}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    );
    await vscode.workspace.fs.createDirectory(staging);
    return staging;
  }

  /**
   * One dry-run: stage the attempt (overwriting the previous one),
   * syntax-check it, install its requirements into the workspace `.venv`
   * when any, and run `run.py --help` with the runner sandboxing. Script
   * failures come back as `{ ok: false }` for the fix loop; only staging
   * writes throw, failing the build outright.
   */
  private async _dryRun(
    root: vscode.Uri,
    staging: vscode.Uri,
    python: string,
    files: BuiltSkillFiles
  ): Promise<SkillDryRunResult> {
    const encoder = new TextEncoder();
    const script = vscode.Uri.joinPath(staging, SKILL_SCRIPT_NAME);
    await vscode.workspace.fs.writeFile(script, encoder.encode(files.script));
    const requirements = vscode.Uri.joinPath(staging, REQUIREMENTS_FILE_NAME);
    if (files.requirements !== undefined) {
      await vscode.workspace.fs.writeFile(requirements, encoder.encode(files.requirements));
    } else {
      // A previous attempt may have left one behind in the shared staging dir.
      try {
        await vscode.workspace.fs.delete(requirements);
      } catch {
        // Missing already: nothing to clean.
      }
    }
    try {
      await checkPythonSyntax(python, script.fsPath, root.fsPath);
    } catch (err) {
      return this._dryRunFailure('syntax', err);
    }
    if (files.requirements !== undefined) {
      try {
        await installSkillRequirements(python, staging.fsPath);
      } catch (err) {
        return this._dryRunFailure('requirements', err);
      }
    }
    try {
      await runPythonScript(python, script.fsPath, [...SKILL_DRY_RUN_ARGS], root.fsPath);
      return { ok: true };
    } catch (err) {
      return this._dryRunFailure('dry-run', err);
    }
  }

  private _dryRunFailure(
    stage: 'syntax' | 'requirements' | 'dry-run',
    err: unknown
  ): SkillDryRunResult {
    const detail = err instanceof Error ? err.message : String(err);
    if (isPythonNotFoundError(err)) {
      return { ok: false, stage, detail, retryable: false };
    }
    return { ok: false, stage, detail, retryable: true };
  }
}

/**
 * Register the skill factory. `onDidCreateSkill` fires after a skill is
 * created so the host can refresh the Skills view immediately.
 */
export function registerCreateSkillTool(
  onDidCreateSkill?: () => void
): vscode.Disposable | undefined {
  if (!vscode.lm?.registerTool) {
    return undefined;
  }
  return vscode.lm.registerTool(CREATE_SKILL_TOOL_NAME, new CreateSkillTool(onDidCreateSkill));
}
