import * as vscode from 'vscode';
import { buildGoogleSearchUrl, GOOGLE_SEARCH_TOOL_NAME, type GoogleSearchToolInput } from './searchUrl';

/** Opens a Google search in the built-in VS Code Simple Browser. */
export class GoogleSearchTool implements vscode.LanguageModelTool<GoogleSearchToolInput> {
  public async prepareInvocation(
    options: vscode.LanguageModelToolInvocationPrepareOptions<GoogleSearchToolInput>,
    _token: vscode.CancellationToken
  ): Promise<vscode.PreparedToolInvocation> {
    const query = options.input.query?.trim() ?? '';
    return { invocationMessage: `Searching Google for "${query}"` };
  }

  public async invoke(
    options: vscode.LanguageModelToolInvocationOptions<GoogleSearchToolInput>,
    _token: vscode.CancellationToken
  ): Promise<vscode.LanguageModelToolResult> {
    const query = options.input.query?.trim() ?? '';
    if (!query) {
      throw new Error('A search query is required.');
    }
    const url = buildGoogleSearchUrl(query);
    try {
      await vscode.commands.executeCommand('simpleBrowser.show', url);
    } catch {
      // Fall back to the external browser if the Simple Browser is unavailable.
      await vscode.env.openExternal(vscode.Uri.parse(url));
    }
    return new vscode.LanguageModelToolResult([
      new vscode.LanguageModelTextPart(`Opened a Google search for "${query}" in VS Code (${url}).`)
    ]);
  }
}

export function registerGoogleSearchTool(): vscode.Disposable | undefined {
  if (!vscode.lm?.registerTool) {
    return undefined;
  }
  return vscode.lm.registerTool(GOOGLE_SEARCH_TOOL_NAME, new GoogleSearchTool());
}
