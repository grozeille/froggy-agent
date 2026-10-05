import * as assert from 'assert';
import {
  ARCHIVED_SESSION_CONTEXT_VALUE,
  archivedSessions,
  clearedSession,
  createMainSession,
  createSession,
  declinedToolResultText,
  isArchived,
  isMainSession,
  liveSessions,
  MAIN_SESSION_ID,
  MAIN_SESSION_TITLE,
  MAX_HISTORY_MESSAGES,
  NEW_SESSION_TITLE,
  recentMessages,
  renamedSession,
  SESSION_CONTEXT_VALUE,
  titleFromPrompt,
  toReplayItems,
  validateSessionTitle,
  withArchived,
  withMessage,
  type ChatSession
} from '../../sessions';
import { ARCHIVE_CONTEXT_VALUE } from '../../archive';

suite('sessions', () => {
  test('createSession starts untitled and empty', () => {
    const session = createSession('abc', 1000);
    assert.strictEqual(session.id, 'abc');
    assert.strictEqual(session.title, NEW_SESSION_TITLE);
    assert.deepStrictEqual(session.messages, []);
    assert.strictEqual(session.createdAt, 1000);
    assert.strictEqual(session.updatedAt, 1000);
  });

  test('titleFromPrompt uses the first line', () => {
    assert.strictEqual(titleFromPrompt('How do I test this?'), 'How do I test this?');
    assert.strictEqual(titleFromPrompt('First line\nsecond line'), 'First line');
    assert.strictEqual(titleFromPrompt('  padded  '), 'padded');
  });

  test('titleFromPrompt truncates long prompts', () => {
    const long = 'a'.repeat(100);
    assert.strictEqual(titleFromPrompt(long), `${'a'.repeat(40)}…`);
  });

  test('titleFromPrompt falls back for blank input', () => {
    assert.strictEqual(titleFromPrompt(''), NEW_SESSION_TITLE);
    assert.strictEqual(titleFromPrompt('   '), NEW_SESSION_TITLE);
  });

  test('withMessage appends without mutating', () => {
    const before = createSession('abc', 1000);
    const after = withMessage(before, { role: 'user', text: 'hi' }, 2000);
    assert.strictEqual(before.messages.length, 0);
    assert.strictEqual(after.messages.length, 1);
    assert.deepStrictEqual(after.messages[0], { role: 'user', text: 'hi' });
    assert.strictEqual(after.updatedAt, 2000);
    assert.strictEqual(after.createdAt, 1000);
  });

  test('recentMessages returns everything under the limit', () => {
    let session = createSession('abc', 1000);
    session = withMessage(session, { role: 'user', text: 'one' }, 1001);
    session = withMessage(session, { role: 'assistant', text: 'two' }, 1002);
    const recent = recentMessages(session, 20);
    assert.deepStrictEqual(
      recent.map((message) => message.text),
      ['one', 'two']
    );
  });

  test('recentMessages keeps only the last N messages', () => {
    let session = createSession('abc', 1000);
    for (let i = 0; i < 5; i++) {
      session = withMessage(session, { role: 'user', text: `m${i}` }, 1000 + i);
    }
    const recent = recentMessages(session, 2);
    assert.deepStrictEqual(
      recent.map((message) => message.text),
      ['m3', 'm4']
    );
  });

  test('recentMessages handles empty sessions and bad limits', () => {
    const session = createSession('abc', 1000);
    assert.deepStrictEqual(recentMessages(session, 20), []);
    assert.deepStrictEqual(recentMessages(session, 0), []);
  });

  test('history budget is defined', () => {
    assert.strictEqual(MAX_HISTORY_MESSAGES, 20);
  });

  test('createMainSession uses the fixed main id and title', () => {
    const session = createMainSession(1000);
    assert.strictEqual(session.id, MAIN_SESSION_ID);
    assert.strictEqual(session.id, 'main');
    assert.strictEqual(session.title, MAIN_SESSION_TITLE);
    assert.strictEqual(session.title, 'Main chat');
    assert.deepStrictEqual(session.messages, []);
    assert.strictEqual(session.createdAt, 1000);
    assert.strictEqual(session.updatedAt, 1000);
  });

  test('isMainSession only matches the main session', () => {
    assert.strictEqual(isMainSession(createMainSession(1000)), true);
    assert.strictEqual(isMainSession(createSession('abc', 1000)), false);
  });

  test('declinedToolResultText names the tool and tells the model to move on', () => {
    const text = declinedToolResultText('froggyRunSkill');
    assert.ok(text.includes('froggyRunSkill'));
    assert.match(text, /Do not retry it/);
  });

  test('toReplayItems passes plain messages through', () => {
    assert.deepStrictEqual(
      toReplayItems([
        { role: 'user', text: 'hi' },
        { role: 'assistant', text: 'hello' }
      ]),
      [
        { kind: 'user', text: 'hi' },
        { kind: 'assistant', text: 'hello' }
      ]
    );
  });

  test('toReplayItems expands past tool runs before the final text', () => {
    const items = toReplayItems([
      { role: 'user', text: 'list files' },
      {
        role: 'assistant',
        text: 'here they are',
        toolRuns: [
          { tool: 'froggyListDataFiles', input: {}, output: 'a.md', decision: 'auto' },
          { tool: 'froggyRunSkill', input: { skill: '' }, decision: 'declined' }
        ]
      }
    ]);
    assert.strictEqual(items.length, 3);
    assert.deepStrictEqual(items[0], { kind: 'user', text: 'list files' });
    const round = items[1];
    assert.strictEqual(round.kind, 'toolRound');
    if (round.kind === 'toolRound') {
      assert.strictEqual(round.calls.length, 2);
      assert.strictEqual(round.calls[0].callId, 'hist-1-0');
      assert.strictEqual(round.calls[0].tool, 'froggyListDataFiles');
      assert.deepStrictEqual(round.calls[0].input, {});
      assert.strictEqual(round.calls[0].resultText, 'a.md');
      assert.strictEqual(round.calls[1].callId, 'hist-1-1');
      assert.match(round.calls[1].resultText, /declined to run the "froggyRunSkill" tool/);
    }
    assert.deepStrictEqual(items[2], { kind: 'assistant', text: 'here they are' });
  });

  test('toReplayItems normalizes bad input and missing output', () => {
    const items = toReplayItems([
      {
        role: 'assistant',
        text: '',
        toolRuns: [
          { tool: 'froggyRunTerminal', input: 'dir', decision: 'auto' },
          { tool: 'froggyDateTime', input: null, output: 'now', decision: 'auto' }
        ]
      }
    ]);
    assert.strictEqual(items.length, 2);
    const round = items[0];
    assert.strictEqual(round.kind, 'toolRound');
    if (round.kind === 'toolRound') {
      assert.deepStrictEqual(round.calls[0].input, {});
      assert.strictEqual(round.calls[0].resultText, '(no output)');
      assert.deepStrictEqual(round.calls[1].input, {});
      assert.strictEqual(round.calls[1].resultText, 'now');
    }
  });

  test('toReplayItems skips the tool round without runs', () => {
    assert.deepStrictEqual(toReplayItems([{ role: 'assistant', text: 'ok', toolRuns: [] }]), [
      { kind: 'assistant', text: 'ok' }
    ]);
  });

  test('tool runs survive JSON storage round-trip for replay', () => {
    let session = createSession('abc', 1000);
    session = withMessage(session, { role: 'user', text: 'q' }, 1001);
    session = withMessage(
      session,
      {
        role: 'assistant',
        text: 'a',
        toolRuns: [{ tool: 'froggyDateTime', input: {}, output: 'now', decision: 'auto' }]
      },
      1002
    );
    const restored = JSON.parse(JSON.stringify(session)) as ChatSession;
    const kinds = toReplayItems(recentMessages(restored, 20)).map((item) => item.kind);
    assert.deepStrictEqual(kinds, ['user', 'toolRound', 'assistant']);
  });

  test('clearedSession empties messages and resets the title', () => {
    let session = createSession('abc', 1000);
    session = withMessage(session, { role: 'user', text: 'hi' }, 1001);
    const cleared = clearedSession({ ...session, title: 'Old title' }, 2000);
    assert.strictEqual(cleared.id, 'abc');
    assert.deepStrictEqual(cleared.messages, []);
    assert.strictEqual(cleared.title, NEW_SESSION_TITLE);
    assert.strictEqual(cleared.updatedAt, 2000);
    assert.strictEqual(cleared.createdAt, 1000);
  });

  test('isArchived is false when the flag is missing', () => {
    assert.strictEqual(isArchived(createSession('abc', 1000)), false);
    assert.strictEqual(isArchived(createMainSession(1000)), false);
  });

  test('withArchived flags without touching the rest', () => {
    let session = createSession('abc', 1000);
    session = withMessage(session, { role: 'user', text: 'hi' }, 1001);
    const archived = withArchived(session, true);
    assert.strictEqual(session.archived, undefined);
    assert.strictEqual(archived.archived, true);
    assert.strictEqual(isArchived(archived), true);
    assert.strictEqual(isArchived(withArchived(archived, false)), false);
    assert.strictEqual(archived.updatedAt, 1001);
    assert.strictEqual(archived.messages.length, 1);
  });

  test('liveSessions and archivedSessions split, exclude main, newest first', () => {
    const main = createMainSession(1000);
    const old = withMessage(createSession('old', 1000), { role: 'user', text: 'o' }, 1001);
    const mid = withArchived(
      withMessage(createSession('mid', 1000), { role: 'user', text: 'm' }, 1002),
      true
    );
    const fresh = withMessage(createSession('fresh', 1000), { role: 'user', text: 'f' }, 1003);
    const all = [old, main, fresh, mid];
    assert.deepStrictEqual(
      liveSessions(all).map((s) => s.id),
      ['fresh', 'old']
    );
    assert.deepStrictEqual(
      archivedSessions(all).map((s) => s.id),
      ['mid']
    );
  });

  test('session context values are distinct so menus target the right nodes', () => {
    assert.strictEqual(SESSION_CONTEXT_VALUE, 'session');
    assert.strictEqual(ARCHIVED_SESSION_CONTEXT_VALUE, 'archivedSession');
    assert.notStrictEqual(SESSION_CONTEXT_VALUE, ARCHIVED_SESSION_CONTEXT_VALUE);
    assert.notStrictEqual(ARCHIVE_CONTEXT_VALUE, SESSION_CONTEXT_VALUE);
    assert.notStrictEqual(ARCHIVE_CONTEXT_VALUE, ARCHIVED_SESSION_CONTEXT_VALUE);
  });

  test('clearedSession keeps the main chat title', () => {
    let session = createMainSession(1000);
    session = withMessage(session, { role: 'user', text: 'hi' }, 1001);
    const cleared = clearedSession(session, 2000);
    assert.deepStrictEqual(cleared.messages, []);
    assert.strictEqual(cleared.title, MAIN_SESSION_TITLE);
  });

  test('renamedSession retitles without touching the rest', () => {
    let session = createSession('abc', 1000);
    session = withMessage(session, { role: 'user', text: 'hi' }, 1001);
    const before = { ...session, title: 'Old title' };
    const renamed = renamedSession(before, '  New title  ');
    assert.strictEqual(before.title, 'Old title');
    assert.strictEqual(renamed.id, 'abc');
    assert.strictEqual(renamed.title, 'New title');
    assert.strictEqual(renamed.messages.length, 1);
    assert.strictEqual(renamed.createdAt, 1000);
    assert.strictEqual(renamed.updatedAt, 1001);
    assert.strictEqual(renamed.archived, undefined);
  });

  test('validateSessionTitle rejects blank titles', () => {
    assert.strictEqual(validateSessionTitle(''), 'Title cannot be empty.');
    assert.strictEqual(validateSessionTitle('   '), 'Title cannot be empty.');
    assert.strictEqual(validateSessionTitle('ok'), undefined);
  });
});
