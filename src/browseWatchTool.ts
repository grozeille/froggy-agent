import * as vscode from 'vscode';
import {
  BROWSE_OPEN_TOOL_NAME,
  BROWSE_SCREENSHOT_TOOL_NAME,
  BROWSE_STATE_TOOL_NAME,
  formatBrowseState,
  resolveBrowseOpenUrl,
  type BrowseOpenToolInput
} from './browseWatch';
import {
  captureWatchedScreenshot,
  openWatchedPage,
  readWatchedState
} from './browseWatchDriver';

/** Navigates the watched external browser to a page. */
export class BrowseOpenTool implements vscode.LanguageModelTool<BrowseOpenToolInput> {
  public async prepareInvocation(
    options: vscode.LanguageModelToolInvocationPrepareOptions<BrowseOpenToolInput>,
    _token: vscode.CancellationToken
  ): Promise<vscode.PreparedToolInvocation> {
    const url = options.input.url?.trim() ?? '';
    return { invocationMessage: `Opening ${url || 'page'} in the watched browser` };
  }

  public async invoke(
    options: vscode.LanguageModelToolInvocationOptions<BrowseOpenToolInput>,
    _token: vscode.CancellationToken
  ): Promise<vscode.LanguageModelToolResult> {
    const url = resolveBrowseOpenUrl(options.input);
    if (!url) {
      throw new Error('A valid http(s) URL is required.');
    }
    const opened = await openWatchedPage(url);
    return new vscode.LanguageModelToolResult([
      new vscode.LanguageModelTextPart(`Opened ${opened.url} in the watched browser (${opened.browser}).`)
    ]);
  }
}

/** Reads the watched browser's current URL, title, text and console errors. */
export class BrowseStateTool implements vscode.LanguageModelTool<object> {
  public async prepareInvocation(
    _options: vscode.LanguageModelToolInvocationPrepareOptions<object>,
    _token: vscode.CancellationToken
  ): Promise<vscode.PreparedToolInvocation> {
    return { invocationMessage: 'Reading the watched browser' };
  }

  public async invoke(
    _options: vscode.LanguageModelToolInvocationOptions<object>,
    _token: vscode.CancellationToken
  ): Promise<vscode.LanguageModelToolResult> {
    const state = await readWatchedState();
    return new vscode.LanguageModelToolResult([
      new vscode.LanguageModelTextPart(formatBrowseState(state))
    ]);
  }
}

/** Captures the watched page as a PNG image for a vision-capable model. */
export class BrowseScreenshotTool implements vscode.LanguageModelTool<object> {
  public async prepareInvocation(
    _options: vscode.LanguageModelToolInvocationPrepareOptions<object>,
    _token: vscode.CancellationToken
  ): Promise<vscode.PreparedToolInvocation> {
    return { invocationMessage: 'Capturing the watched browser' };
  }

  public async invoke(
    _options: vscode.LanguageModelToolInvocationOptions<object>,
    _token: vscode.CancellationToken
  ): Promise<vscode.LanguageModelToolResult> {
    const shot = await captureWatchedScreenshot();
    const caption = shot.title
      ? `Screenshot of ${shot.url} (${shot.title}).`
      : `Screenshot of ${shot.url}.`;
    return new vscode.LanguageModelToolResult([
      new vscode.LanguageModelTextPart(caption),
      vscode.LanguageModelDataPart.image(shot.data, 'image/png')
    ]);
  }
}

export function registerBrowseWatchTools(): vscode.Disposable[] {
  if (!vscode.lm?.registerTool) {
    return [];
  }
  return [
    vscode.lm.registerTool(BROWSE_OPEN_TOOL_NAME, new BrowseOpenTool()),
    vscode.lm.registerTool(BROWSE_STATE_TOOL_NAME, new BrowseStateTool()),
    vscode.lm.registerTool(BROWSE_SCREENSHOT_TOOL_NAME, new BrowseScreenshotTool())
  ];
}
