import * as vscode from 'vscode';

export function infoTreeItem(label: string): vscode.TreeItem {
  const item = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.None);
  item.contextValue = 'info';
  return item;
}
