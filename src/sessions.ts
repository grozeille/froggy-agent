export interface ChatMessage {
  role: 'user' | 'assistant';
  text: string;
}

export interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
}

export const NEW_SESSION_TITLE = 'New discussion';

/** How many recent messages are sent back to the model for context. */
export const MAX_HISTORY_MESSAGES = 20;

export function recentMessages(session: ChatSession, limit: number): ChatMessage[] {
  if (limit <= 0) {
    return [];
  }
  return session.messages.slice(-limit);
}

export function createSession(id: string, now: number): ChatSession {
  return { id, title: NEW_SESSION_TITLE, messages: [], createdAt: now, updatedAt: now };
}

/** Derive a short title from the first question: first line, max 40 chars. */
export function titleFromPrompt(prompt: string): string {
  const firstLine = prompt.split(/\r?\n/, 1)[0]?.trim() ?? '';
  if (!firstLine) {
    return NEW_SESSION_TITLE;
  }
  const max = 40;
  return firstLine.length > max ? `${firstLine.slice(0, max).trimEnd()}…` : firstLine;
}

export function withMessage(session: ChatSession, message: ChatMessage, now: number): ChatSession {
  return { ...session, messages: [...session.messages, message], updatedAt: now };
}
