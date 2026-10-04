import * as vscode from 'vscode';
import {
  FETCH_PAGE_TOOL_NAME,
  fetchPageText,
  formatFetchedPage,
  resolveFetchPageUrl,
  type FetchPageToolInput
} from './fetchPage';

/** Fetches a web page and returns its readable text for the model to summarize. */
export class FetchPageTool implements vscode.LanguageModelTool<FetchPageToolInput> {
  public async prepareInvocation(
    options: vscode.LanguageModelToolInvocationPrepareOptions<FetchPageToolInput>,
    _token: vscode.CancellationToken
  ): Promise<vscode.PreparedToolInvocation> {
    const url = options.input.url?.trim() ?? '';
    return { invocationMessage: `Reading ${url || 'page'}` };
  }

  public async invoke(
    options: vscode.LanguageModelToolInvocationOptions<FetchPageToolInput>,
    _token: vscode.CancellationToken
  ): Promise<vscode.LanguageModelToolResult> {
    const url = resolveFetchPageUrl(options.input);
    if (!url) {
      throw new Error('A valid public http(s) URL is required.');
    }
    const page = await fetchPageText(url, (target, init) => fetch(target, init));
    return new vscode.LanguageModelToolResult([
      new vscode.LanguageModelTextPart(formatFetchedPage(page))
    ]);
  }
}

export function registerFetchPageTool(): vscode.Disposable | undefined {
  if (!vscode.lm?.registerTool) {
    return undefined;
  }
  return vscode.lm.registerTool(FETCH_PAGE_TOOL_NAME, new FetchPageTool());
}
