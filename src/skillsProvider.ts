import * as vscode from 'vscode';
import { extractSkillTitle } from './skills';
import { infoTreeItem } from './treeItems';

export class SkillsProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
  public static readonly viewId = 'pocSkillsView';

  private readonly _onDidChangeTreeData = new vscode.EventEmitter<vscode.TreeItem | undefined>();
  public readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  public refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  public getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  public async getChildren(): Promise<vscode.TreeItem[]> {
    const root = vscode.workspace.workspaceFolders?.[0]?.uri;
    if (!root) {
      return [infoTreeItem('Open a workspace folder to see skills.')];
    }
    const skillsDir = vscode.Uri.joinPath(root, '.github', 'skills');
    let entries: [string, vscode.FileType][];
    try {
      entries = await vscode.workspace.fs.readDirectory(skillsDir);
    } catch {
      return [infoTreeItem('No .github/skills folder found.')];
    }
    const folders = entries
      .filter(([, type]) => type === vscode.FileType.Directory)
      .map(([name]) => name)
      .sort((a, b) => a.localeCompare(b));
    if (folders.length === 0) {
      return [infoTreeItem('No skills found.')];
    }
    const items: vscode.TreeItem[] = [];
    for (const folder of folders) {
      const skillMd = vscode.Uri.joinPath(skillsDir, folder, 'SKILL.md');
      let title = folder;
      let exists = true;
      try {
        const bytes = await vscode.workspace.fs.readFile(skillMd);
        title = extractSkillTitle(Buffer.from(bytes).toString('utf8'), folder);
      } catch {
        exists = false;
      }
      const item = new vscode.TreeItem(title, vscode.TreeItemCollapsibleState.None);
      item.resourceUri = skillMd;
      item.iconPath = new vscode.ThemeIcon('book');
      item.contextValue = 'skill';
      if (title !== folder) {
        item.description = folder;
      }
      if (exists) {
        item.command = {
          command: 'poc-vscode-addin.openPreview',
          title: 'Open Skill Preview',
          arguments: [skillMd]
        };
        item.tooltip = skillMd.fsPath;
      } else {
        item.description = 'missing SKILL.md';
        item.tooltip = `No SKILL.md in ${folder}`;
      }
      items.push(item);
    }
    return items;
  }
}
