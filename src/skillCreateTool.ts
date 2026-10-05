import { execFile } from 'child_process';
import { promisify } from 'util';
import * as vscode from 'vscode';
import { MODEL_SETTING_DEFAULT, MODEL_SETTING_KEY, pickChatModel } from './modelSelection';
import {
  buildSkillBuilderPrompt,
  CREATE_SKILL_TOOL_NAME,
  ensureSkillMdFrontmatter,
  formatCreatedSkillSummary,
  parseBuilderOutput,
  resolveNewSkillName,
  resolveTask,
  SKILL_MD_NAME,
  skillDescriptionFromTask,
  suggestSkillName,
  validateBuiltSkillFiles,
  type CreateSkillToolInput
} from './skillCreate';
import { ensureWorkspacePython } from './pythonEnvSetup';
import { extractSkillDescription } from './skills';
import {
  RUN_SKILL_TOOL_NAME,
  SKILL_SCRIPT_NAME,
  SKILL_TIMEOUT_MS,
  SKILLS_DIR_NAME,
  truncateOutput,
  REQUIREMENTS_FILE_NAME
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

/**
 * Skill factory: ensures the workspace Python (alerting when none exists,
 * creating `.venv` when absent), delegates the build to a dedicated
 * Python-developer sub-agent (a separate model call with a builder-only
 * prompt, no tools), writes its SKILL.md + run.py to
 * `.github/skills/<name>/`, syntax-checks the script, and hands a summary
 * back to the main chat.
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
    const files = parseBuilderOutput(await this._runBuilder(task, skillName, token));
    if (!files) {
      throw new Error(
        'The skill builder did not return usable files. Rephrase the task and try again.'
      );
    }
    const fileError = validateBuiltSkillFiles(files);
    if (fileError) {
      throw new Error(fileError);
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
      await this._checkSyntax(root, skillDir, python);
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
          files.requirements !== undefined
        )
      )
    ]);
  }

  /**
   * Dedicated Python-dev sub-agent: one model call with the builder prompt and
   * no tools, so file contents come back as plain text between markers.
   */
  private async _runBuilder(
    task: string,
    skillName: string,
    token: vscode.CancellationToken
  ): Promise<string> {
    const models = await vscode.lm.selectChatModels();
    const setting = vscode.workspace
      .getConfiguration('froggy-agent')
      .get<string>(MODEL_SETTING_KEY, MODEL_SETTING_DEFAULT);
    const model = pickChatModel(models, setting);
    const response = await model.sendRequest(
      [vscode.LanguageModelChatMessage.User(buildSkillBuilderPrompt(task, skillName))],
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
    if (!text.trim()) {
      throw new Error('The skill builder returned an empty answer. Try again.');
    }
    return text;
  }

  /** Compile-check the generated script with the ensured interpreter. */
  private async _checkSyntax(
    root: vscode.Uri,
    skillDir: vscode.Uri,
    python: string
  ): Promise<void> {
    const script = vscode.Uri.joinPath(skillDir, SKILL_SCRIPT_NAME);
    try {
      await execFileAsync(python, ['-m', 'py_compile', script.fsPath], {
        cwd: root.fsPath,
        timeout: SKILL_TIMEOUT_MS,
        windowsHide: true
      });
    } catch (err) {
      const code = (err as { code?: unknown }).code;
      if (code === 'ENOENT') {
        throw new Error(
          'Python was not found. Install Python 3 on PATH or add a .venv to the workspace.'
        );
      }
      if (code === 'ETIMEDOUT') {
        throw new Error(`Skill check timed out after ${SKILL_TIMEOUT_MS / 1000}s.`);
      }
      const detail = [(err as { stdout?: unknown }).stdout, (err as { stderr?: unknown }).stderr]
        .filter((text): text is string => typeof text === 'string' && text.trim().length > 0)
        .join('\n');
      throw new Error(
        `The generated script has a syntax error.` +
          `${detail ? `\n${truncateOutput(detail, 2000)}` : ''} Rephrase the task and try again.`
      );
    }
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
