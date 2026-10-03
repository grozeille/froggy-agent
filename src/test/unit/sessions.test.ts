import * as assert from 'assert';
import {
  createSession,
  MAX_HISTORY_MESSAGES,
  NEW_SESSION_TITLE,
  recentMessages,
  titleFromPrompt,
  withMessage
} from '../../sessions';

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
});
