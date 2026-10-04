import * as vscode from 'vscode';
import { AskAiActionsProvider } from './askAiActionsProvider';
import { SessionsProvider } from './sessionsProvider';
import { FilesDragDropController, FilesProvider } from './filesProvider';
import { FILES_CLIPBOARD_CONTEXT, registerFileCommands } from './fileCommands';
import { SkillsProvider } from './skillsProvider';
import { registerSkillArchiveCommands } from './skillArchiveCommands';
import { ARCHIVE_DIR_NAME } from './skillArchive';
import { registerSessionArchiveCommands } from './sessionArchiveCommands';
import { AskAiPanel } from './AskAiPanel';
import { registerGoogleSearchTool } from './searchTool';
import { registerWebSearchTool } from './webSearchTool';
import { registerDateTimeTool } from './dateTimeTool';
import { registerDataFileTools } from './dataFilesTool';
import { registerRunSkillTool } from './skillRunTool';
import { registerAskQuestionsTool } from './askQuestionsTool';
import { registerCreateSkillTool } from './skillCreateTool';
import { registerTerminalTool } from './terminalTool';
import { registerOpenPageTool } from './openPageTool';
import { registerFetchPageTool } from './fetchPageTool';
import { registerMemoryTools } from './memoryTool';
import { SessionStore } from './sessionStore';

export function activate(context: vscode.ExtensionContext): void {
  const store = new SessionStore(context.globalState);
  const actionsProvider = new AskAiActionsProvider();
  const sessionsProvider = new SessionsProvider(store);
  const filesProvider = new FilesProvider();
  const skillsProvider = new SkillsProvider();

  store.onDidChange(() => sessionsProvider.refresh(), null, context.subscriptions);

  const filesView = vscode.window.createTreeView(FilesProvider.viewId, {
    treeDataProvider: filesProvider,
    dragAndDropController: new FilesDragDropController(() => filesProvider.refresh()),
    canSelectMany: true
  });
  void vscode.commands.executeCommand('setContext', FILES_CLIPBOARD_CONTEXT, false);

  context.subscriptions.push(
    store,
    filesView,
    ...registerFileCommands(() => filesProvider.refresh()),
    ...registerSkillArchiveCommands(() => skillsProvider.refresh()),
    ...registerSessionArchiveCommands(store, () => sessionsProvider.refresh()),
    vscode.window.registerTreeDataProvider(AskAiActionsProvider.viewId, actionsProvider),
    vscode.window.registerTreeDataProvider(SessionsProvider.viewId, sessionsProvider),
    vscode.window.registerTreeDataProvider(SkillsProvider.viewId, skillsProvider),
    vscode.commands.registerCommand('poc-vscode-addin.sayHello', () => {
      vscode.window.showInformationMessage('Hello from poc-vscode-addin!');
    }),
    vscode.commands.registerCommand('poc-vscode-addin.askAi', () => {
      return AskAiPanel.createOrShow(context.extensionUri, store);
    }),
    vscode.commands.registerCommand('poc-vscode-addin.newSession', async () => {
      const session = await store.create();
      await AskAiPanel.createOrShow(context.extensionUri, store, session.id);
    }),
    vscode.commands.registerCommand('poc-vscode-addin.clearSession', async () => {
      await AskAiPanel.currentPanel?.clearSession();
    }),
    vscode.commands.registerCommand('poc-vscode-addin.openSession', async (sessionId?: string) => {
      await AskAiPanel.createOrShow(context.extensionUri, store, sessionId);
    }),
    vscode.commands.registerCommand('poc-vscode-addin.openMainChat', async () => {
      const session = await store.getOrCreateMain();
      await AskAiPanel.createOrShow(context.extensionUri, store, session.id);
    }),
    vscode.commands.registerCommand('poc-vscode-addin.refreshExplorer', () => {
      sessionsProvider.refresh();
      filesProvider.refresh();
      skillsProvider.refresh();
    }),
    vscode.commands.registerCommand('poc-vscode-addin.openPreview', async (uri?: vscode.Uri) => {
      try {
        await vscode.commands.executeCommand('markdown.showPreview', uri);
      } catch {
        if (uri) {
          await vscode.commands.executeCommand('vscode.open', uri);
        }
      }
    })
  );

  for (const tool of [registerGoogleSearchTool(), registerWebSearchTool(), registerDateTimeTool(), ...registerDataFileTools(), ...registerMemoryTools(), registerRunSkillTool(), registerCreateSkillTool(() => skillsProvider.refresh()), registerAskQuestionsTool(), registerTerminalTool(), registerOpenPageTool(), registerFetchPageTool()]) {
    if (tool) {
      context.subscriptions.push(tool);
    }
  }

  // Keep the Files / Skills views fresh when files change.
  const watchers: Array<[string, () => void]> = [
    ['data/*', () => filesProvider.refresh()],
    ['.github/skills/**/*', () => skillsProvider.refresh()],
    [`${ARCHIVE_DIR_NAME}/**/*`, () => skillsProvider.refresh()]
  ];
  for (const [pattern, onChange] of watchers) {
    const watcher = vscode.workspace.createFileSystemWatcher(pattern);
    watcher.onDidCreate(onChange, null, context.subscriptions);
    watcher.onDidDelete(onChange, null, context.subscriptions);
    watcher.onDidChange(onChange, null, context.subscriptions);
    context.subscriptions.push(watcher);
  }
}

export function deactivate(): void {
  // No cleanup needed.
}
