import * as assert from 'assert';
import {
  MAX_TERMINAL_OUTPUT_CHARS,
  resolveTerminalCommand,
  TERMINAL_TIMEOUT_MS,
  TERMINAL_TOOL_NAME
} from '../../terminal';

suite('terminal', () => {
  test('resolves plain commands', () => {
    assert.strictEqual(resolveTerminalCommand({ command: 'dir' }), 'dir');
    assert.strictEqual(resolveTerminalCommand({ command: '  systeminfo  ' }), 'systeminfo');
  });

  test('rejects missing, blank and non-string commands', () => {
    assert.strictEqual(resolveTerminalCommand({}), undefined);
    assert.strictEqual(resolveTerminalCommand({ command: '' }), undefined);
    assert.strictEqual(resolveTerminalCommand({ command: '   ' }), undefined);
    assert.strictEqual(resolveTerminalCommand({ command: 42 }), undefined);
    assert.strictEqual(resolveTerminalCommand(null), undefined);
    assert.strictEqual(resolveTerminalCommand('dir'), undefined);
  });

  test('execution constants are defined', () => {
    assert.strictEqual(TERMINAL_TOOL_NAME, 'froggyRunTerminal');
    assert.strictEqual(TERMINAL_TIMEOUT_MS, 60_000);
    assert.strictEqual(MAX_TERMINAL_OUTPUT_CHARS, 20_000);
  });
});
