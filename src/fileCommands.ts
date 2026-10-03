import * as path from 'path';
import * as vscode from 'vscode';
import { copyNameFor, validateFileName } from './files';

export const FILES_CLIPBOARD_CONTEXT = 'pocFilesClipboardHasData';

function toUri(value: unknown): vscode.Uri | undefined {
  if (value instanceof vscode.Uri) {
    return value;
  }
  if (typeof value === 'object' && value !== null) {
    const resourceUri = (value as { resourceUri?: unknown }).resourceUri;
    if (resourceUri instanceof vscode.Uri) {
      return resourceUri;
    }
  }
  return undefined;
}

function selectedUris(item: unknown, selected: unknown): vscode.Uri[] {
  const items = Array.isArray(selected) && selected.length > 0 ? selected : [item];
  const uris: vscode.Uri[] = [];
  for (const entry of items) {
    const uri = toUri(entry);
    if (uri && !uris.some((known) => known.toString() === uri.toString())) {
      uris.push(uri);
    }
  }
  return uris;
}

function dataDir(): vscode.Uri | undefined {
  const root = vscode.workspace.workspaceFolders?.[0]?.uri;
  return root ? vscode.Uri.joinPath(root, 'data') : undefined;
}

async function exists(uri: vscode.Uri): Promise<boolean> {
  try {
    await vscode.workspace.fs.stat(uri);
    return true;
  } catch {
    return false;
  }
}

async function isDirectory(uri: vscode.Uri): Promise<boolean> {
  try {
    return (await vscode.workspace.fs.stat(uri)).type === vscode.FileType.Directory;
  } catch {
    return false;
  }
}

/** Creation target: the clicked folder, or the data root. */
async function targetDir(item: unknown): Promise<vscode.Uri | undefined> {
  const base = dataDir();
  const uri = toUri(item);
  if (uri && (await isDirectory(uri))) {
    return uri;
  }
  return base;
}

async function uniqueDest(dir: vscode.Uri, fileName: string): Promise<vscode.Uri> {
  for (let attempt = 0; attempt < 100; attempt++) {
    const candidate = vscode.Uri.joinPath(dir, copyNameFor(fileName, attempt));
    if (!(await exists(candidate))) {
      return candidate;
    }
  }
  return vscode.Uri.joinPath(dir, copyNameFor(fileName, Date.now()));
}

export async function copyIntoDir(source: vscode.Uri, dir: vscode.Uri): Promise<void> {
  await vscode.workspace.fs.createDirectory(dir);
  await vscode.workspace.fs.copy(
    source,
    await uniqueDest(dir, path.posix.basename(source.path)),
    { overwrite: false }
  );
}

async function promptName(prompt: string): Promise<string | undefined> {
  const name = await vscode.window.showInputBox({ prompt, validateInput: validateFileName });
  return name?.trim() ? name : undefined;
}

