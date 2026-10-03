export interface AskAiTranscriptMessage {
  role: 'user' | 'assistant';
  text: string;
}

export type AskAiAskMessage = { command: 'ask'; prompt: string; sessionId: string };

export type AskAiWebviewMessage = AskAiAskMessage | { command: 'openLink'; url: string };

export function isAskAiMessage(value: unknown): value is AskAiAskMessage {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const msg = value as { command?: unknown; prompt?: unknown; sessionId?: unknown };
  return (
    msg.command === 'ask' &&
    typeof msg.prompt === 'string' &&
    msg.prompt.trim().length > 0 &&
    typeof msg.sessionId === 'string' &&
    msg.sessionId.length > 0
  );
}

export function isOpenLinkMessage(value: unknown): value is { command: 'openLink'; url: string } {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const msg = value as { command?: unknown; url?: unknown };
  return msg.command === 'openLink' && typeof msg.url === 'string' && msg.url.length > 0;
}

export type AskAiExtensionMessage =
  | { command: 'status'; sessionId: string; text: string }
  | { command: 'chunk'; sessionId: string; text: string }
  | { command: 'transcript'; sessionId: string; messages: AskAiTranscriptMessage[] }
  | { command: 'done'; sessionId: string }
  | { command: 'error'; sessionId?: string; message: string };
