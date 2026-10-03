import * as path from 'path';
import * as vscode from 'vscode';
import { copyIntoDir } from './fileCommands';
import { isMarkdownFile } from './files';
import { infoTreeItem } from './treeItems';

export class FilesTreeItem extends vscode.TreeItem {
  constructor(
    label: string,
    collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly isDirectory: boolean
  ) {
    super(label, collapsibleState);
  }
}

export class FilesProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
  public static readonly viewId = 'pocFilesView';

  private readonly _onDidChangeTreeData = new vscode.EventEmitter<vscode.TreeItem | undefined>();
  public readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  public refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  public getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  public async getChildren(element?: vscode.TreeItem): Promise<vscode.TreeItem[]> {
    let dir: vscode.Uri;
    if (!element) {
      const root = vscode.workspace.workspaceFolders?.[0]?.uri;
      if (!root) {
        return [infoTreeItem('Open a workspace folder to see data files.')];
      }
      dir = vscode.Uri.joinPath(root, 'data');
    } else if (element instanceof FilesTreeItem && element.isDirectory && element.resourceUri) {
      dir = element.resourceUri;
    } else {
      return [];
    }

    let entries: [string, vscode.FileType][];
    try {
      entries = await vscode.workspace.fs.readDirectory(dir);
    } catch {
      return element ? [] : [infoTreeItem('No data folder found.')];
    }
    const names = (type: vscode.FileType): string[] =>
      entries
        .filter(([, entryType]) => entryType === type)
        .map(([name]) => name)
        .sort((a, b) => a.localeCompare(b));

    const items: vscode.TreeItem[] = names(vscode.FileType.Directory).map((name) => {
      const uri = vscode.Uri.joinPath(dir, name);
      const item = new FilesTreeItem(name, vscode.TreeItemCollapsibleState.Collapsed, true);
      item.resourceUri = uri;
      item.iconPath = vscode.ThemeIcon.Folder;
      item.contextValue = 'dataFolder';
      item.tooltip = uri.fsPath;
      return item;
    });

    for (const name of names(vscode.FileType.File)) {
      const uri = vscode.Uri.joinPath(dir, name);
      const item = new FilesTreeItem(name, vscode.TreeItemCollapsibleState.None, false);
      item.resourceUri = uri;
      item.command = isMarkdownFile(name)
        ? { command: 'poc-vscode-addin.openPreview', title: 'Open Preview', arguments: [uri] }
        : { command: 'vscode.open', title: 'Open File', arguments: [uri] };
      item.contextValue = 'dataFile';
      item.tooltip = uri.fsPath;
      items.push(item);
    }

    if (!element && items.length === 0) {
      return [infoTreeItem('Data folder is empty.')];
    }
    return items;
  }
}

export class FilesDragDropController implements vscode.TreeDragAndDropController<vscode.TreeItem> {
  public readonly dragMimeTypes = ['text/uri-list'];
  public readonly dropMimeTypes = ['files', 'text/uri-list'];

  constructor(private readonly _refresh: () => void) {}

  public async handleDrag(
    source: readonly vscode.TreeItem[],
    dataTransfer: vscode.DataTransfer
  ): Promise<void> {
    const uris = source
      .map((item) => item.resourceUri)
      .filter((uri): uri is vscode.Uri => !!uri);
    if (uris.length > 0) {
      dataTransfer.set(
        'text/uri-list',
        new vscode.DataTransferItem(uris.map((uri) => uri.toString()).join('\r\n'))
      );
    }
  }

  public async handleDrop(
    target: vscode.TreeItem | undefined,
    dataTransfer: vscode.DataTransfer
  ): Promise<void> {
    const root = vscode.workspace.workspaceFolders?.[0]?.uri;
    if (!root) {
      return;
    }
    let dir = vscode.Uri.joinPath(root, 'data');
    if (target instanceof FilesTreeItem && target.isDirectory && target.resourceUri) {
      dir = target.resourceUri;
    }
    const seen = new Set<string>();
    const uris: vscode.Uri[] = [];
    const collect = (uri: vscode.Uri | undefined): void => {
      if (!uri || uri.scheme !== 'file' || seen.has(uri.fsPath)) {
        return;
      }
      seen.add(uri.fsPath);
      uris.push(uri);
    };
    dataTransfer.forEach((item) => collect(item.asFile()?.uri));
    const list = dataTransfer.get('text/uri-list');
    if (list) {
      for (const line of (await list.asString()).split(/\r?\n/)) {
        const trimmed = line.trim();
        if (trimmed) {
          try {
            collect(vscode.Uri.parse(trimmed));
          } catch {
            // Skip unparsable entries.
          }
        }
      }
    }
    for (const uri of uris) {
      try {
        if (uri.fsPath.startsWith(dir.fsPath + path.sep)) {
          continue; // Already here (dragged from this same folder).
        }
        await copyIntoDir(uri, dir);
      } catch {
        // Skip unreadable entries.
      }
    }
    this._refresh();
  }
}
