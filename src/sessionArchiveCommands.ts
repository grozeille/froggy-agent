import * as vscode from 'vscode';
import { isMainSession } from './sessions';
import type { SessionStore } from './sessionStore';
import type { SessionTreeItem } from './sessionsProvider';

function toSessionRef(item: unknown): { id: string; archived: boolean } | undefined {
  const candidate = item as SessionTreeItem | undefined;
  const id = candidate?.sessionId;
  const archived = candidate?.archived;
  if (typeof id !== 'string' || !id || typeof archived !== 'boolean') {
    return undefined;
  }
  return { id, archived };
}

function failureMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Sessions view archive commands: Archive moves a session to the archive
 * (reversible, no confirmation), Restore moves it back, Delete
 * removes an archived session for good (modal confirmation). The main chat
 * is never listed, so it can never be archived.
 */
export function registerSessionArchiveCommands(
  store: SessionStore,
  refresh: () => void
): vscode.Disposable[] {
  const del = vscode.commands.registerCommand(
    'froggy-agent.deleteSession',
    async (item?: unknown) => {
      const ref = toSessionRef(item);
      if (!ref || ref.archived) {
        return;
      }
      const session = store.get(ref.id);
      if (!session) {
        void vscode.window.showErrorMessage('Session was not found.');
        refresh();
        return;
      }
      if (isMainSession(session)) {
        return;
      }
      try {
        await store.archive(ref.id);
      } catch (err) {
        void vscode.window.showErrorMessage(`Archive failed: ${failureMessage(err)}`);
        return;
      }
      refresh();
      void vscode.window.showInformationMessage(`Session "${session.title}" moved to the Archive.`);
    }
  );

  const restore = vscode.commands.registerCommand(
    'froggy-agent.restoreSession',
    async (item?: unknown) => {
      const ref = toSessionRef(item);
      if (!ref || !ref.archived) {
        return;
      }
      const session = store.get(ref.id);
      if (!session) {
        void vscode.window.showErrorMessage('Session was not found in the Archive.');
        refresh();
        return;
      }
      try {
        await store.restore(ref.id);
      } catch (err) {
        void vscode.window.showErrorMessage(`Restore failed: ${failureMessage(err)}`);
        return;
      }
      refresh();
      void vscode.window.showInformationMessage(`Session "${session.title}" restored.`);
    }
  );

  const delForever = vscode.commands.registerCommand(
    'froggy-agent.deleteSessionPermanently',
    async (item?: unknown) => {
      const ref = toSessionRef(item);
      if (!ref || !ref.archived) {
        return;
      }
      const session = store.get(ref.id);
      if (!session) {
        void vscode.window.showErrorMessage('Session was not found in the Archive.');
        refresh();
        return;
      }
      const confirm = await vscode.window.showWarningMessage(
        `Permanently delete session "${session.title}"? This cannot be undone.`,
        { modal: true },
        'Delete'
      );
      if (confirm !== 'Delete') {
        return;
      }
      try {
        await store.remove(ref.id);
      } catch (err) {
        void vscode.window.showErrorMessage(`Delete failed: ${failureMessage(err)}`);
        return;
      }
      refresh();
    }
  );

  return [del, restore, delForever];
}
