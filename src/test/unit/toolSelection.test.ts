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
  TOOL_SETTING_KEY,
  formatToolRunning,
  formatToolStillRunning,
  toolRunLabel
} from '../../toolSelection';

interface ToolsSettingDef {
  default: unknown;
}

function readSetting(key: string): ToolsSettingDef | undefined {
  const file = path.join(__dirname, '..', '..', '..', 'package.json');
  const pkg = JSON.parse(fs.readFileSync(file, 'utf8')) as {
    contributes?: { configuration?: { properties?: Record<string, ToolsSettingDef> } };
  };
  return pkg.contributes?.configuration?.properties?.[`froggy-agent.${key}`];
}

function readToolsSetting(): ToolsSettingDef | undefined {
  return readSetting(TOOL_SETTING_KEY);
}

const AVAILABLE = [
  { name: 'froggyDateTime' },
  { name: 'open_browser_page' },
  { name: 'read_page' },
  { name: 'vscode_askQuestions' },
  { name: 'run_in_terminal' }
];

suite('toolSelection', () => {
  test('passes builtins first, then extras in setting order', () => {
    const picked = resolveAgentTools(AVAILABLE, ['froggyDateTime'], ['read_page', 'open_browser_page']);
    assert.deepStrictEqual(
      picked.map((tool) => tool.name),
      ['froggyDateTime', 'read_page', 'open_browser_page']
    );
  });

  test('skips unknown tools and de-duplicates', () => {
    const picked = resolveAgentTools(
      AVAILABLE,
      ['froggyDateTime'],
      ['nope', 'read_page', 'froggyDateTime', 'read_page']
    );
    assert.deepStrictEqual(
      picked.map((tool) => tool.name),
      ['froggyDateTime', 'read_page']
    );
  });

  test('empty extras keeps builtins only', () => {
    const picked = resolveAgentTools(AVAILABLE, ['froggyDateTime'], []);
    assert.deepStrictEqual(
      picked.map((tool) => tool.name),
      ['froggyDateTime']
    );
  });

  test('matching is case-sensitive on tool names', () => {
    const picked = resolveAgentTools(AVAILABLE, [], ['Read_Page']);
    assert.deepStrictEqual(picked, []);
  });

  test('needsConfirmation matches listed tools exactly', () => {
    const list = ['froggyRunTerminal', 'run_in_terminal', 'froggyRunSkill'];
    assert.strictEqual(needsConfirmation('froggyRunTerminal', list), true);
    assert.strictEqual(needsConfirmation('run_in_terminal', list), true);
    assert.strictEqual(needsConfirmation('froggyRunSkill', list), true);
    assert.strictEqual(needsConfirmation('read_page', list), false);
    assert.strictEqual(needsConfirmation('Run_In_Terminal', list), false);
    assert.strictEqual(needsConfirmation('run_in_terminal', []), false);
  });

  test('describeToolCall shows the command plus its explanation', () => {
    assert.deepStrictEqual(
      describeToolCall('froggyRunTerminal', { command: 'dir', explanation: 'List files' }, 300),
      { title: 'Run this command?', detail: 'dir\nList files' }
    );
    assert.deepStrictEqual(
      describeToolCall('run_in_terminal', { command: 'dir' }, 300),
      { title: 'Run this command?', detail: 'dir' }
    );
  });

  test('describeToolCall shows the skill and its arguments', () => {
    assert.deepStrictEqual(
      describeToolCall('froggyRunSkill', { skill: 'count-words', args: ['data/a.md'] }, 300),
      { title: 'Run the "count-words" skill?', detail: 'Skill: count-words\nArguments: data/a.md' }
    );
    const list = describeToolCall('froggyRunSkill', { skill: '' }, 300);
    assert.strictEqual(list.title, 'List the runnable skills?');
  });

  test('describeToolCall shows the new skill and its task', () => {
    assert.deepStrictEqual(
      describeToolCall('froggyCreateSkill', { skill: 'summarize', task: 'Summarize a file' }, 300),
      { title: 'Create the "summarize" skill?', detail: 'Skill: summarize\nTask: Summarize a file' }
    );
    const unnamed = describeToolCall('froggyCreateSkill', { task: 'Summarize a file' }, 300);
    assert.strictEqual(unnamed.title, 'Create a new skill?');
    assert.strictEqual(unnamed.detail, 'Task: Summarize a file');
  });

  test('describeToolCall falls back to the tool name with a JSON summary', () => {
    assert.deepStrictEqual(
      describeToolCall('mysteryTool', { a: 1 }, 300),
      { title: 'Run "mysteryTool"?', detail: '{"a":1}' }
    );
    const noCommand = describeToolCall('froggyRunTerminal', { command: '' }, 300);
    assert.strictEqual(noCommand.title, 'Run "froggyRunTerminal"?');
  });

  test('describeToolCall truncates long details with a marker', () => {
    const description = describeToolCall('froggyRunTerminal', { command: 'x'.repeat(500) }, 50);
    assert.ok(description.detail.includes('…(truncated)'));
    assert.ok(description.detail.length <= 50 + '…(truncated)'.length + 1);
  });

  test('dropSupersededTerminalTools drops externals when the builtin is resolved', () => {
    const picked = dropSupersededTerminalTools(
      [{ name: 'froggyRunTerminal' }, { name: 'run_in_terminal' }, { name: 'froggyDateTime' }],
      'froggyRunTerminal'
    );
    assert.deepStrictEqual(
      picked.map((tool) => tool.name),
      ['froggyRunTerminal', 'froggyDateTime']
    );
  });

  test('dropSupersededTerminalTools keeps everything without the builtin', () => {
    const picked = dropSupersededTerminalTools(
      [{ name: 'run_in_terminal' }, { name: 'froggyDateTime' }],
      'froggyRunTerminal'
    );
    assert.deepStrictEqual(
      picked.map((tool) => tool.name),
      ['run_in_terminal', 'froggyDateTime']
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

  test('toolRunLabel names builtin runs in plain words', () => {
    assert.strictEqual(toolRunLabel('froggyCreateSkill'), 'Building the skill');
    assert.strictEqual(toolRunLabel('froggyRunSkill'), 'Running the skill');
    assert.strictEqual(toolRunLabel('froggyRunTerminal'), 'Running the command');
    assert.strictEqual(toolRunLabel('run_in_terminal'), 'Running the command');
    assert.strictEqual(toolRunLabel('froggyBrowseState'), 'Reading the watched browser');
    assert.strictEqual(toolRunLabel('froggyWebSearch'), 'Searching the web');
    assert.strictEqual(toolRunLabel('froggyDateTime'), 'Reading the date');
  });

  test('toolRunLabel falls back to the raw name for external tools', () => {
    assert.strictEqual(toolRunLabel('mysteryTool'), 'Running mysteryTool');
  });

  test('tool running status shows the start and the still-running heartbeat', () => {
    assert.strictEqual(formatToolRunning('Building the skill'), 'Building the skill…');
    assert.strictEqual(
      formatToolStillRunning('Building the skill', 15000),
      'Still building the skill… (15s)'
    );
    assert.strictEqual(
      formatToolStillRunning('Running the command', 1499),
      'Still running the command… (1s)'
    );
    assert.strictEqual(
      formatToolStillRunning('Running the command', -5),
      'Still running the command… (0s)'
    );
  });

  test('package.json contributes the confirmTools setting default', () => {
    assert.strictEqual(CONFIRM_SETTING_KEY, 'confirmTools');
    assert.deepStrictEqual(readSetting(CONFIRM_SETTING_KEY)?.default, [...CONFIRM_SETTING_DEFAULT]);
    assert.deepStrictEqual([...CONFIRM_SETTING_DEFAULT], [
      'froggyRunTerminal',
      'run_in_terminal',
      'send_to_terminal',
      'froggyRunSkill',
      'froggyCreateSkill'
    ]);
  });
});
