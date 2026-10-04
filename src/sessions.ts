import type { ActionLogEntry } from './actionLog';

/** One tool run attached to an assistant message, replayed as history. */
export interface ChatToolRun {
  tool: string;
  input: unknown;
  output?: string;
  decision: ActionLogEntry['decision'];
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  text: string;
  /** Past tool runs (assistant messages only), replayed so actions are not redone. */
  toolRuns?: ChatToolRun[];
}

/** Result text sent to the model when the user declines a tool call. */
export function declinedToolResultText(toolName: string): string {
  return (
    `The user declined to run the "${toolName}" tool. ` +
    `Do not retry it; continue without it or ask the user.`
  );
}

export interface ReplayToolCall {
  callId: string;
  tool: string;
  input: object;
  resultText: string;
}

export type ReplayItem =
  | { kind: 'user'; text: string }
  | { kind: 'assistant'; text: string }
  | { kind: 'toolRound'; calls: ReplayToolCall[] };

function replayResultText(run: ChatToolRun): string {
  if (run.decision === 'declined') {
    return declinedToolResultText(run.tool);
  }
  return run.output ?? '(no output)';
}

/**
 * Expand stored messages into replay items: an assistant message carrying
 * past tool runs expands to a tool round (calls + results, as in the live
 * loop) followed by the final text — so the model sees what it already did
 * instead of redoing previous turns' actions on every new question.
 */
export function toReplayItems(messages: ChatMessage[]): ReplayItem[] {
  const items: ReplayItem[] = [];
  messages.forEach((message, index) => {
    if (message.role === 'assistant' && message.toolRuns && message.toolRuns.length > 0) {
      items.push({
        kind: 'toolRound',
        calls: message.toolRuns.map((run, runIndex) => ({
          callId: `hist-${index}-${runIndex}`,
          tool: run.tool,
          input: typeof run.input === 'object' && run.input !== null ? run.input : {},
          resultText: replayResultText(run)
        }))
      });
    }
    if (message.role === 'assistant') {
      items.push({ kind: 'assistant', text: message.text });
    } else {
      items.push({ kind: 'user', text: message.text });
    }
  });
  return items;
}

export interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
  /** Set while the session sits in the Archive node; absent on old records. */
  archived?: boolean;
}

export const NEW_SESSION_TITLE = 'New discussion';

/** Fixed id and title of the special main chat session. */
export const MAIN_SESSION_ID = 'main';
export const MAIN_SESSION_TITLE = 'Main chat';

/** Tree item context values driving the Sessions view menus. */
export const SESSION_CONTEXT_VALUE = 'session';
export const ARCHIVED_SESSION_CONTEXT_VALUE = 'archivedSession';

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

export function createMainSession(now: number): ChatSession {
  return { id: MAIN_SESSION_ID, title: MAIN_SESSION_TITLE, messages: [], createdAt: now, updatedAt: now };
}

export function isMainSession(session: ChatSession): boolean {
  return session.id === MAIN_SESSION_ID;
}

/** Whether the session sits in the Archive node (old records lack the flag). */
export function isArchived(session: ChatSession): boolean {
  return session.archived === true;
}

/** Flag a session as archived/live, keeping its messages and timestamps. */
export function withArchived(session: ChatSession, archived: boolean): ChatSession {
  return { ...session, archived };
}

/** Live sessions, most recently updated first, main chat excluded. */
export function liveSessions(sessions: readonly ChatSession[]): ChatSession[] {
  return [...sessions]
    .filter((s) => !isMainSession(s) && !isArchived(s))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

/** Archived sessions, most recently updated first, main chat excluded. */
export function archivedSessions(sessions: readonly ChatSession[]): ChatSession[] {
  return [...sessions]
    .filter((s) => !isMainSession(s) && isArchived(s))
    .sort((a, b) => b.updatedAt - a.updatedAt);
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

/** Empty a session's transcript (Clear): title resets, except for main chat. */
export function clearedSession(session: ChatSession, now: number): ChatSession {
  return {
    ...session,
    title: isMainSession(session) ? session.title : NEW_SESSION_TITLE,
    messages: [],
    updatedAt: now
  };
}