export function registerFileCommands(refresh: () => void): vscode.Disposable[] {
  let clipboard: vscode.Uri[] = [];
  const setClipboard = (uris: vscode.Uri[]): void => {
    clipboard = uris;
    void vscode.commands.executeCommand('setContext', FILES_CLIPBOARD_CONTEXT, uris.length > 0);
  };

  const newFile = vscode.commands.registerCommand(
    'poc-vscode-addin.newFile',
    async (item?: unknown) => {
      const dir = await targetDir(item);
      if (!dir) {
        return;
      }
      const name = await promptName('New file name');
      if (!name) {
        return;
      }
      const target = vscode.Uri.joinPath(dir, name);
      if (await exists(target)) {
        void vscode.window.showErrorMessage(`"${name}" already exists.`);
        return;
      }
      try {
        await vscode.workspace.fs.createDirectory(dir);
        await vscode.workspace.fs.writeFile(target, new Uint8Array());
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        void vscode.window.showErrorMessage(`Create file failed: ${message}`);
        return;
      }
      refresh();
      await vscode.commands.executeCommand('vscode.open', target);
    }
  );

  const newFolder = vscode.commands.registerCommand(
    'poc-vscode-addin.newFolder',
    async (item?: unknown) => {
      const dir = await targetDir(item);
      if (!dir) {
        return;
      }
      const name = await promptName('New folder name');
      if (!name) {
        return;
      }
      const target = vscode.Uri.joinPath(dir, name);
      if (await exists(target)) {
        void vscode.window.showErrorMessage(`"${name}" already exists.`);
        return;
      }
      try {
        await vscode.workspace.fs.createDirectory(target);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        void vscode.window.showErrorMessage(`Create folder failed: ${message}`);
        return;
      }
      refresh();
    }
  );

  const copy = vscode.commands.registerCommand(
    'poc-vscode-addin.copyFile',
    (item?: unknown, selected?: unknown) => {
      const uris = selectedUris(item, selected);
      if (uris.length > 0) {
        setClipboard(uris);
      }
    }
  );

  const paste = vscode.commands.registerCommand(
    'poc-vscode-addin.pasteFile',
    async (item?: unknown) => {
      const dir = await targetDir(item);
      if (!dir || clipboard.length === 0) {
        return;
      }
      for (const uri of clipboard) {
        try {
          await copyIntoDir(uri, dir);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          void vscode.window.showErrorMessage(`Paste failed: ${message}`);
        }
      }
      refresh();
    }
  );

  const rename = vscode.commands.registerCommand(
    'poc-vscode-addin.renameFile',
    async (item?: unknown) => {
      const uri = toUri(item);
      if (!uri) {
        return;
      }
      const current = path.posix.basename(uri.path);
      const next = await vscode.window.showInputBox({
        prompt: 'Rename',
        value: current,
        validateInput: validateFileName
      });
      if (!next || next === current) {
        return;
      }
      const target = uri.with({ path: path.posix.join(path.posix.dirname(uri.path), next) });
      if (await exists(target)) {
        void vscode.window.showErrorMessage(`A file named "${next}" already exists.`);
        return;
      }
      try {
        await vscode.workspace.fs.rename(uri, target);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        void vscode.window.showErrorMessage(`Rename failed: ${message}`);
        return;
      }
      refresh();
    }
  );

  const del = vscode.commands.registerCommand(
    'poc-vscode-addin.deleteFile',
    async (item?: unknown, selected?: unknown) => {
      const uris = selectedUris(item, selected);
      if (uris.length === 0) {
        return;
      }
      const label =
        uris.length === 1 ? `"${path.posix.basename(uris[0].path)}"` : `${uris.length} items`;
      const confirm = await vscode.window.showWarningMessage(`Delete ${label}?`, { modal: true }, 'Delete');
      if (confirm !== 'Delete') {
        return;
      }
      for (const uri of uris) {
        try {
          await vscode.workspace.fs.delete(uri, { useTrash: true, recursive: true });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          void vscode.window.showErrorMessage(`Delete failed: ${message}`);
        }
      }
      refresh();
    }
  );

  const reveal = vscode.commands.registerCommand(
    'poc-vscode-addin.revealFile',
    async (item?: unknown) => {
      const uri = toUri(item);
      if (uri) {
        await vscode.commands.executeCommand('revealFileInOS', uri);
      }
    }
  );

  const copyPath = vscode.commands.registerCommand(
    'poc-vscode-addin.copyPath',
    async (item?: unknown) => {
      const uri = toUri(item);
      if (uri) {
        await vscode.env.clipboard.writeText(uri.fsPath);
      }
    }
  );

  const copyRelativePath = vscode.commands.registerCommand(
    'poc-vscode-addin.copyRelativePath',
    async (item?: unknown) => {
      const uri = toUri(item);
      if (uri) {
        await vscode.env.clipboard.writeText(vscode.workspace.asRelativePath(uri));
      }
    }
  );

  return [newFile, newFolder, copy, paste, rename, del, reveal, copyPath, copyRelativePath];
}
