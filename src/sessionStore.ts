import * as vscode from 'vscode';
import {
  clearedSession,
  createMainSession,
  createSession,
  isMainSession,
  type ChatSession
} from './sessions';

const STORAGE_KEY = 'poc.sessions.v1';

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

  /** Most recently updated first, excluding the special main chat session. */
  public list(): ChatSession[] {
    return [...this._sessions]
      .filter((s) => !isMainSession(s))
      .sort((a, b) => b.updatedAt - a.updatedAt);
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
    this._sessions = this._sessions.filter((s) => s.messages.length > 0 || isMainSession(s));
    const session = createSession(newSessionId(), Date.now());
    this._sessions.push(session);
    await this._persist();
    return session;
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
