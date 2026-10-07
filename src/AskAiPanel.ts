import * as vscode from 'vscode';
import {
  appendActionLog,
  formatActionLog,
  stripAnsi,
  type ActionLogEntry
} from './actionLog';
import { agentEnvironmentPreamble, chartHint, clarificationHint, historyGroundingHint, terminalToolHint, webSearchHint } from './agentEnv';
import {
  isAnswerResultMessage,
  isAskAiMessage,
  isConfirmResultMessage,
  isOpenActionLogMessage,
  isOpenLinkMessage,
  isStopMessage
} from './askAi';
import {
  ASK_QUESTIONS_TOOL_NAME,
  dismissedQuestionsText,
  formatAskQuestionsHint,
  formatQuestionAnswers,
  resolveAskedQuestions,
  type AskedQuestion,
  type QuestionAnswer
} from './askQuestions';
import { formatSkillsHint, takeRunCommands, truncateOutput } from './skillRun';
import { CREATE_SKILL_TOOL_NAME, formatCreateSkillHint } from './skillCreate';
import { listRunnableSkills } from './skillRunTool';
import { DATE_TIME_TOOL_NAME } from './dateTime';
import { GOOGLE_SEARCH_TOOL_NAME } from './searchUrl';
import { WEB_SEARCH_TOOL_NAME } from './webSearch';
import { OPEN_PAGE_TOOL_NAME } from './openPage';
import { FETCH_PAGE_TOOL_NAME } from './fetchPage';
import { APPEND_MEMORY_TOOL_NAME, READ_MEMORY_TOOL_NAME } from './memory';
import { MODEL_SETTING_DEFAULT, MODEL_SETTING_KEY, pickChatModel } from './modelSelection';
import { LIST_DATA_FILES_TOOL_NAME, READ_DATA_FILE_TOOL_NAME } from './dataFiles';
import { RUN_SKILL_TOOL_NAME } from './skillRun';
import {
  CONFIRM_SETTING_DEFAULT,
  CONFIRM_SETTING_KEY,
  describeToolCall,
  dropSupersededTerminalTools,
  needsConfirmation,
  resolveAgentTools,
  summarizeToolInput,
  TOOL_SETTING_DEFAULT,
  TOOL_SETTING_KEY,
  type ToolCallDescription
} from './toolSelection';
import { TERMINAL_TOOL_NAME } from './terminal';
import {
  ATTENTION_ACTION,
  formatAnswerNotification,
  formatConfirmNotification,
  formatErrorNotification,
  formatQuestionNotification,
  NATIVE_APP_NAME,
  shouldNotifyAttention,
  toNativeBody
} from './notify';
import { showWindowsToast, supportsNativeToast } from './winToast';
import { isSafeHttpUrl } from './urls';
import { SessionStore } from './sessionStore';
import {
  declinedToolResultText,
  isMainSession,
  MAX_HISTORY_MESSAGES,
  NEW_SESSION_TITLE,
  recentMessages,
  titleFromPrompt,
  toReplayItems,
  withMessage,
  type ChatSession,
  type ChatToolRun
} from './sessions';

