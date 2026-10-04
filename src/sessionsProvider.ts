import * as vscode from 'vscode';
import { SessionStore } from './sessionStore';
import {
  ARCHIVED_SESSION_CONTEXT_VALUE,
  NEW_SESSION_TITLE,
  SESSION_CONTEXT_VALUE,
  type ChatSession
} from './sessions';
import { ARCHIVE_CONTEXT_VALUE, ARCHIVE_LABEL, archiveSummary } from './archive';
import { infoTreeItem } from './treeItems';

/**
 * A session node in the Sessions view, live or archived. Archive commands
 * read `sessionId`/`archived` to update the right record.
 */
export class SessionTreeItem extends vscode.TreeItem {
  public readonly sessionId: string;
  public readonly archived: boolean;

  public constructor(label: string, sessionId: string, archived: boolean) {
    super(label, vscode.TreeItemCollapsibleState.None);
    this.sessionId = sessionId;
    this.archived = archived;
  }
}

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

  public getChildren(element?: vscode.TreeItem): vscode.TreeItem[] {
    if (element) {
      return element.contextValue === ARCHIVE_CONTEXT_VALUE
        ? this._store.listArchived().map((session) => this._sessionItem(session, true))
        : [];
    }
    const live = this._store.list();
    const items: vscode.TreeItem[] =
      live.length === 0
        ? [infoTreeItem('No sessions yet.')]
        : live.map((session) => this._sessionItem(session, false));
    const archived = this._store.listArchived();
    const archive = new vscode.TreeItem(
      ARCHIVE_LABEL,
      archived.length === 0
        ? vscode.TreeItemCollapsibleState.None
        : vscode.TreeItemCollapsibleState.Collapsed
    );
    archive.contextValue = ARCHIVE_CONTEXT_VALUE;
    archive.iconPath = new vscode.ThemeIcon('archive');
    archive.description = archiveSummary(archived.length, 'session', 'sessions');
    archive.tooltip = 'Deleted sessions. Restore them or delete them permanently.';
    items.push(archive);
    return items;
  }

  private _sessionItem(session: ChatSession, archived: boolean): vscode.TreeItem {
    const item = new SessionTreeItem(session.title || NEW_SESSION_TITLE, session.id, archived);
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
    item.contextValue = archived ? ARCHIVED_SESSION_CONTEXT_VALUE : SESSION_CONTEXT_VALUE;
    return item;
  }
}
