import * as vscode from 'vscode';
import { DEFAULT_IDENTITY_MD, IDENTITY_FILE_PATH } from './agentIdentity';
import { DEFAULT_SKILLS } from './defaultSkills';
import { MEMORY_FILE_NAME } from './sections';
import { SKILL_MD_NAME } from './skillCreate';
import {
  REQUIREMENTS_FILE_NAME,
  SKILL_SCRIPT_NAME,
  SKILLS_DIR_NAME
} from './skillRun';
import { PYTHON_NOT_FOUND_MESSAGE, ensureGitignoreEntry } from './pythonEnv';
import { ensureWorkspacePython } from './pythonEnvSetup';
import {
  DATA_DIR_NAME,
  GITIGNORE_FILE_NAME,
  MEMORY_SEED_CONTENT,
  SETUP_COMMAND_ID,
  SETUP_DISMISS_ACTION,
  SETUP_DISMISSED_KEY,
  SETUP_GITIGNORE_ENTRIES,
  SETUP_NO_WORKSPACE_MESSAGE,
  SETUP_PROMPT_ACTION,
  SETUP_PROMPT_MESSAGE,
  SETUP_PYTHON_MISSING_NOTE,
  SETUP_VENV_REUSED_NOTE,
  VSCODE_SETTINGS_PATH,
  buildSettingsContent,
  formatSetupSummary,
  shouldPromptProjectSetup
} from './projectSetup';

async function exists(uri: vscode.Uri): Promise<boolean> {
  try {
    await vscode.workspace.fs.stat(uri);
    return true;
  } catch {
    return false;
  }
}

/**
 * Scaffold a fresh Froggy Agent project in the open workspace: `data/`,
 * `memory.md`, the built-in skills, the editable agent identity
 * (`.github/froggy-identity.md`), `.vscode/settings.json`, `.gitignore`
 * entries and the workspace `.venv`. Only missing pieces are created:
 * existing files are never overwritten. Alerts when Python is missing
 * instead of creating the venv.
 */
export async function setupProject(refresh: () => void): Promise<void> {
  const root = vscode.workspace.workspaceFolders?.[0]?.uri;
  if (!root) {
    void vscode.window.showErrorMessage(SETUP_NO_WORKSPACE_MESSAGE);
    return;
  }
  const created: string[] = [];
  const encoder = new TextEncoder();

  const dataDir = vscode.Uri.joinPath(root, DATA_DIR_NAME);
  if (!(await exists(dataDir))) {
    await vscode.workspace.fs.createDirectory(dataDir);
    created.push(`${DATA_DIR_NAME}/`);
  }

  const memoryUri = vscode.Uri.joinPath(root, MEMORY_FILE_NAME);
  if (!(await exists(memoryUri))) {
    await vscode.workspace.fs.writeFile(memoryUri, encoder.encode(MEMORY_SEED_CONTENT));
    created.push(MEMORY_FILE_NAME);
  }

  let newSkills = 0;
  const skillsDir = vscode.Uri.joinPath(root, ...SKILLS_DIR_NAME.split('/'));
  for (const skill of DEFAULT_SKILLS) {
    const skillDir = vscode.Uri.joinPath(skillsDir, skill.name);
    if (await exists(skillDir)) {
      continue;
    }
    await vscode.workspace.fs.createDirectory(skillDir);
    await vscode.workspace.fs.writeFile(
      vscode.Uri.joinPath(skillDir, SKILL_MD_NAME),
      encoder.encode(skill.skillMd)
    );
    if (skill.runPy !== undefined) {
      await vscode.workspace.fs.writeFile(
        vscode.Uri.joinPath(skillDir, SKILL_SCRIPT_NAME),
        encoder.encode(skill.runPy)
      );
    }
    if (skill.requirements !== undefined) {
      await vscode.workspace.fs.writeFile(
        vscode.Uri.joinPath(skillDir, REQUIREMENTS_FILE_NAME),
        encoder.encode(skill.requirements)
      );
    }
    newSkills++;
  }
  if (newSkills > 0) {
    created.push(newSkills === 1 ? '1 built-in skill' : `${newSkills} built-in skills`);
  }

  const identityUri = vscode.Uri.joinPath(root, ...IDENTITY_FILE_PATH.split('/'));
  if (!(await exists(identityUri))) {
    await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(root, '.github'));
    await vscode.workspace.fs.writeFile(identityUri, encoder.encode(DEFAULT_IDENTITY_MD));
    created.push(IDENTITY_FILE_PATH);
  }

  const settingsUri = vscode.Uri.joinPath(root, ...VSCODE_SETTINGS_PATH.split('/'));
  if (!(await exists(settingsUri))) {
    await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(root, '.vscode'));
    await vscode.workspace.fs.writeFile(settingsUri, encoder.encode(buildSettingsContent()));
    created.push(VSCODE_SETTINGS_PATH);
  }

  let pythonNote = '';
  try {
    const { envNote } = await ensureWorkspacePython(root);
    pythonNote = envNote || SETUP_VENV_REUSED_NOTE;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === PYTHON_NOT_FOUND_MESSAGE) {
      pythonNote = SETUP_PYTHON_MISSING_NOTE;
    }
    void vscode.window.showErrorMessage(message);
  }

  if ((await ensureSetupGitignore(root)) === 'created') {
    created.push(GITIGNORE_FILE_NAME);
  }

  refresh();
  void vscode.window.showInformationMessage(formatSetupSummary(created, pythonNote));
}

