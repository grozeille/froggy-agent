import * as vscode from 'vscode';
import {
  formatFileListing,
  LIST_DATA_FILES_TOOL_NAME,
  MAX_DATA_FILE_BYTES,
  READ_DATA_FILE_TOOL_NAME,
  resolveDataRelativePath,
  type DataDirEntry,
  type ListDataFilesToolInput,
  type ReadDataFileToolInput
} from './dataFiles';

function dataDir(): vscode.Uri | undefined {
  const root = vscode.workspace.workspaceFolders?.[0]?.uri;
  return root ? vscode.Uri.joinPath(root, 'data') : undefined;
}

/** Reads a text file from the workspace `data/` folder. */
export class ReadDataFileTool implements vscode.LanguageModelTool<ReadDataFileToolInput> {
  public async prepareInvocation(
    options: vscode.LanguageModelToolInvocationPrepareOptions<ReadDataFileToolInput>,
    _token: vscode.CancellationToken
  ): Promise<vscode.PreparedToolInvocation> {
    return { invocationMessage: `Reading data file "${options.input.path?.trim() ?? ''}"` };
  }

  public async invoke(
    options: vscode.LanguageModelToolInvocationOptions<ReadDataFileToolInput>,
    _token: vscode.CancellationToken
  ): Promise<vscode.LanguageModelToolResult> {
    const base = dataDir();
    if (!base) {
      throw new Error('No workspace folder is open.');
    }
    const raw = options.input.path ?? '';
    const relative = resolveDataRelativePath(raw);
    if (!relative) {
      throw new Error(
        `Invalid path "${raw}". Use a path relative to the data folder, e.g. "notes/todo.md".`
      );
    }
    const uri = vscode.Uri.joinPath(base, ...relative.split('/'));
    let stat: vscode.FileStat;
    try {
      stat = await vscode.workspace.fs.stat(uri);
    } catch {
      throw new Error(`File "${relative}" was not found in the data folder.`);
    }
    if (stat.type === vscode.FileType.Directory) {
      throw new Error(`"${relative}" is a folder. List it to see its contents.`);
    }
    if (stat.size > MAX_DATA_FILE_BYTES) {
      throw new Error(
        `File "${relative}" is too large (${stat.size} bytes, limit ${MAX_DATA_FILE_BYTES}).`
      );
    }
    const text = new TextDecoder('utf-8').decode(await vscode.workspace.fs.readFile(uri));
    if (text.includes('\0')) {
      throw new Error(`File "${relative}" appears to be binary.`);
    }
    return new vscode.LanguageModelToolResult([
      new vscode.LanguageModelTextPart(`File "${relative}" (${stat.size} bytes):\n\n${text}`)
    ]);
  }
}

/** Lists files and subfolders in the workspace `data/` folder. */
export class ListDataFilesTool implements vscode.LanguageModelTool<ListDataFilesToolInput> {
  public async prepareInvocation(
    options: vscode.LanguageModelToolInvocationPrepareOptions<ListDataFilesToolInput>,
    _token: vscode.CancellationToken
  ): Promise<vscode.PreparedToolInvocation> {
    const sub = options.input.path?.trim() || 'data';
    return { invocationMessage: `Listing data folder "${sub}"` };
  }

  public async invoke(
    options: vscode.LanguageModelToolInvocationOptions<ListDataFilesToolInput>,
    _token: vscode.CancellationToken
  ): Promise<vscode.LanguageModelToolResult> {
    const base = dataDir();
    if (!base) {
      throw new Error('No workspace folder is open.');
    }
    const raw = options.input.path?.trim() ?? '';
    const relative = raw ? resolveDataRelativePath(raw) : '';
    if (relative === undefined) {
      throw new Error(
        `Invalid path "${raw}". Use a subfolder relative to the data folder, or omit it.`
      );
    }
    const uri = relative ? vscode.Uri.joinPath(base, ...relative.split('/')) : base;
    let entries: [string, vscode.FileType][];
    try {
      entries = await vscode.workspace.fs.readDirectory(uri);
    } catch {
      throw new Error(`Folder "${relative || 'data'}" was not found in the data folder.`);
    }
    const items: DataDirEntry[] = entries.map(([name, type]) => ({
      name,
      isDirectory: type === vscode.FileType.Directory
    }));
    const label = relative ? `data/${relative}` : 'data';
    const body = items.length === 0 ? '(empty)' : formatFileListing(items);
    return new vscode.LanguageModelToolResult([
      new vscode.LanguageModelTextPart(`Contents of "${label}":\n${body}`)
    ]);
  }
}

export function registerDataFileTools(): vscode.Disposable[] {
  if (!vscode.lm?.registerTool) {
    return [];
  }
  return [
    vscode.lm.registerTool(READ_DATA_FILE_TOOL_NAME, new ReadDataFileTool()),
    vscode.lm.registerTool(LIST_DATA_FILES_TOOL_NAME, new ListDataFilesTool())
  ];
}
