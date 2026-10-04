import * as assert from 'assert';
import {
  formatCommandLine,
  formatSkillList,
  formatSkillsHint,
  MAX_SKILL_OUTPUT_CHARS,
  REQUIREMENTS_FILE_NAME,
  resolveSkillName,
  RUN_SKILL_TOOL_NAME,
  SKILL_SCRIPT_NAME,
  SKILL_TIMEOUT_MS,
  recordRunCommand,
  takeRunCommands,
  truncateOutput,
  venvPythonPath
} from '../../skillRun';

suite('skillRun', () => {
  test('resolves plain skill names', () => {
    assert.strictEqual(resolveSkillName('count-words'), 'count-words');
    assert.strictEqual(resolveSkillName('  demo  '), 'demo');
  });

  test('rejects empty, nested and escaping names', () => {
    assert.strictEqual(resolveSkillName(''), undefined);
    assert.strictEqual(resolveSkillName('   '), undefined);
    assert.strictEqual(resolveSkillName('.'), undefined);
    assert.strictEqual(resolveSkillName('..'), undefined);
    assert.strictEqual(resolveSkillName('../x'), undefined);
    assert.strictEqual(resolveSkillName('a/b'), undefined);
    assert.strictEqual(resolveSkillName('a\\b'), undefined);
    assert.strictEqual(resolveSkillName('/abs'), undefined);
    assert.strictEqual(resolveSkillName('C:\\x'), undefined);
  });

  test('truncates long output with a marker', () => {
    assert.strictEqual(truncateOutput('short', 100), 'short');
    assert.strictEqual(truncateOutput('exact', 5), 'exact');
    const long = truncateOutput('a'.repeat(100), 10);
    assert.ok(long.startsWith('a'.repeat(10)), 'keeps the head');
    assert.ok(long.includes('truncated'), 'marks truncation');
  });

  test('formats the runnable skill list', () => {
    assert.strictEqual(
      formatSkillList([
        { name: 'count-words', title: 'Count Words', description: '' },
        { name: 'demo', title: '', description: '' }
      ]),
      'count-words — Count Words\ndemo'
    );
    assert.strictEqual(formatSkillList([]), '(none)');
  });

  test('appends skill descriptions to the list', () => {
    assert.strictEqual(
      formatSkillList([
        { name: 'count-words', title: 'Count Words', description: 'Count words of a file.' },
        { name: 'demo', title: '', description: 'Does things.' }
      ]),
      'count-words — Count Words: Count words of a file.\ndemo: Does things.'
    );
  });

  test('formatSkillsHint lists skills and claims precedence over the terminal', () => {
    const hint = formatSkillsHint(
      [{ name: 'count-words', title: 'Count Words', description: 'Count words of a file.' }],
      'pocRunSkill'
    );
    assert.ok(hint.includes('count-words'), 'names the skill');
    assert.ok(hint.includes('Count words of a file.'), 'includes the description');
    assert.ok(hint.includes('"pocRunSkill"'), 'names the tool');
    assert.match(hint, /instead of using the terminal/);
  });

  test('formatSkillsHint stays silent without runnable skills', () => {
    assert.strictEqual(formatSkillsHint([], 'pocRunSkill'), '');
  });

  test('prefers the project-local .venv interpreter', () => {
    assert.strictEqual(
      venvPythonPath('C:\\work\\demo', 'win32'),
      'C:\\work\\demo\\.venv\\Scripts\\python.exe'
    );
    assert.strictEqual(venvPythonPath('/work/demo', 'linux'), '/work/demo/.venv/bin/python');
  });

  test('execution constants are defined', () => {
    assert.strictEqual(RUN_SKILL_TOOL_NAME, 'pocRunSkill');
    assert.strictEqual(SKILL_SCRIPT_NAME, 'run.py');
    assert.strictEqual(REQUIREMENTS_FILE_NAME, 'requirements.txt');
    assert.strictEqual(SKILL_TIMEOUT_MS, 60_000);
    assert.strictEqual(MAX_SKILL_OUTPUT_CHARS, 20_000);
  });

  test('formatCommandLine quotes parts with whitespace or quotes', () => {
    assert.strictEqual(
      formatCommandLine('python', ['run.py', 'data/a.md']),
      'python run.py data/a.md'
    );
    assert.strictEqual(
      formatCommandLine('C:/My Tools/python.exe', ['C:/my dir/run.py', 'a b']),
      '"C:/My Tools/python.exe" "C:/my dir/run.py" "a b"'
    );
    assert.strictEqual(formatCommandLine('python', ['say "hi"']), 'python "say ""hi"""');
    assert.strictEqual(formatCommandLine('python', []), 'python');
  });

  test('takeRunCommands drains recorded commands in order', () => {
    assert.deepStrictEqual(takeRunCommands(), []);
    recordRunCommand('first');
    recordRunCommand('second');
    assert.deepStrictEqual(takeRunCommands(), ['first', 'second']);
    assert.deepStrictEqual(takeRunCommands(), []);
  });
});
