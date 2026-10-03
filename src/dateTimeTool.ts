import * as vscode from 'vscode';
import { DATE_TIME_TOOL_NAME, describeDateTime } from './dateTime';

export class DateTimeTool implements vscode.LanguageModelTool<object> {
  public async prepareInvocation(
    _options: vscode.LanguageModelToolInvocationPrepareOptions<object>,
    _token: vscode.CancellationToken
  ): Promise<vscode.PreparedToolInvocation> {
    return { invocationMessage: 'Reading the current date and time' };
  }

  public async invoke(
    _options: vscode.LanguageModelToolInvocationOptions<object>,
    _token: vscode.CancellationToken
  ): Promise<vscode.LanguageModelToolResult> {
    return new vscode.LanguageModelToolResult([
      new vscode.LanguageModelTextPart(`Current date and time: ${describeDateTime(new Date())}`)
    ]);
  }
}

export function registerDateTimeTool(): vscode.Disposable | undefined {
  if (!vscode.lm?.registerTool) {
    return undefined;
  }
  return vscode.lm.registerTool(DATE_TIME_TOOL_NAME, new DateTimeTool());
}
