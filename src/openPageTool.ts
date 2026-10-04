import * as vscode from 'vscode';
import { OPEN_PAGE_TOOL_NAME, resolveOpenPageUrl, type OpenPageToolInput } from './openPage';

/** Opens any http(s) page in the built-in VS Code Simple Browser. */
export class OpenPageTool implements vscode.LanguageModelTool<OpenPageToolInput> {
  public async prepareInvocation(
    options: vscode.LanguageModelToolInvocationPrepareOptions<OpenPageToolInput>,
    _token: vscode.CancellationToken
  ): Promise<vscode.PreparedToolInvocation> {
    const url = options.input.url?.trim() ?? '';
    return { invocationMessage: `Opening ${url || 'page'}` };
  }

  public async invoke(
    options: vscode.LanguageModelToolInvocationOptions<OpenPageToolInput>,
    _token: vscode.CancellationToken
  ): Promise<vscode.LanguageModelToolResult> {
    const url = resolveOpenPageUrl(options.input);
    if (!url) {
      throw new Error('A valid http(s) URL is required.');
    }
    try {
      await vscode.commands.executeCommand('simpleBrowser.show', url);
    } catch {
      // Fall back to the external browser if the Simple Browser is unavailable.
      await vscode.env.openExternal(vscode.Uri.parse(url));
    }
    return new vscode.LanguageModelToolResult([
      new vscode.LanguageModelTextPart(`Opened ${url} in VS Code.`)
    ]);
  }
}

export function registerOpenPageTool(): vscode.Disposable | undefined {
  if (!vscode.lm?.registerTool) {
    return undefined;
  }
  return vscode.lm.registerTool(OPEN_PAGE_TOOL_NAME, new OpenPageTool());
}
