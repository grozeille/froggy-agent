import * as vscode from 'vscode';
import { createSession, type ChatSession } from './sessions';

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

  /** Most recently updated first. */
  public list(): ChatSession[] {
    return [...this._sessions].sort((a, b) => b.updatedAt - a.updatedAt);
  }

  public get(id: string): ChatSession | undefined {
    return this._sessions.find((s) => s.id === id);
  }

  public async create(): Promise<ChatSession> {
    // Drop untouched sessions so the list never fills with empty entries.
    this._sessions = this._sessions.filter((s) => s.messages.length > 0);
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

  private async _persist(): Promise<void> {
    await this._memento.update(STORAGE_KEY, this._sessions);
    this._emitter.fire();
  }
}

function newSessionId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}
