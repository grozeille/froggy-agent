import { exec } from 'child_process';
import { promisify } from 'util';
import * as vscode from 'vscode';
import { truncateOutput } from './skillRun';
import {
  MAX_TERMINAL_OUTPUT_CHARS,
  resolveTerminalCommand,
  TERMINAL_TIMEOUT_MS,
  TERMINAL_TOOL_NAME,
  type TerminalToolInput
} from './terminal';

const execAsync = promisify(exec);

/** Runs a shell command from the workspace root and returns its output. */
export class TerminalTool implements vscode.LanguageModelTool<TerminalToolInput> {
  public async prepareInvocation(
    options: vscode.LanguageModelToolInvocationPrepareOptions<TerminalToolInput>,
    _token: vscode.CancellationToken
  ): Promise<vscode.PreparedToolInvocation> {
    // No confirmationMessages on purpose: the Ask AI panel shows its own
    // in-chat confirmation card. Returning confirmationMessages here would
    // add VS Code's native popup on top of it (double prompt).
    const command = options.input.command?.trim() || '(no command)';
    const short = command.length > 80 ? `${command.slice(0, 80)}…` : command;
    return { invocationMessage: `Running "${short}"` };
  }

  public async invoke(
    options: vscode.LanguageModelToolInvocationOptions<TerminalToolInput>,
    _token: vscode.CancellationToken
  ): Promise<vscode.LanguageModelToolResult> {
    const root = vscode.workspace.workspaceFolders?.[0]?.uri;
    if (!root) {
      throw new Error('No workspace folder is open.');
    }
    const command = resolveTerminalCommand(options.input);
    if (!command) {
      throw new Error('No command to run.');
    }
    return new vscode.LanguageModelToolResult([
      new vscode.LanguageModelTextPart(await this._run(root.fsPath, command))
    ]);
  }

  private async _run(cwd: string, command: string): Promise<string> {
    let stdout: string;
    let stderr: string;
    try {
      ({ stdout, stderr } = await execAsync(command, {
        cwd,
        timeout: TERMINAL_TIMEOUT_MS,
        maxBuffer: 1024 * 1024,
        windowsHide: true
      }));
    } catch (err) {
      const code = (err as { code?: unknown }).code;
      const out = (err as { stdout?: unknown }).stdout;
      const errText = (err as { stderr?: unknown }).stderr;
      if (code === 'ENOENT') {
        throw new Error('Shell was not found. The command could not be started.');
      }
      if (code === 'ETIMEDOUT') {
        throw new Error(`Command timed out after ${TERMINAL_TIMEOUT_MS / 1000}s.`);
      }
      const detail = [out, errText]
        .filter((text): text is string => typeof text === 'string' && text.trim().length > 0)
        .join('\n');
      throw new Error(
        `Command failed (exit ${String(code)}).${detail ? `\n${truncateOutput(detail, 2000)}` : ''}`
      );
    }
    const output = stdout.trim() ? stdout : '(no output)';
    const warnings = stderr.trim() ? `\n[stderr]\n${stderr.trim()}` : '';
    return truncateOutput(`${output.trim()}${warnings}`, MAX_TERMINAL_OUTPUT_CHARS);
  }
}

export function registerTerminalTool(): vscode.Disposable | undefined {
  if (!vscode.lm?.registerTool) {
    return undefined;
  }
  return vscode.lm.registerTool(TERMINAL_TOOL_NAME, new TerminalTool());
}
