import * as vscode from 'vscode';
import {
  archivedSessions,
  clearedSession,
  createMainSession,
  createSession,
  isArchived,
  isMainSession,
  liveSessions,
  withArchived,
  type ChatSession
} from './sessions';

const STORAGE_KEY = 'froggy.sessions.v1';

export class SessionStore implements vscode.Disposable {
  private _sessions: ChatSession[] = [];
  private readonly _emitter = new vscode.EventEmitter<void>();
  public readonly onDidChange = this._emitter.event;

  constructor(private readonly _memento: vscode.Memento) {
    this._sessions = _memento.get<ChatSession[]>(STORAGE_KEY, []);
  }

  public dispose(): void {
    this._emitter.dispose();
  }

  /** Live sessions: most recently updated first, main chat and archived excluded. */
  public list(): ChatSession[] {
    return liveSessions(this._sessions);
  }

  /** Archived sessions, most recently updated first, main chat excluded. */
  public listArchived(): ChatSession[] {
    return archivedSessions(this._sessions);
  }

  public get(id: string): ChatSession | undefined {
    return this._sessions.find((s) => s.id === id);
  }

  public async getOrCreateMain(): Promise<ChatSession> {
    const existing = this._sessions.find((s) => isMainSession(s));
    if (existing) {
      return existing;
    }
    const main = createMainSession(Date.now());
    this._sessions.push(main);
    await this._persist();
    return main;
  }

  public async create(): Promise<ChatSession> {
    // Drop untouched sessions so the list never fills with empty entries.
    // The main chat is special: it is never listed and never dropped.
    // Archived sessions are kept even when empty: archiving is explicit.
    this._sessions = this._sessions.filter(
      (s) => s.messages.length > 0 || isMainSession(s) || isArchived(s)
    );
    const session = createSession(newSessionId(), Date.now());
    this._sessions.push(session);
    await this._persist();
    return session;
  }

  /** Move a session to the archive; unknown ids and the main chat are ignored. */
  public async archive(id: string): Promise<void> {
    const session = this.get(id);
    if (!session || isMainSession(session)) {
      return;
    }
    await this.save(withArchived(session, true));
  }

  /** Move an archived session back to the live list; unknown ids are ignored. */
  public async restore(id: string): Promise<void> {
    const session = this.get(id);
    if (!session) {
      return;
    }
    await this.save(withArchived(session, false));
  }

  public async save(session: ChatSession): Promise<void> {
    const index = this._sessions.findIndex((s) => s.id === session.id);
    if (index >= 0) {
      this._sessions[index] = session;
    } else {
      this._sessions.push(session);
    }
    await this._persist();
  }

  public async remove(id: string): Promise<void> {
    this._sessions = this._sessions.filter((s) => s.id !== id);
    await this._persist();
  }

  /** Empty a session's transcript; resolves undefined when the id is unknown. */
  public async clear(id: string): Promise<ChatSession | undefined> {
    const session = this.get(id);
    if (!session) {
      return undefined;
    }
    const cleared = clearedSession(session, Date.now());
    await this.save(cleared);
    return cleared;
  }

  private async _persist(): Promise<void> {
    await this._memento.update(STORAGE_KEY, this._sessions);
    this._emitter.fire();
  }
}

function newSessionId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}
