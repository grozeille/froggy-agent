import * as vscode from 'vscode';
import { REFRESH_FILES_TOOL_NAME } from './refreshFiles';

/** Refreshes the Files sidebar view after file changes. */
export class RefreshFilesTool implements vscode.LanguageModelTool<object> {
  public constructor(private readonly _onRefresh: () => void) {}

  public async prepareInvocation(
    _options: vscode.LanguageModelToolInvocationPrepareOptions<object>,
    _token: vscode.CancellationToken
  ): Promise<vscode.PreparedToolInvocation> {
    return { invocationMessage: 'Refreshing the Files view' };
  }

  public async invoke(
    _options: vscode.LanguageModelToolInvocationOptions<object>,
    _token: vscode.CancellationToken
  ): Promise<vscode.LanguageModelToolResult> {
    this._onRefresh();
    return new vscode.LanguageModelToolResult([
      new vscode.LanguageModelTextPart('Files view refreshed.')
    ]);
  }
}

export function registerRefreshFilesTool(
  onRefresh: () => void
): vscode.Disposable | undefined {
  if (!vscode.lm?.registerTool) {
    return undefined;
  }
  return vscode.lm.registerTool(REFRESH_FILES_TOOL_NAME, new RefreshFilesTool(onRefresh));
}
