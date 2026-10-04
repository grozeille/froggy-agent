import * as assert from 'assert';
import { agentEnvironmentPreamble, historyGroundingHint, terminalToolHint } from '../../agentEnv';

suite('agentEnv', () => {
  test('tells the model Windows with Windows-only commands', () => {
    const preamble = agentEnvironmentPreamble('win32');
    assert.match(preamble, /Windows/);
    assert.match(preamble, /Never use Linux/);
  });

  test('tells the model Linux or macOS otherwise', () => {
    assert.match(agentEnvironmentPreamble('linux'), /Linux/);
    assert.match(agentEnvironmentPreamble('darwin'), /macOS/);
  });

  test('defaults to the current platform', () => {
    assert.strictEqual(typeof agentEnvironmentPreamble(), 'string');
    assert.ok(agentEnvironmentPreamble().length > 0);
  });

  test('terminalToolHint names the offered terminal tool', () => {
    const hint = terminalToolHint(['pocDateTime', 'run_in_terminal']);
    assert.ok(hint.includes('run_in_terminal'), 'names the tool');
    assert.match(hint, /instead of answering from knowledge/);
  });

  test('terminalToolHint prefers the builtin over run_in_terminal', () => {
    const hint = terminalToolHint(['run_in_terminal', 'pocRunTerminal']);
    assert.ok(hint.includes('pocRunTerminal'), 'names the builtin');
    assert.ok(!hint.includes('run_in_terminal'), 'skips the external tool');
  });

  test('terminalToolHint stays silent without a terminal tool', () => {
    assert.strictEqual(terminalToolHint(['pocDateTime']), '');
    assert.strictEqual(terminalToolHint([]), '');
  });

  test('historyGroundingHint tells the model not to redo completed actions', () => {
    const hint = historyGroundingHint();
    assert.match(hint, /do not repeat/);
    assert.match(hint, /latest user message/);
  });
});
