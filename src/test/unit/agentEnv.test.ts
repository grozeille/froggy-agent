import * as assert from 'assert';
import { agentEnvironmentPreamble, clarificationHint, historyGroundingHint, terminalToolHint, webSearchHint } from '../../agentEnv';

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
    const hint = terminalToolHint(['froggyDateTime', 'run_in_terminal']);
    assert.ok(hint.includes('run_in_terminal'), 'names the tool');
    assert.match(hint, /instead of answering from knowledge/);
  });

  test('terminalToolHint prefers the builtin over run_in_terminal', () => {
    const hint = terminalToolHint(['run_in_terminal', 'froggyRunTerminal']);
    assert.ok(hint.includes('froggyRunTerminal'), 'names the builtin');
    assert.ok(!hint.includes('run_in_terminal'), 'skips the external tool');
  });

  test('terminalToolHint stays silent without a terminal tool', () => {
    assert.strictEqual(terminalToolHint(['froggyDateTime']), '');
    assert.strictEqual(terminalToolHint([]), '');
  });

  test('historyGroundingHint tells the model not to redo completed actions', () => {
    const hint = historyGroundingHint();
    assert.match(hint, /do not repeat/);
    assert.match(hint, /latest user message/);
  });

  test('clarificationHint asks one question instead of guessing', () => {
    const hint = clarificationHint();
    assert.match(hint, /clarifying question/);
    assert.match(hint, /instead of/);
    assert.match(hint, /guessing/);
  });

  test('webSearchHint names the search and fetch tools when offered', () => {
    const hint = webSearchHint(['froggyDateTime', 'froggyWebSearch', 'froggyFetchWebPage']);
    assert.ok(hint.includes('froggyWebSearch'), 'names the search tool');
    assert.ok(hint.includes('froggyFetchWebPage'), 'names the fetch tool');
    assert.match(hint, /using internet/);
    assert.match(hint, /instead of answering from knowledge/);
  });

  test('webSearchHint skips the fetch tool when not offered', () => {
    const hint = webSearchHint(['froggyWebSearch']);
    assert.ok(hint.includes('froggyWebSearch'), 'names the search tool');
    assert.ok(!hint.includes('froggyFetchWebPage'), 'skips the fetch tool');
  });

  test('webSearchHint stays silent without the search tool', () => {
    assert.strictEqual(webSearchHint(['froggyDateTime']), '');
    assert.strictEqual(webSearchHint(['froggyFetchWebPage']), '');
    assert.strictEqual(webSearchHint([]), '');
  });
});
