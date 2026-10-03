import * as vscode from 'vscode';
import { SessionStore } from './sessionStore';
import { NEW_SESSION_TITLE } from './sessions';
import { infoTreeItem } from './treeItems';

export class SessionsProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
  public static readonly viewId = 'pocSessionsView';

  private readonly _onDidChangeTreeData = new vscode.EventEmitter<vscode.TreeItem | undefined>();
  public readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(private readonly _store: SessionStore) {}

  public refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  public getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  public getChildren(): vscode.TreeItem[] {
    const sessions = this._store.list();
    if (sessions.length === 0) {
      return [infoTreeItem('No sessions yet.')];
    }
    return sessions.map((session) => {
      const item = new vscode.TreeItem(
        session.title || NEW_SESSION_TITLE,
        vscode.TreeItemCollapsibleState.None
      );
      item.iconPath = new vscode.ThemeIcon('comment-discussion');
      item.command = {
        command: 'poc-vscode-addin.openSession',
        title: 'Open Session',
        arguments: [session.id]
      };
      if (session.messages.length > 0) {
        item.description = `${session.messages.length} messages`;
      }
      item.tooltip = `Updated ${new Date(session.updatedAt).toLocaleString()}`;
      item.contextValue = 'session';
      return item;
    });
  }
}