/**
 * Ensure the setup `.gitignore` entries. Best-effort like the venv ignore:
 * a write failure only skips the report, it never fails the setup.
 */
async function ensureSetupGitignore(root: vscode.Uri): Promise<'created' | 'updated' | 'unchanged'> {
  const gitignore = vscode.Uri.joinPath(root, GITIGNORE_FILE_NAME);
  let current: string | undefined;
  try {
    current = new TextDecoder('utf-8').decode(await vscode.workspace.fs.readFile(gitignore));
  } catch {
    current = undefined;
  }
  const missing = current === undefined;
  let content = current;
  let changed = false;
  for (const entry of SETUP_GITIGNORE_ENTRIES) {
    const update = ensureGitignoreEntry(content, entry);
    content = update.content;
    changed = changed || update.changed;
  }
  if (!changed || content === undefined) {
    return 'unchanged';
  }
  try {
    await vscode.workspace.fs.writeFile(gitignore, new TextEncoder().encode(content));
  } catch {
    return 'unchanged';
  }
  return missing ? 'created' : 'updated';
}

/**
 * Offer project setup once when the extension activates on a virgin folder.
 * Dismissing (or saying "Not now") remembers the choice per workspace; the
 * command stays available for later.
 */
export async function maybePromptProjectSetup(
  workspaceState: vscode.Memento,
  refresh: () => void
): Promise<void> {
  const root = vscode.workspace.workspaceFolders?.[0]?.uri;
  if (!root || workspaceState.get<boolean>(SETUP_DISMISSED_KEY, false)) {
    return;
  }
  const [memory, data, skills] = await Promise.all([
    exists(vscode.Uri.joinPath(root, MEMORY_FILE_NAME)),
    exists(vscode.Uri.joinPath(root, DATA_DIR_NAME)),
    exists(vscode.Uri.joinPath(root, ...SKILLS_DIR_NAME.split('/')))
  ]);
  if (!shouldPromptProjectSetup({ memory, data, skills })) {
    return;
  }
  const choice = await vscode.window.showInformationMessage(
    SETUP_PROMPT_MESSAGE,
    SETUP_PROMPT_ACTION,
    SETUP_DISMISS_ACTION
  );
  if (choice === SETUP_PROMPT_ACTION) {
    await setupProject(refresh);
  } else {
    await workspaceState.update(SETUP_DISMISSED_KEY, true);
  }
}

export function registerProjectSetupCommands(refresh: () => void): vscode.Disposable[] {
  return [
    vscode.commands.registerCommand(SETUP_COMMAND_ID, async () => {
      await setupProject(refresh);
    })
  ];
}
