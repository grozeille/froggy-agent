import * as vscode from 'vscode';
import {
  APPEND_MEMORY_TOOL_NAME,
  formatMemoryContent,
  MAX_MEMORY_BYTES,
  MAX_MEMORY_NOTE_CHARS,
  MEMORY_PATH,
  READ_MEMORY_TOOL_NAME,
  resolveMemoryNote,
  type AppendMemoryToolInput
} from './memory';

function memoryUri(): vscode.Uri | undefined {
  const root = vscode.workspace.workspaceFolders?.[0]?.uri;
  return root ? vscode.Uri.joinPath(root, MEMORY_PATH) : undefined;
}

async function readMemoryFile(uri: vscode.Uri): Promise<string | undefined> {
  try {
    return new TextDecoder('utf-8').decode(await vscode.workspace.fs.readFile(uri));
  } catch {
    return undefined;
  }
}

/** Reads the workspace memory.md file (facts the user asked to remember). */
export class ReadMemoryTool implements vscode.LanguageModelTool<object> {
  public async prepareInvocation(
    _options: vscode.LanguageModelToolInvocationPrepareOptions<object>,
    _token: vscode.CancellationToken
  ): Promise<vscode.PreparedToolInvocation> {
    return { invocationMessage: 'Reading memory' };
  }

  public async invoke(
    _options: vscode.LanguageModelToolInvocationOptions<object>,
    _token: vscode.CancellationToken
  ): Promise<vscode.LanguageModelToolResult> {
    const uri = memoryUri();
    if (!uri) {
      throw new Error('No workspace folder is open.');
    }
    const text = await readMemoryFile(uri);
    if (text === undefined) {
      return new vscode.LanguageModelToolResult([
        new vscode.LanguageModelTextPart(`Memory file (${MEMORY_PATH}):\n(empty — nothing memorized yet)`)
      ]);
    }
    if (text.includes('\0')) {
      throw new Error(`Memory file "${MEMORY_PATH}" appears to be binary.`);
    }
    const bytes = Buffer.byteLength(text, 'utf-8');
    if (bytes > MAX_MEMORY_BYTES) {
      throw new Error(
        `Memory file "${MEMORY_PATH}" is too large (${bytes} bytes, limit ${MAX_MEMORY_BYTES}).`
      );
    }
    return new vscode.LanguageModelToolResult([
      new vscode.LanguageModelTextPart(`Memory file (${MEMORY_PATH}):\n${formatMemoryContent(text)}`)
    ]);
  }
}

/** Appends one short fact to the workspace memory.md file. */
export class AppendMemoryTool implements vscode.LanguageModelTool<AppendMemoryToolInput> {
  public async prepareInvocation(
    options: vscode.LanguageModelToolInvocationPrepareOptions<AppendMemoryToolInput>,
    _token: vscode.CancellationToken
  ): Promise<vscode.PreparedToolInvocation> {
    const note = options.input.note?.trim() ?? '';
    const short = note.length > 80 ? `${note.slice(0, 80)}…` : note;
    return { invocationMessage: `Memorizing "${short || '(no note)'}"` };
  }

  public async invoke(
    options: vscode.LanguageModelToolInvocationOptions<AppendMemoryToolInput>,
    _token: vscode.CancellationToken
  ): Promise<vscode.LanguageModelToolResult> {
    const uri = memoryUri();
    if (!uri) {
      throw new Error('No workspace folder is open.');
    }
    const note = resolveMemoryNote(options.input);
    if (!note) {
      throw new Error('A note is required.');
    }
    if (note.length > MAX_MEMORY_NOTE_CHARS) {
      throw new Error(
        `Note is too long (${note.length} chars, limit ${MAX_MEMORY_NOTE_CHARS}). Keep it to one short fact.`
      );
    }
    const existing = (await readMemoryFile(uri)) ?? '# Memory\n\n';
    const separator = existing.length > 0 && !existing.endsWith('\n') ? '\n' : '';
    const next = `${existing}${separator}${note}\n`;
    if (Buffer.byteLength(next, 'utf-8') > MAX_MEMORY_BYTES) {
      throw new Error(
        `Memory file "${MEMORY_PATH}" is full (limit ${MAX_MEMORY_BYTES} bytes). Ask the user what to forget.`
      );
    }
    await vscode.workspace.fs.writeFile(uri, new TextEncoder().encode(next));
    return new vscode.LanguageModelToolResult([
      new vscode.LanguageModelTextPart(`Noted in ${MEMORY_PATH}: "${note}"`)
    ]);
  }
}

export function registerMemoryTools(): vscode.Disposable[] {
  if (!vscode.lm?.registerTool) {
    return [];
  }
  return [
    vscode.lm.registerTool(READ_MEMORY_TOOL_NAME, new ReadMemoryTool()),
    vscode.lm.registerTool(APPEND_MEMORY_TOOL_NAME, new AppendMemoryTool())
  ];
}
