import * as vscode from 'vscode';
import { MEMORY_FILE_NAME, NEW_DISCUSSION_LABEL } from './sections';
import { infoTreeItem } from './treeItems';

export class AskAiActionsProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
  public static readonly viewId = 'pocAskAiView';

  public getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  public getChildren(): vscode.TreeItem[] {
    const fresh = new vscode.TreeItem(NEW_DISCUSSION_LABEL, vscode.TreeItemCollapsibleState.None);
    fresh.iconPath = new vscode.ThemeIcon('plus');
    fresh.command = { command: 'poc-vscode-addin.newSession', title: 'New Discussion' };
    fresh.tooltip = 'Start a new discussion';
    fresh.contextValue = 'newSession';

    const items: vscode.TreeItem[] = [fresh];
    const root = vscode.workspace.workspaceFolders?.[0]?.uri;
    if (!root) {
      items.push(infoTreeItem('Open a workspace folder to see Memory.'));
      return items;
    }
    const memoryUri = vscode.Uri.joinPath(root, MEMORY_FILE_NAME);
    const memory = new vscode.TreeItem('Memory', vscode.TreeItemCollapsibleState.None);
    memory.resourceUri = memoryUri;
    memory.iconPath = new vscode.ThemeIcon('note');
    memory.command = {
      command: 'poc-vscode-addin.openPreview',
      title: 'Open Memory',
      arguments: [memoryUri]
    };
    memory.tooltip = memoryUri.fsPath;
    memory.contextValue = 'memory';
    items.push(memory);
    return items;
  }
}