export class AskAiPanel {
  public static currentPanel: AskAiPanel | undefined;
  public static readonly viewType = 'froggyAskAi';

  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionUri: vscode.Uri;
  private readonly _store: SessionStore;
  private _sessionId: string;
  private _disposables: vscode.Disposable[] = [];
  private _pendingConfirms = new Map<string, (approved: boolean) => void>();
  private _confirmSeq = 0;
  private _pendingQuestions = new Map<string, (answers: QuestionAnswer[] | null) => void>();
  private _questionSeq = 0;
  private _actionLogs = new Map<string, ActionLogEntry[]>();
  private _askRuns = new Map<string, { source: vscode.CancellationTokenSource; cancelled: boolean }>();

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
        } else if (isConfirmResultMessage(message)) {
          this._resolveConfirm(message.id, message.approved);
        } else if (isAnswerResultMessage(message)) {
          this._resolveQuestion(message.id, message.answers);
        } else if (isOpenActionLogMessage(message)) {
          await this._handleOpenActionLog(message.sessionId);
        } else if (isStopMessage(message)) {
          this._handleStop(message.sessionId);
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
    for (const run of this._askRuns.values()) {
      run.cancelled = true;
      run.source.cancel();
    }
    this._askRuns.clear();
    this._denyPendingPrompts();
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
    // Leaving a flow that waits for confirmation denies it: never run a
    // sensitive tool the user walked away from.
    this._denyPendingPrompts();
    this._sessionId = sessionId;
    this._updateTitle(session);
    await this._panel.webview.postMessage({
      command: 'transcript',
      sessionId,
      messages: session.messages,
      busy: this._askRuns.has(sessionId)
    });
    await this._postEffectiveModel(sessionId);
  }

  /**
   * Empty the open discussion's transcript (Clear), tool history included.
   * Refused while an answer runs: clearing mid-run would race the run's own
   * save, so Stop first.
   */
  public async clearSession(): Promise<void> {
    const sessionId = this._sessionId;
    if (this._askRuns.has(sessionId)) {
      await vscode.window.showInformationMessage(
        'Stop the current answer before clearing this discussion.'
      );
      return;
    }
    const cleared = await this._store.clear(sessionId);
    if (!cleared) {
      return;
    }
    this._actionLogs.delete(sessionId);
    await this._showSession(sessionId);
  }

  /** Abort the in-flight ask for a session, if any. */
  private _handleStop(sessionId: string): void {
    const run = this._askRuns.get(sessionId);
    if (run) {
      run.cancelled = true;
      run.source.cancel();
    }
    this._denyPendingPrompts();
  }

  private async _resolveModel(): Promise<vscode.LanguageModelChat> {
    const models = await vscode.lm.selectChatModels();
    const setting = vscode.workspace
      .getConfiguration('froggy-agent')
      .get<string>(MODEL_SETTING_KEY, MODEL_SETTING_DEFAULT);
    return pickChatModel(models, setting);
  }

  /** In-chat Continue/Cancel gate for sensitive tool calls. */
  private async _confirmToolCall(
    sessionId: string,
    description: ToolCallDescription
  ): Promise<boolean> {
    const id = `confirm-${++this._confirmSeq}`;
    await this._panel.webview.postMessage({
      command: 'confirm',
      sessionId,
      id,
      title: description.title,
      detail: description.detail
    });
    this._notifyAttention(formatConfirmNotification(description.title));
    return new Promise<boolean>((resolve) => {
      this._pendingConfirms.set(id, resolve);
    });
  }

  private _resolveConfirm(id: string, approved: boolean): void {
    const resolve = this._pendingConfirms.get(id);
    if (resolve) {
      this._pendingConfirms.delete(id);
      resolve(approved);
    }
  }

  /** In-chat question card shown when the model asks structured questions. */
  private async _askUserQuestions(
    sessionId: string,
    questions: AskedQuestion[]
  ): Promise<QuestionAnswer[] | null> {
    const id = `question-${++this._questionSeq}`;
    await this._panel.webview.postMessage({ command: 'question', sessionId, id, questions });
    this._notifyAttention(formatQuestionNotification(questions));
    return new Promise<QuestionAnswer[] | null>((resolve) => {
      this._pendingQuestions.set(id, resolve);
    });
  }

  private _resolveQuestion(id: string, answers: QuestionAnswer[] | null): void {
    const resolve = this._pendingQuestions.get(id);
    if (resolve) {
      this._pendingQuestions.delete(id);
      resolve(answers);
    }
  }

  /** Deny anything still pending (session switch, panel close, stop). */
  private _denyPendingPrompts(): void {
    for (const resolve of this._pendingConfirms.values()) {
      resolve(false);
    }
    this._pendingConfirms.clear();
    for (const resolve of this._pendingQuestions.values()) {
      resolve(null);
    }
    this._pendingQuestions.clear();
  }

  /** Refresh the panel badge; failures surface later when asking. */
  private async _postEffectiveModel(sessionId: string): Promise<void> {
    try {
      if (!vscode.lm) {
        return;
      }
      const model = await this._resolveModel();
      await this._panel.webview.postMessage({ command: 'model', sessionId, name: model.name });
    } catch {
      // Leave the badge as-is; asking will report the problem.
    }
  }

  /**
   * Attention ping when VS Code lost the focus: the user would otherwise
   * miss the finished answer, question or confirmation waiting in the chat.
   * Exactly one popup: the native OS toast on Windows, the in-app popup
   * (with an Open Chat action) where no native toast exists.
   */
  private _notifyAttention(message: string): void {
    if (!shouldNotifyAttention(vscode.window.state.focused)) {
      return;
    }
    if (supportsNativeToast()) {
      showWindowsToast(NATIVE_APP_NAME, toNativeBody(message));
      return;
    }
    void vscode.window.showInformationMessage(message, ATTENTION_ACTION).then((selection) => {
      if (selection === ATTENTION_ACTION) {
        this._panel.reveal(vscode.ViewColumn.One);
      }
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
    if (session.messages.length === 0 && !isMainSession(session)) {
      session = { ...session, title: titleFromPrompt(text) };
    }
    session = withMessage(session, { role: 'user', text }, Date.now());
    await this._store.save(session);
    this._updateTitle(session);
    await webview.postMessage({ command: 'status', sessionId, text: 'Thinking...' });

    const run = { source: new vscode.CancellationTokenSource(), cancelled: false };
    this._askRuns.set(sessionId, run);
    const token = run.source.token;
    let answer = '';
    const toolRuns: ChatToolRun[] = [];
    try {
      // No agent / tool picker in the UI: model from the `froggy-agent.model`
      // setting (`auto` by default), tools run automatically.
      if (!vscode.lm) {
        throw new Error('Language models are not available in this version of VS Code.');
      }
      const model = await this._resolveModel();
      await webview.postMessage({ command: 'model', sessionId, name: model.name });
      // Agent mode: the model may call tools. Calls run silently — the panel
      // keeps showing "Thinking...". Builtins (date/time, data files, browser,
      // web search + page fetch, memory, questions, skill runner, skill factory
      // and terminal runner) plus the extra names from the tools setting; file
      // tools resolve paths inside <workspace>/data implicitly. External terminal
      // tools are dropped when the builtin is available so a run never asks
      // twice (in-chat card + native popup).
      const builtinTools = [
        DATE_TIME_TOOL_NAME,
        READ_DATA_FILE_TOOL_NAME,
        LIST_DATA_FILES_TOOL_NAME,
        GOOGLE_SEARCH_TOOL_NAME,
        WEB_SEARCH_TOOL_NAME,
        OPEN_PAGE_TOOL_NAME,
        FETCH_PAGE_TOOL_NAME,
        READ_MEMORY_TOOL_NAME,
        APPEND_MEMORY_TOOL_NAME,
        ASK_QUESTIONS_TOOL_NAME,
        RUN_SKILL_TOOL_NAME,
        CREATE_SKILL_TOOL_NAME,
        TERMINAL_TOOL_NAME
      ];
      const config = vscode.workspace.getConfiguration('froggy-agent');
      const extraNames = config.get<string[]>(TOOL_SETTING_KEY, [...TOOL_SETTING_DEFAULT]);
      const tools = dropSupersededTerminalTools(
        resolveAgentTools(vscode.lm.tools, builtinTools, extraNames ?? []),
        TERMINAL_TOOL_NAME
      );
      const confirmList =
        config.get<string[]>(CONFIRM_SETTING_KEY, [...CONFIRM_SETTING_DEFAULT]) ?? [];
      // Unsaved preamble: OS/shell match + default to the terminal tool
      // (only named when actually offered) + do-not-redo grounding +
      // default to the web search tool on explicit internet requests (only
      // named when actually offered) + runnable skill catalog (so matching
      // requests route to the skill runner instead of the terminal) +
      // skill-factory nudge (creation requests delegate to the builder
      // agent) + clarify-when-ambiguous nudge + chart nudge (data answers
      // also render the most adapted chart) + structured-questions nudge
      // (only named when offered).
      const offeredNames = tools.map((tool) => tool.name);
      const skillsHint = offeredNames.includes(RUN_SKILL_TOOL_NAME)
        ? formatSkillsHint(await listRunnableSkills(), RUN_SKILL_TOOL_NAME)
        : '';
      const createSkillHint = offeredNames.includes(CREATE_SKILL_TOOL_NAME)
        ? formatCreateSkillHint(CREATE_SKILL_TOOL_NAME)
        : '';
      const askQuestionsHint = offeredNames.includes(ASK_QUESTIONS_TOOL_NAME)
        ? formatAskQuestionsHint(ASK_QUESTIONS_TOOL_NAME)
        : '';
      const preamble =
        agentEnvironmentPreamble() +
        terminalToolHint(offeredNames) +
        historyGroundingHint() +
        webSearchHint(offeredNames) +
        clarificationHint() +
        chartHint() +
        skillsHint +
        createSkillHint +
        askQuestionsHint;
      // History replays past tool rounds (calls + results, as in the live
      // loop) — without them the model cannot tell previous turns' actions
      // were already performed and redoes them on every new question.
      const messages: vscode.LanguageModelChatMessage[] = [
        vscode.LanguageModelChatMessage.User(preamble)
      ];
      for (const item of toReplayItems(recentMessages(session, MAX_HISTORY_MESSAGES))) {
        if (item.kind === 'toolRound') {
          messages.push(
            vscode.LanguageModelChatMessage.Assistant(
              item.calls.map(
                (call) => new vscode.LanguageModelToolCallPart(call.callId, call.tool, call.input)
              )
            )
          );
          messages.push(
            vscode.LanguageModelChatMessage.User(
              item.calls.map(
                (call) =>
                  new vscode.LanguageModelToolResultPart(call.callId, [
                    new vscode.LanguageModelTextPart(call.resultText)
                  ])
              )
            )
          );
        } else if (item.kind === 'assistant') {
          messages.push(vscode.LanguageModelChatMessage.Assistant(item.text));
        } else {
          messages.push(vscode.LanguageModelChatMessage.User(item.text));
        }
      }
      let ranTools = false;
      for (let turn = 0; turn < 5; turn++) {
        // Never trust the provider to honor cancellation: check explicitly so
        // Stop works even when the stream keeps yielding after cancel.
        if (run.cancelled) {
          break;
        }
        const response = await model.sendRequest(messages, { tools }, token);
        const toolCalls: vscode.LanguageModelToolCallPart[] = [];
        for await (const part of response.stream) {
          if (run.cancelled) {
            break;
          }
          if (part instanceof vscode.LanguageModelTextPart) {
            answer += part.value;
            await webview.postMessage({ command: 'chunk', sessionId, text: part.value });
          } else if (part instanceof vscode.LanguageModelToolCallPart) {
            toolCalls.push(part);
          }
        }
        if (run.cancelled) {
          break;
        }
        if (toolCalls.length === 0) {
          break;
        }
        const toolResults: vscode.LanguageModelToolResultPart[] = [];
        for (const call of toolCalls) {
          ranTools = true;
          const inputSummary = summarizeToolInput(call.input, 300);
          // Questions need no confirmation gate: asking the user IS the interaction.
          const gated =
            needsConfirmation(call.name, confirmList) && call.name !== ASK_QUESTIONS_TOOL_NAME;
          let decision: ActionLogEntry['decision'] = gated ? 'approved' : 'auto';
          let output: string | undefined;
          let commands: string[] | undefined;
          try {
            if (gated) {
              const description = describeToolCall(call.name, call.input, 300);
              await webview.postMessage({
                command: 'status',
                sessionId,
                text: `Waiting for confirmation: ${description.title}`
              });
              const allowed = await this._confirmToolCall(sessionId, description);
              if (!allowed) {
                decision = 'declined';
                toolResults.push(
                  new vscode.LanguageModelToolResultPart(call.callId, [
                    new vscode.LanguageModelTextPart(declinedToolResultText(call.name))
                  ])
                );
                toolRuns.push({ tool: call.name, input: call.input, decision });
                this._recordAction(sessionId, {
                  at: Date.now(),
                  tool: call.name,
                  input: inputSummary,
                  decision,
                  output
                });
                continue;
              }
            }
            // Structured user questions are answered in-chat by the panel
            // itself: no tool invocation, the answers come back as the result.
            if (call.name === ASK_QUESTIONS_TOOL_NAME) {
              const questions = resolveAskedQuestions(call.input);
              if (!questions) {
                const message = 'Ask at least one valid question with a non-empty question text.';
                output = `Error: ${message}`;
                toolResults.push(
                  new vscode.LanguageModelToolResultPart(call.callId, [
                    new vscode.LanguageModelTextPart(`Tool failed: ${message}`)
                  ])
                );
                toolRuns.push({ tool: call.name, input: call.input, output, decision });
              } else {
                await webview.postMessage({
                  command: 'status',
                  sessionId,
                  text: 'Waiting for your answers'
                });
                const answers = await this._askUserQuestions(sessionId, questions);
                if (!answers) {
                  decision = 'declined';
                  toolResults.push(
                    new vscode.LanguageModelToolResultPart(call.callId, [
                      new vscode.LanguageModelTextPart(dismissedQuestionsText())
                    ])
                  );
                  toolRuns.push({ tool: call.name, input: call.input, decision });
                } else {
                  output = truncateOutput(formatQuestionAnswers(questions, answers), 2000);
                  toolResults.push(
                    new vscode.LanguageModelToolResultPart(call.callId, [
                      new vscode.LanguageModelTextPart(output)
                    ])
                  );
                  toolRuns.push({ tool: call.name, input: call.input, output, decision });
                }
              }
              this._recordAction(sessionId, {
                at: Date.now(),
                tool: call.name,
                input: inputSummary,
                decision,
                output
              });
              continue;
            }
            const result = await vscode.lm.invokeTool(
              call.name,
              { input: call.input, toolInvocationToken: undefined },
              token
            );
            output = truncateOutput(stripAnsi(toolResultText(result.content)), 2000);
            commands = takeRunCommands();
            toolResults.push(new vscode.LanguageModelToolResultPart(call.callId, result.content));
            toolRuns.push({ tool: call.name, input: call.input, output, decision });
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            output = `Error: ${message}`;
            commands = takeRunCommands();
            toolResults.push(
              new vscode.LanguageModelToolResultPart(call.callId, [
                new vscode.LanguageModelTextPart(`Tool failed: ${message}`)
              ])
            );
            toolRuns.push({ tool: call.name, input: call.input, output, decision });
          }
          this._recordAction(sessionId, {
            at: Date.now(),
            tool: call.name,
            input: inputSummary,
            decision,
            output,
            commands
          });
        }
        messages.push(vscode.LanguageModelChatMessage.Assistant(toolCalls));
        messages.push(vscode.LanguageModelChatMessage.User(toolResults));
      }
      if (ranTools) {
        await webview.postMessage({ command: 'actionLog', sessionId });
      }
      await this._store.save(
        withMessage(
          session,
          { role: 'assistant', text: answer, toolRuns: toolRuns.length > 0 ? toolRuns : undefined },
          Date.now()
        )
      );
      await webview.postMessage({ command: 'done', sessionId });
      if (!run.cancelled) {
        this._notifyAttention(formatAnswerNotification(answer));
      }
    } catch (err) {
      if (run.cancelled || err instanceof vscode.CancellationError) {
        // Stopped by the user: keep the partial answer, re-enable input.
        if (answer.length > 0) {
          await this._store.save(
            withMessage(
              session,
              {
                role: 'assistant',
                text: answer,
                toolRuns: toolRuns.length > 0 ? toolRuns : undefined
              },
              Date.now()
            )
          );
        }
        await webview.postMessage({ command: 'done', sessionId });
      } else {
        const message = err instanceof Error ? err.message : String(err);
        await webview.postMessage({ command: 'error', sessionId, message });
        this._notifyAttention(formatErrorNotification());
      }
    } finally {
      if (this._askRuns.get(sessionId) === run) {
        this._askRuns.delete(sessionId);
      }
    }
  }

  private _recordAction(sessionId: string, entry: ActionLogEntry): void {
    this._actionLogs.set(
      sessionId,
      appendActionLog(this._actionLogs.get(sessionId) ?? [], entry)
    );
  }

  private async _handleOpenActionLog(sessionId: string): Promise<void> {
    const content = formatActionLog(this._actionLogs.get(sessionId) ?? []);
    const doc = await vscode.workspace.openTextDocument({ content, language: 'plaintext' });
    await vscode.window.showTextDocument(doc, { preview: false });
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
    const chartsUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'charts.js'));
    const interactUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'chartInteract.js'));
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
      <div class="form-row">
        <button type="button" id="stop" disabled>Stop</button>
      </div>
    </form>
  </main>
  <script nonce="${nonce}" src="${chartsUri}"></script>
  <script nonce="${nonce}" src="${markdownUri}"></script>
  <script nonce="${nonce}" src="${scriptUri}"></script>
  <script nonce="${nonce}" src="${interactUri}"></script>
</body>
</html>`;
  }
}

function toolResultText(content: vscode.LanguageModelToolResult['content']): string {
  return content
    .map((part) => (part instanceof vscode.LanguageModelTextPart ? part.value : '[non-text part]'))
    .join('');
}

function getNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let nonce = '';
  for (let i = 0; i < 32; i++) {
    nonce += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return nonce;
}
