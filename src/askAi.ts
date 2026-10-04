import type { AskedQuestion } from './askQuestions';

export interface AskAiTranscriptMessage {
  role: 'user' | 'assistant';
  text: string;
}

export type AskAiAskMessage = { command: 'ask'; prompt: string; sessionId: string };

export type AskAiConfirmResultMessage = { command: 'confirmResult'; id: string; approved: boolean };

export type AskAiAnswerResultMessage = {
  command: 'answerResult';
  id: string;
  answers: { id: string; value: string }[] | null;
};

export type AskAiOpenActionLogMessage = { command: 'openActionLog'; sessionId: string };

export type AskAiStopMessage = { command: 'stop'; sessionId: string };

export type AskAiWebviewMessage =
  | AskAiAskMessage
  | { command: 'openLink'; url: string }
  | AskAiConfirmResultMessage
  | AskAiAnswerResultMessage
  | AskAiOpenActionLogMessage
  | AskAiStopMessage;

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

export function isOpenActionLogMessage(value: unknown): value is AskAiOpenActionLogMessage {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const msg = value as { command?: unknown; sessionId?: unknown };
  return (
    msg.command === 'openActionLog' &&
    typeof msg.sessionId === 'string' &&
    msg.sessionId.length > 0
  );
}

export function isStopMessage(value: unknown): value is AskAiStopMessage {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const msg = value as { command?: unknown; sessionId?: unknown };
  return (
    msg.command === 'stop' && typeof msg.sessionId === 'string' && msg.sessionId.length > 0
  );
}

export function isConfirmResultMessage(value: unknown): value is AskAiConfirmResultMessage {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const msg = value as { command?: unknown; id?: unknown; approved?: unknown };
  return (
    msg.command === 'confirmResult' &&
    typeof msg.id === 'string' &&
    msg.id.length > 0 &&
    typeof msg.approved === 'boolean'
  );
}

export function isAnswerResultMessage(value: unknown): value is AskAiAnswerResultMessage {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const msg = value as { command?: unknown; id?: unknown; answers?: unknown };
  if (
    msg.command !== 'answerResult' ||
    typeof msg.id !== 'string' ||
    msg.id.length === 0
  ) {
    return false;
  }
  if (msg.answers === null) {
    return true;
  }
  if (!Array.isArray(msg.answers)) {
    return false;
  }
  return msg.answers.every((answer) => {
    if (typeof answer !== 'object' || answer === null) {
      return false;
    }
    const item = answer as { id?: unknown; value?: unknown };
    return typeof item.id === 'string' && typeof item.value === 'string';
  });
}

export type AskAiExtensionMessage =
  | {
      command: 'transcript';
      sessionId: string;
      messages: AskAiTranscriptMessage[];
      busy: boolean;
    }
  | { command: 'model'; sessionId: string; name: string }
  | { command: 'confirm'; sessionId: string; id: string; title: string; detail: string }
  | { command: 'question'; sessionId: string; id: string; questions: AskedQuestion[] }
  | { command: 'actionLog'; sessionId: string }
  | { command: 'status'; sessionId: string; text: string }
  | { command: 'chunk'; sessionId: string; text: string }
  | { command: 'done'; sessionId: string }
  | { command: 'error'; sessionId?: string; message: string };
