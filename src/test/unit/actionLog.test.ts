import * as assert from 'assert';
import {
  appendActionLog,
  formatActionLog,
  stripAnsi,
  type ActionLogEntry
} from '../../actionLog';

function entry(overrides: Partial<ActionLogEntry> = {}): ActionLogEntry {
  return {
    at: 1700000000000,
    tool: 'run_in_terminal',
    input: '{"command":"dir"}',
    decision: 'approved',
    output: 'file1.txt\nfile2.txt',
    ...overrides
  };
}

suite('actionLog', () => {
  test('stripAnsi removes color codes only', () => {
    assert.strictEqual(stripAnsi('\u001B[32mgreen\u001B[0m plain'), 'green plain');
    assert.strictEqual(stripAnsi('\u001B[1;31mbold red\u001B[0m'), 'bold red');
    assert.strictEqual(stripAnsi('no codes here'), 'no codes here');
  });

  test('formatActionLog renders each run with decision and output', () => {
    const text = formatActionLog([
      entry(),
      entry({ tool: 'pocRunSkill', decision: 'declined', output: undefined })
    ]);
    assert.match(text, /run_in_terminal/);
    assert.match(text, /\{"command":"dir"\}/);
    assert.match(text, /approved/);
    assert.match(text, /file1\.txt/);
    assert.match(text, /pocRunSkill/);
    assert.match(text, /declined/);
  });

  test('formatActionLog renders recorded commands', () => {
    const text = formatActionLog([entry({ commands: ['python run.py', 'pip install -r req'] })]);
    assert.match(text, /commands:/);
    assert.match(text, /python run\.py/);
    assert.match(text, /pip install/);
    assert.ok(!formatActionLog([entry({ commands: undefined })]).includes('commands:'));
  });

  test('formatActionLog explains an empty log', () => {
    assert.match(formatActionLog([]), /No tool actions recorded/);
  });

  test('appendActionLog keeps only the newest entries', () => {
    let log: ActionLogEntry[] = [];
    for (let i = 0; i < 5; i++) {
      log = appendActionLog(log, entry({ input: `{"n":${i}}` }), 3);
    }
    assert.strictEqual(log.length, 3);
    assert.deepStrictEqual(
      log.map((item) => item.input),
      ['{"n":2}', '{"n":3}', '{"n":4}']
    );
  });
});
