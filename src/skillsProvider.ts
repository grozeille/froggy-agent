import * as vscode from 'vscode';
import { extractSkillTitle } from './skills';
import { compareLiveSkillNames, isBuiltinSkill } from './defaultSkills';
import { SKILLS_DIR_NAME } from './skillRun';
import { ARCHIVE_CONTEXT_VALUE, ARCHIVE_LABEL, archiveSummary } from './archive';
import {
  ARCHIVE_DIR_NAME,
  ARCHIVED_SKILL_CONTEXT_VALUE,
  BUILTIN_SKILL_CONTEXT_VALUE,
  SKILL_CONTEXT_VALUE
} from './skillArchive';
import { infoTreeItem } from './treeItems';

/**
 * A skill node in the Skills view, live or archived. Archive commands read
 * `skillName`/`archived` to move the right folder. `builtin` marks the
 * shipped skills, which refuse to archive.
 */
export class SkillTreeItem extends vscode.TreeItem {
  public readonly skillName: string;
  public readonly archived: boolean;
  public readonly builtin: boolean;

  public constructor(label: string, skillName: string, archived: boolean, builtin = false) {
    super(label, vscode.TreeItemCollapsibleState.None);
    this.skillName = skillName;
    this.archived = archived;
    this.builtin = builtin;
  }
}

async function readFolderNames(dir: vscode.Uri): Promise<string[] | undefined> {
  try {
    const entries = await vscode.workspace.fs.readDirectory(dir);
    return entries
      .filter(([, type]) => type === vscode.FileType.Directory)
      .map(([name]) => name)
      .sort((a, b) => a.localeCompare(b));
  } catch {
    return undefined;
  }
}

export class SkillsProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
  public static readonly viewId = 'froggySkillsView';

  private readonly _onDidChangeTreeData = new vscode.EventEmitter<vscode.TreeItem | undefined>();
  public readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  public refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  public getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  public async getChildren(element?: vscode.TreeItem): Promise<vscode.TreeItem[]> {
    const root = vscode.workspace.workspaceFolders?.[0]?.uri;
    if (!root) {
      return element ? [] : [infoTreeItem('Open a workspace folder to see skills.')];
    }
    const skillsDir = vscode.Uri.joinPath(root, ...SKILLS_DIR_NAME.split('/'));
    const archiveDir = vscode.Uri.joinPath(root, ...ARCHIVE_DIR_NAME.split('/'));
    if (element) {
      if (element.contextValue !== ARCHIVE_CONTEXT_VALUE) {
        return [];
      }
      return this._skillItems(archiveDir, (await readFolderNames(archiveDir)) ?? [], true);
    }
    const folders = await readFolderNames(skillsDir);
    let items: vscode.TreeItem[];
    if (folders === undefined) {
      items = [infoTreeItem('No .github/skills folder found.')];
    } else if (folders.length === 0) {
      items = [infoTreeItem('No skills found.')];
    } else {
      items = await this._skillItems(skillsDir, [...folders].sort(compareLiveSkillNames), false);
    }
    items.push(this._archiveItem((await readFolderNames(archiveDir))?.length ?? 0));
    return items;
  }

  private _archiveItem(archivedCount: number): vscode.TreeItem {
    const item = new vscode.TreeItem(
      ARCHIVE_LABEL,
      archivedCount === 0
        ? vscode.TreeItemCollapsibleState.None
        : vscode.TreeItemCollapsibleState.Collapsed
    );
    item.contextValue = ARCHIVE_CONTEXT_VALUE;
    item.iconPath = new vscode.ThemeIcon('archive');
    item.description = archiveSummary(archivedCount, 'skill', 'skills');
    item.tooltip = 'Deleted skills. Restore them or delete them permanently.';
    return item;
  }

  private async _skillItems(
    base: vscode.Uri,
    folders: readonly string[],
    archived: boolean
  ): Promise<vscode.TreeItem[]> {
    const items: vscode.TreeItem[] = [];
    for (const folder of folders) {
      const skillMd = vscode.Uri.joinPath(base, folder, 'SKILL.md');
      let title = folder;
      let exists = true;
      try {
        const bytes = await vscode.workspace.fs.readFile(skillMd);
        title = extractSkillTitle(Buffer.from(bytes).toString('utf8'), folder);
      } catch {
        exists = false;
      }
      const builtin = !archived && isBuiltinSkill(folder);
      const item = new SkillTreeItem(title, folder, archived, builtin);
      item.resourceUri = skillMd;
      item.iconPath = new vscode.ThemeIcon(builtin ? 'package' : 'book');
      if (archived) {
        item.contextValue = ARCHIVED_SKILL_CONTEXT_VALUE;
      } else if (builtin) {
        item.contextValue = BUILTIN_SKILL_CONTEXT_VALUE;
      } else {
        item.contextValue = SKILL_CONTEXT_VALUE;
      }
      if (builtin) {
        item.description = title !== folder ? `${folder} • built-in` : 'built-in';
      } else if (title !== folder) {
        item.description = folder;
      }
      if (exists) {
        item.command = {
          command: 'froggy-agent.openPreview',
          title: 'Open Skill Preview',
          arguments: [skillMd]
        };
        item.tooltip = builtin ? `${skillMd.fsPath} (built-in)` : skillMd.fsPath;
      } else {
        item.description = 'missing SKILL.md';
        item.tooltip = `No SKILL.md in ${folder}`;
      }
      items.push(item);
    }
    return items;
  }
}
