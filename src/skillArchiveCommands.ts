import * as vscode from 'vscode';
import { SKILLS_DIR_NAME } from './skillRun';
import { ARCHIVE_DIR_NAME, archiveCopyNameFor } from './skillArchive';
import type { SkillTreeItem } from './skillsProvider';

function toSkillRef(item: unknown): { name: string; archived: boolean } | undefined {
  const candidate = item as SkillTreeItem | undefined;
  const name = candidate?.skillName;
  const archived = candidate?.archived;
  if (typeof name !== 'string' || !name || typeof archived !== 'boolean') {
    return undefined;
  }
  return { name, archived };
}

async function exists(uri: vscode.Uri): Promise<boolean> {
  try {
    await vscode.workspace.fs.stat(uri);
    return true;
  } catch {
    return false;
  }
}

async function uniqueArchiveDest(dir: vscode.Uri, skillName: string): Promise<vscode.Uri> {
  for (let attempt = 0; attempt < 100; attempt++) {
    const candidate = vscode.Uri.joinPath(dir, archiveCopyNameFor(skillName, attempt));
    if (!(await exists(candidate))) {
      return candidate;
    }
  }
  return vscode.Uri.joinPath(dir, archiveCopyNameFor(skillName, Date.now()));
}

/**
 * Skills view archive commands: Archive moves a skill to the archive
 * (reversible, no confirmation), Restore moves it back, Delete
 * removes an archived skill for good (modal confirmation).
 */
export function registerSkillArchiveCommands(refresh: () => void): vscode.Disposable[] {
  const del = vscode.commands.registerCommand(
    'froggy-agent.deleteSkill',
    async (item?: unknown) => {
      const ref = toSkillRef(item);
      if (!ref || ref.archived) {
        return;
      }
      const root = vscode.workspace.workspaceFolders?.[0]?.uri;
      if (!root) {
        return;
      }
      const source = vscode.Uri.joinPath(root, ...SKILLS_DIR_NAME.split('/'), ref.name);
      if (!(await exists(source))) {
        void vscode.window.showErrorMessage(`Skill "${ref.name}" was not found.`);
        refresh();
        return;
      }
      try {
        const archiveDir = vscode.Uri.joinPath(root, ...ARCHIVE_DIR_NAME.split('/'));
        await vscode.workspace.fs.createDirectory(archiveDir);
        await vscode.workspace.fs.rename(source, await uniqueArchiveDest(archiveDir, ref.name));
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        void vscode.window.showErrorMessage(`Archive failed: ${message}`);
        return;
      }
      refresh();
      void vscode.window.showInformationMessage(`Skill "${ref.name}" moved to the Archive.`);
    }
  );

  const restore = vscode.commands.registerCommand(
    'froggy-agent.restoreSkill',
    async (item?: unknown) => {
      const ref = toSkillRef(item);
      if (!ref || !ref.archived) {
        return;
      }
      const root = vscode.workspace.workspaceFolders?.[0]?.uri;
      if (!root) {
        return;
      }
      const source = vscode.Uri.joinPath(root, ...ARCHIVE_DIR_NAME.split('/'), ref.name);
      const skillsDir = vscode.Uri.joinPath(root, ...SKILLS_DIR_NAME.split('/'));
      if (!(await exists(source))) {
        void vscode.window.showErrorMessage(`Skill "${ref.name}" was not found in the Archive.`);
        refresh();
        return;
      }
      if (await exists(vscode.Uri.joinPath(skillsDir, ref.name))) {
        void vscode.window.showErrorMessage(
          `A skill named "${ref.name}" already exists. Archive or rename it first.`
        );
        return;
      }
      try {
        await vscode.workspace.fs.createDirectory(skillsDir);
        await vscode.workspace.fs.rename(source, vscode.Uri.joinPath(skillsDir, ref.name));
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        void vscode.window.showErrorMessage(`Restore failed: ${message}`);
        return;
      }
      refresh();
      void vscode.window.showInformationMessage(`Skill "${ref.name}" restored.`);
    }
  );

  const delForever = vscode.commands.registerCommand(
    'froggy-agent.deleteSkillPermanently',
    async (item?: unknown) => {
      const ref = toSkillRef(item);
      if (!ref || !ref.archived) {
        return;
      }
      const root = vscode.workspace.workspaceFolders?.[0]?.uri;
      if (!root) {
        return;
      }
      const target = vscode.Uri.joinPath(root, ...ARCHIVE_DIR_NAME.split('/'), ref.name);
      if (!(await exists(target))) {
        void vscode.window.showErrorMessage(`Skill "${ref.name}" was not found in the Archive.`);
        refresh();
        return;
      }
      const confirm = await vscode.window.showWarningMessage(
        `Permanently delete skill "${ref.name}"? This cannot be undone.`,
        { modal: true },
        'Delete'
      );
      if (confirm !== 'Delete') {
        return;
      }
      try {
        await vscode.workspace.fs.delete(target, { recursive: true, useTrash: false });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        void vscode.window.showErrorMessage(`Delete failed: ${message}`);
        return;
      }
      refresh();
    }
  );

  return [del, restore, delForever];
}
