import * as vscode from 'vscode';
import { MAIN_CHAT_LABEL, MEMORY_FILE_NAME } from './sections';
import { infoTreeItem } from './treeItems';

export class AskAiActionsProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
  public static readonly viewId = 'pocAskAiView';

  public getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  public getChildren(): vscode.TreeItem[] {
    const main = new vscode.TreeItem(MAIN_CHAT_LABEL, vscode.TreeItemCollapsibleState.None);
    main.iconPath = new vscode.ThemeIcon('comment-discussion');
    main.command = { command: 'poc-vscode-addin.openMainChat', title: 'Main Chat' };
    main.tooltip = 'Open the main chat';
    main.contextValue = 'mainChat';

    const items: vscode.TreeItem[] = [main];
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
