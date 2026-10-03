import * as vscode from 'vscode';
import { isAskAiMessage, isOpenLinkMessage } from './askAi';
import { DATE_TIME_TOOL_NAME } from './dateTime';
import { LIST_DATA_FILES_TOOL_NAME, READ_DATA_FILE_TOOL_NAME } from './dataFiles';
import { isSafeHttpUrl } from './urls';
import { SessionStore } from './sessionStore';
import {
  MAX_HISTORY_MESSAGES,
  NEW_SESSION_TITLE,
  recentMessages,
  titleFromPrompt,
  withMessage,
  type ChatSession
} from './sessions';

export class AskAiPanel {
  public static currentPanel: AskAiPanel | undefined;
  public static readonly viewType = 'pocAskAi';

  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionUri: vscode.Uri;
  private readonly _store: SessionStore;
  private _sessionId: string;
  private _disposables: vscode.Disposable[] = [];

  private constructor(
    panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    store: SessionStore,
    sessionId: string
  ) {
    this._panel = panel;
    this._extensionUri = extensionUri;
    this._store = store;
    this._sessionId = sessionId;
    this._panel.webview.html = this._getHtmlForWebview(this._panel.webview);

    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
    this._panel.webview.onDidReceiveMessage(
      async (message: unknown) => {
        if (isAskAiMessage(message)) {
          await this._handleAsk(message.sessionId, message.prompt);
        } else if (isOpenLinkMessage(message)) {
          await this._handleOpenLink(message.url);
        }
      },
      null,
      this._disposables
    );

    void this._showSession(sessionId);
  }

  public static async createOrShow(
    extensionUri: vscode.Uri,
    store: SessionStore,
    sessionId?: string
  ): Promise<void> {
    const target =
      (sessionId && store.get(sessionId)) || store.list()[0] || (await store.create());
    if (AskAiPanel.currentPanel) {
      const panel = AskAiPanel.currentPanel;
      panel._panel.reveal(vscode.ViewColumn.One);
      await panel._showSession(target.id);
      return;
    }
    const webviewPanel = vscode.window.createWebviewPanel(
      AskAiPanel.viewType,
      'Ask AI',
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')],
        retainContextWhenHidden: true
      }
    );
    AskAiPanel.currentPanel = new AskAiPanel(webviewPanel, extensionUri, store, target.id);
  }

  public dispose(): void {
    AskAiPanel.currentPanel = undefined;
    this._panel.dispose();
    while (this._disposables.length) {
      const d = this._disposables.pop();
      d?.dispose();
    }
  }

  private async _showSession(sessionId: string): Promise<void> {
    const session = this._store.get(sessionId);
    if (!session) {
      return;
    }
    this._sessionId = sessionId;
    this._updateTitle(session);
    await this._panel.webview.postMessage({
      command: 'transcript',
      sessionId,
      messages: session.messages
    });
  }

  private async _handleAsk(sessionId: string, prompt: string): Promise<void> {
    const webview = this._panel.webview;
    let session = this._store.get(sessionId);
    if (!session) {
      await webview.postMessage({
        command: 'error',
        message: 'Session not found. Start a new session.'
      });
      return;
    }
    const text = prompt.trim();
    if (session.messages.length === 0) {
      session = { ...session, title: titleFromPrompt(text) };
    }
    session = withMessage(session, { role: 'user', text }, Date.now());
    await this._store.save(session);
    this._updateTitle(session);
    await webview.postMessage({ command: 'status', sessionId, text: 'Processing your request...' });

    try {
      // No agent / tool / model picker: always the default model, tools run automatically.
      if (!vscode.lm) {
        throw new Error('Language models are not available in this version of VS Code.');
      }
      const models = await vscode.lm.selectChatModels();
      if (models.length === 0) {
        throw new Error('No AI model available. Make sure Copilot is signed in.');
      }
      const model = models[0];
      const token = new vscode.CancellationTokenSource().token;
      // Agent mode: the model may call tools (date/time, data files). Calls run
      // silently — the panel keeps showing "Processing your request...".
      // File tools resolve paths inside <workspace>/data implicitly.
      const agentTools = [DATE_TIME_TOOL_NAME, READ_DATA_FILE_TOOL_NAME, LIST_DATA_FILES_TOOL_NAME];
      const tools = vscode.lm.tools.filter((tool) => agentTools.includes(tool.name));
      const messages = recentMessages(session, MAX_HISTORY_MESSAGES).map((item) =>
        item.role === 'assistant'
          ? vscode.LanguageModelChatMessage.Assistant(item.text)
          : vscode.LanguageModelChatMessage.User(item.text)
      );
      let answer = '';
      for (let turn = 0; turn < 5; turn++) {
        const response = await model.sendRequest(messages, { tools }, token);
        const toolCalls: vscode.LanguageModelToolCallPart[] = [];
        for await (const part of response.stream) {
          if (part instanceof vscode.LanguageModelTextPart) {
            answer += part.value;
            await webview.postMessage({ command: 'chunk', sessionId, text: part.value });
          } else if (part instanceof vscode.LanguageModelToolCallPart) {
            toolCalls.push(part);
          }
        }
        if (toolCalls.length === 0) {
          break;
        }
        const toolResults: vscode.LanguageModelToolResultPart[] = [];
        for (const call of toolCalls) {
          try {
            const result = await vscode.lm.invokeTool(
              call.name,
              { input: call.input, toolInvocationToken: undefined },
              token
            );
            toolResults.push(new vscode.LanguageModelToolResultPart(call.callId, result.content));
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            toolResults.push(
              new vscode.LanguageModelToolResultPart(call.callId, [
                new vscode.LanguageModelTextPart(`Tool failed: ${message}`)
              ])
            );
          }
        }
        messages.push(vscode.LanguageModelChatMessage.Assistant(toolCalls));
        messages.push(vscode.LanguageModelChatMessage.User(toolResults));
      }
      await this._store.save(withMessage(session, { role: 'assistant', text: answer }, Date.now()));
      await webview.postMessage({ command: 'done', sessionId });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await webview.postMessage({ command: 'error', sessionId, message });
    }
  }

  private async _handleOpenLink(url: string): Promise<void> {
    if (!isSafeHttpUrl(url)) {
      return;
    }
    await vscode.env.openExternal(vscode.Uri.parse(url.trim()));
  }

  private _updateTitle(session: ChatSession): void {
    this._panel.title = session.title === NEW_SESSION_TITLE ? 'Ask AI' : `Ask AI — ${session.title}`;
  }

  private _getHtmlForWebview(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'askAi.js'));
    const markdownUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'markdown.js'));
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'askAi.css'));
    const nonce = getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link href="${styleUri}" rel="stylesheet">
  <title>Ask AI</title>
</head>
<body>
  <main>
    <header>
      <h1>Ask AI</h1>
      <span class="model-badge">Model: Auto</span>
    </header>
    <div id="conversation" class="conversation" aria-live="polite"></div>
    <p id="status" class="status" role="status" hidden></p>
    <form id="ask-form">
      <textarea id="prompt" rows="3" placeholder="Ask a question... (Enter to send, Shift+Enter for a new line)" aria-label="Your question"></textarea>
    </form>
  </main>
  <script nonce="${nonce}" src="${markdownUri}"></script>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}

function getNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let nonce = '';
  for (let i = 0; i < 32; i++) {
    nonce += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return nonce;
}
