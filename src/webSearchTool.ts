import * as vscode from 'vscode';
import {
  formatSearchResults,
  resolveWebSearchQuery,
  runWebSearch,
  WEB_SEARCH_TOOL_NAME,
  type WebSearchToolInput
} from './webSearch';

/** Searches the internet and returns readable results for the model to summarize. */
export class WebSearchTool implements vscode.LanguageModelTool<WebSearchToolInput> {
  public async prepareInvocation(
    options: vscode.LanguageModelToolInvocationPrepareOptions<WebSearchToolInput>,
    _token: vscode.CancellationToken
  ): Promise<vscode.PreparedToolInvocation> {
    const query = options.input.query?.trim() ?? '';
    return { invocationMessage: `Searching the web for "${query}"` };
  }

  public async invoke(
    options: vscode.LanguageModelToolInvocationOptions<WebSearchToolInput>,
    _token: vscode.CancellationToken
  ): Promise<vscode.LanguageModelToolResult> {
    const query = resolveWebSearchQuery(options.input);
    if (!query) {
      throw new Error('A search query is required.');
    }
    const data = await runWebSearch(query, (url, init) => fetch(url, init));
    return new vscode.LanguageModelToolResult([
      new vscode.LanguageModelTextPart(formatSearchResults(query, data))
    ]);
  }
}

export function registerWebSearchTool(): vscode.Disposable | undefined {
  if (!vscode.lm?.registerTool) {
    return undefined;
  }
  return vscode.lm.registerTool(WEB_SEARCH_TOOL_NAME, new WebSearchTool());
}
