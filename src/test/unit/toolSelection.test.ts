import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import {
  CONFIRM_SETTING_DEFAULT,
  CONFIRM_SETTING_KEY,
  describeToolCall,
  dropSupersededTerminalTools,
  needsConfirmation,
  resolveAgentTools,
  summarizeToolInput,
  TOOL_SETTING_DEFAULT,
  TOOL_SETTING_KEY
} from '../../toolSelection';

interface ToolsSettingDef {
  default: unknown;
}

function readSetting(key: string): ToolsSettingDef | undefined {
  const file = path.join(__dirname, '..', '..', '..', 'package.json');
  const pkg = JSON.parse(fs.readFileSync(file, 'utf8')) as {
    contributes?: { configuration?: { properties?: Record<string, ToolsSettingDef> } };
  };
  return pkg.contributes?.configuration?.properties?.[`poc-vscode-addin.${key}`];
}

function readToolsSetting(): ToolsSettingDef | undefined {
  return readSetting(TOOL_SETTING_KEY);
}

const AVAILABLE = [
  { name: 'pocDateTime' },
  { name: 'open_browser_page' },
  { name: 'read_page' },
  { name: 'vscode_askQuestions' },
  { name: 'run_in_terminal' }
];

suite('toolSelection', () => {
  test('passes builtins first, then extras in setting order', () => {
    const picked = resolveAgentTools(AVAILABLE, ['pocDateTime'], ['read_page', 'open_browser_page']);
    assert.deepStrictEqual(
      picked.map((tool) => tool.name),
      ['pocDateTime', 'read_page', 'open_browser_page']
    );
  });

  test('skips unknown tools and de-duplicates', () => {
    const picked = resolveAgentTools(
      AVAILABLE,
      ['pocDateTime'],
      ['nope', 'read_page', 'pocDateTime', 'read_page']
    );
    assert.deepStrictEqual(
      picked.map((tool) => tool.name),
      ['pocDateTime', 'read_page']
    );
  });

  test('empty extras keeps builtins only', () => {
    const picked = resolveAgentTools(AVAILABLE, ['pocDateTime'], []);
    assert.deepStrictEqual(
      picked.map((tool) => tool.name),
      ['pocDateTime']
    );
  });

  test('matching is case-sensitive on tool names', () => {
    const picked = resolveAgentTools(AVAILABLE, [], ['Read_Page']);
    assert.deepStrictEqual(picked, []);
  });

  test('needsConfirmation matches listed tools exactly', () => {
    const list = ['pocRunTerminal', 'run_in_terminal', 'pocRunSkill'];
    assert.strictEqual(needsConfirmation('pocRunTerminal', list), true);
    assert.strictEqual(needsConfirmation('run_in_terminal', list), true);
    assert.strictEqual(needsConfirmation('pocRunSkill', list), true);
    assert.strictEqual(needsConfirmation('read_page', list), false);
    assert.strictEqual(needsConfirmation('Run_In_Terminal', list), false);
    assert.strictEqual(needsConfirmation('run_in_terminal', []), false);
  });

  test('describeToolCall shows the command plus its explanation', () => {
    assert.deepStrictEqual(
      describeToolCall('pocRunTerminal', { command: 'dir', explanation: 'List files' }, 300),
      { title: 'Run this command?', detail: 'dir\nList files' }
    );
    assert.deepStrictEqual(
      describeToolCall('run_in_terminal', { command: 'dir' }, 300),
      { title: 'Run this command?', detail: 'dir' }
    );
  });

  test('describeToolCall shows the skill and its arguments', () => {
    assert.deepStrictEqual(
      describeToolCall('pocRunSkill', { skill: 'count-words', args: ['data/a.md'] }, 300),
      { title: 'Run the "count-words" skill?', detail: 'Skill: count-words\nArguments: data/a.md' }
    );
    const list = describeToolCall('pocRunSkill', { skill: '' }, 300);
    assert.strictEqual(list.title, 'List the runnable skills?');
  });

  test('describeToolCall shows the new skill and its task', () => {
    assert.deepStrictEqual(
      describeToolCall('pocCreateSkill', { skill: 'summarize', task: 'Summarize a file' }, 300),
      { title: 'Create the "summarize" skill?', detail: 'Skill: summarize\nTask: Summarize a file' }
    );
    const unnamed = describeToolCall('pocCreateSkill', { task: 'Summarize a file' }, 300);
    assert.strictEqual(unnamed.title, 'Create a new skill?');
    assert.strictEqual(unnamed.detail, 'Task: Summarize a file');
  });

  test('describeToolCall falls back to the tool name with a JSON summary', () => {
    assert.deepStrictEqual(
      describeToolCall('mysteryTool', { a: 1 }, 300),
      { title: 'Run "mysteryTool"?', detail: '{"a":1}' }
    );
    const noCommand = describeToolCall('pocRunTerminal', { command: '' }, 300);
    assert.strictEqual(noCommand.title, 'Run "pocRunTerminal"?');
  });

  test('describeToolCall truncates long details with a marker', () => {
    const description = describeToolCall('pocRunTerminal', { command: 'x'.repeat(500) }, 50);
    assert.ok(description.detail.includes('…(truncated)'));
    assert.ok(description.detail.length <= 50 + '…(truncated)'.length + 1);
  });

  test('dropSupersededTerminalTools drops externals when the builtin is resolved', () => {
    const picked = dropSupersededTerminalTools(
      [{ name: 'pocRunTerminal' }, { name: 'run_in_terminal' }, { name: 'pocDateTime' }],
      'pocRunTerminal'
    );
    assert.deepStrictEqual(
      picked.map((tool) => tool.name),
      ['pocRunTerminal', 'pocDateTime']
    );
  });

  test('dropSupersededTerminalTools keeps everything without the builtin', () => {
    const picked = dropSupersededTerminalTools(
      [{ name: 'run_in_terminal' }, { name: 'pocDateTime' }],
      'pocRunTerminal'
    );
    assert.deepStrictEqual(
      picked.map((tool) => tool.name),
      ['run_in_terminal', 'pocDateTime']
    );
  });

  test('summarizeToolInput renders short input as JSON', () => {
    assert.strictEqual(summarizeToolInput({ command: 'dir' }, 300), '{"command":"dir"}');
    assert.strictEqual(summarizeToolInput({}, 300), '{}');
  });

  test('summarizeToolInput truncates long input with a marker', () => {
    const summary = summarizeToolInput({ command: 'x'.repeat(500) }, 50);
    assert.ok(summary.length <= 50 + '…(truncated)'.length + 1);
    assert.ok(summary.includes('…(truncated)'));
  });

  test('summarizeToolInput survives unserializable input', () => {
    const circular: { self?: unknown } = {};
    circular.self = circular;
    assert.strictEqual(typeof summarizeToolInput(circular, 300), 'string');
  });

  test('package.json contributes the tools setting with a builtins-only default', () => {
    assert.strictEqual(TOOL_SETTING_KEY, 'tools');
    assert.deepStrictEqual(readToolsSetting()?.default, [...TOOL_SETTING_DEFAULT]);
    assert.deepStrictEqual([...TOOL_SETTING_DEFAULT], []);
  });

  test('package.json contributes the confirmTools setting default', () => {
    assert.strictEqual(CONFIRM_SETTING_KEY, 'confirmTools');
    assert.deepStrictEqual(readSetting(CONFIRM_SETTING_KEY)?.default, [...CONFIRM_SETTING_DEFAULT]);
    assert.deepStrictEqual([...CONFIRM_SETTING_DEFAULT], [
      'pocRunTerminal',
      'run_in_terminal',
      'send_to_terminal',
      'pocRunSkill',
      'pocCreateSkill'
    ]);
  });
});
