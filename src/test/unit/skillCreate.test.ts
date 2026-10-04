import * as assert from 'assert';
import {
  BUILDER_END_MARKER,
  CREATE_SKILL_TOOL_NAME,
  MAX_SKILL_FILE_CHARS,
  MAX_SKILL_TASK_CHARS,
  REQUIREMENTS_MARKER,
  RUN_PY_MARKER,
  SKILL_MD_MARKER,
  SKILL_MD_NAME,
  buildSkillBuilderPrompt,
  ensureSkillMdFrontmatter,
  formatCreateSkillHint,
  formatCreatedSkillSummary,
  parseBuilderOutput,
  resolveNewSkillName,
  resolveTask,
  skillDescriptionFromTask,
  suggestSkillName,
  validateBuiltSkillFiles
} from '../../skillCreate';

function builderAnswer(skillMd: string, script: string, requirements?: string): string {
  const req =
    requirements === undefined ? "" : `${REQUIREMENTS_MARKER}\n${requirements}\n`;
  return `${SKILL_MD_MARKER}\n${skillMd}\n${RUN_PY_MARKER}\n${script}\n${req}${BUILDER_END_MARKER}\n`;
}

suite('skillCreate', () => {
  test('resolves plain new skill names, lowercased', () => {
    assert.strictEqual(resolveNewSkillName('count-words'), 'count-words');
    assert.strictEqual(resolveNewSkillName('  Summarize2  '), 'summarize2');
  });

  test('rejects bad new skill names', () => {
    for (const bad of [
      '',
      '   ',
      '.',
      '..',
      'a/b',
      'a\\b',
      '/abs',
      'C:\\x',
      'has space',
      '-lead',
      'trail-',
      'under_score',
      'x'.repeat(65)
    ]) {
      assert.strictEqual(resolveNewSkillName(bad), undefined, JSON.stringify(bad));
    }
  });

  test('suggests a valid name from the task', () => {
    assert.strictEqual(suggestSkillName('Count words in a file!'), 'count-words-in-a-file');
    assert.strictEqual(suggestSkillName('!!!'), 'new-skill');
    assert.strictEqual(suggestSkillName(''), 'new-skill');
    const long = suggestSkillName(
      'Summarize every data file in this workspace into three bullet points each'
    );
    assert.ok(long.length <= 32, 'caps the slug');
    for (const task of ['Count words!', '!!!', '', '  3D plots?? ', 'a'.repeat(200)]) {
      const suggested = suggestSkillName(task);
      assert.strictEqual(resolveNewSkillName(suggested), suggested, task);
    }
  });

  test('resolveTask trims, caps and rejects blank tasks', () => {
    assert.strictEqual(resolveTask({ task: '  hello  ' }), 'hello');
    const capped = resolveTask({ task: 'x'.repeat(MAX_SKILL_TASK_CHARS + 50) });
    assert.strictEqual(capped?.length, MAX_SKILL_TASK_CHARS);
    assert.strictEqual(resolveTask({ task: '   ' }), undefined);
    assert.strictEqual(resolveTask({}), undefined);
    assert.strictEqual(resolveTask(null), undefined);
    assert.strictEqual(resolveTask('nope'), undefined);
  });

  test('builder prompt names the skill, task, files and markers', () => {
    const prompt = buildSkillBuilderPrompt('count words', 'count-words');
    assert.ok(prompt.includes('"count-words"'), 'names the skill');
    assert.ok(prompt.includes('count words'), 'names the task');
    assert.ok(prompt.includes('SKILL.md'), 'requires SKILL.md');
    assert.ok(prompt.includes('run.py'), 'requires run.py');
    assert.ok(prompt.includes('standard library'), 'restricts dependencies');
    assert.ok(prompt.includes('workspace root'), 'fixes the working directory');
    assert.ok(prompt.includes('description:'), 'requires frontmatter');
    assert.ok(
      prompt.includes('always implement in Python'),
      'overrides non-Python implementations named by the task'
    );
    assert.ok(prompt.includes('requirements.txt'), 'allows declared third-party packages');
    assert.ok(prompt.includes(REQUIREMENTS_MARKER), 'shows the requirements marker');
    assert.ok(prompt.includes('non-interactively'), 'warns scripts run without stdin');
    assert.ok(prompt.includes('never use input()'), 'forbids interactive prompts');
    assert.ok(prompt.includes(SKILL_MD_MARKER), 'shows the SKILL.md marker');
    assert.ok(prompt.includes(RUN_PY_MARKER), 'shows the run.py marker');
    assert.ok(prompt.includes(BUILDER_END_MARKER), 'shows the end marker');
  });

  test('parses the builder answer into two files', () => {
    assert.deepStrictEqual(parseBuilderOutput(builderAnswer('# T\n', 'print(1)\n')), {
      skillMd: '# T',
      script: 'print(1)'
    });
  });

  test('tolerates prose around the markers', () => {
    const files = parseBuilderOutput(`Sure, here it is:\n${builderAnswer('# T', 'print(1)')}Done!`);
    assert.deepStrictEqual(files, { skillMd: '# T', script: 'print(1)' });
  });

  test('parses the optional requirements section', () => {
    const files = parseBuilderOutput(builderAnswer('# T', 'print(1)', 'requests==2.32.3\n'));
    assert.deepStrictEqual(files, {
      skillMd: '# T',
      script: 'print(1)',
      requirements: 'requests==2.32.3'
    });
    assert.strictEqual(
      parseBuilderOutput(builderAnswer('# T', 'print(1)', '   \n'))?.requirements,
      undefined
    );
  });

  test('rejects answers with missing, swapped or empty sections', () => {
    assert.strictEqual(parseBuilderOutput('no markers here'), undefined);
    assert.strictEqual(parseBuilderOutput(`${SKILL_MD_MARKER}\n# T\n`), undefined);
    assert.strictEqual(
      parseBuilderOutput(`${RUN_PY_MARKER}\nprint(1)\n${SKILL_MD_MARKER}\n# T\n`),
      undefined
    );
    assert.strictEqual(parseBuilderOutput(builderAnswer('   ', 'print(1)')), undefined);
    assert.strictEqual(parseBuilderOutput(builderAnswer('# T', '   ')), undefined);
  });

  test('keeps builder frontmatter, generates it when missing', () => {
    const withFront = '---\nname: x\ndescription: Y.\n---\n\n# X\n';
    assert.strictEqual(ensureSkillMdFrontmatter(withFront, 'x', 'Z.'), withFront);
    const generated = ensureSkillMdFrontmatter('# New Skill\n', 'new-skill', 'Does things.');
    assert.ok(
      generated.startsWith('---\nname: new-skill\ndescription: Does things.\n---\n\n'),
      'prepends a frontmatter block'
    );
    assert.ok(generated.includes('# New Skill'), 'keeps the body');
    const multiline = ensureSkillMdFrontmatter('# T\n', 't', 'line one\nline two');
    assert.ok(multiline.includes('description: line one line two\n'), 'flattens to one line');
  });

  test('derives a one-line description from the task', () => {
    assert.strictEqual(skillDescriptionFromTask('Count words. Then more.'), 'Count words');
    assert.strictEqual(
      skillDescriptionFromTask('   '),
      'Workspace skill built by the skill factory.'
    );
    assert.ok(skillDescriptionFromTask('x'.repeat(500)).length <= 141, 'caps the length');
    assert.ok(!skillDescriptionFromTask('a  b\nc').includes('\n'), 'stays on one line');
  });

  test('validates the built files', () => {
    assert.strictEqual(
      validateBuiltSkillFiles({ skillMd: '# T', script: 'print(1)' }),
      undefined
    );
    assert.match(
      validateBuiltSkillFiles({ skillMd: '  ', script: 'print(1)' }) ?? '',
      /SKILL\.md/
    );
    assert.match(validateBuiltSkillFiles({ skillMd: '# T', script: '' }) ?? '', /run\.py/);
    assert.match(
      validateBuiltSkillFiles({ skillMd: '# T', script: 'print(1)', requirements: '' }) ?? '',
      /requirements/
    );
    assert.match(
      validateBuiltSkillFiles({ skillMd: 'x'.repeat(MAX_SKILL_FILE_CHARS + 1), script: 'ok' }) ??
        '',
      /over/
    );
    assert.match(
      validateBuiltSkillFiles({
        skillMd: '# T',
        script: 'print(1)',
        requirements: 'x'.repeat(MAX_SKILL_FILE_CHARS + 1)
      }) ?? '',
      /over/
    );
  });

  test('create-skill hint names the tool and claims creation requests', () => {
    const hint = formatCreateSkillHint('pocCreateSkill');
    assert.ok(hint.includes('"pocCreateSkill"'), 'names the tool');
    assert.match(hint, /create/);
    assert.match(hint, /automate/);
    assert.match(hint, /instead of writing/);
    assert.ok(hint.includes('Python'), 'says the factory builds Python');
    assert.match(hint, /never an implementation/);
  });

  test('summary names the skill, description and runner', () => {
    const summary = formatCreatedSkillSummary('count-words', 'Count words.', 'pocRunSkill');
    assert.ok(summary.includes('"count-words"'), 'names the skill');
    assert.ok(summary.includes('.github/skills/count-words/'), 'shows the folder');
    assert.ok(summary.includes('Count words.'), 'shows the description');
    assert.ok(summary.includes('"pocRunSkill"'), 'names the runner');
    assert.ok(summary.includes('syntax-checked'), 'mentions the check');
  });

  test('summary appends the environment note when given', () => {
    const summary = formatCreatedSkillSummary('x', 'Y.', 'pocRunSkill', ' Created the venv.');
    assert.ok(summary.endsWith(' Created the venv.'), 'appends the note');
    assert.ok(
      !formatCreatedSkillSummary('x', 'Y.', 'pocRunSkill').includes('.venv'),
      'stays silent without a note'
    );
  });

  test('summary names requirements.txt when present', () => {
    const summary = formatCreatedSkillSummary('x', 'Y.', 'pocRunSkill', '', true);
    assert.ok(summary.includes('requirements.txt'), 'names requirements.txt');
    assert.ok(
      !formatCreatedSkillSummary('x', 'Y.', 'pocRunSkill').includes('requirements.txt'),
      'omits it otherwise'
    );
  });

  test('tool and file names match the package.json contribution', () => {
    assert.strictEqual(CREATE_SKILL_TOOL_NAME, 'pocCreateSkill');
    assert.strictEqual(SKILL_MD_NAME, 'SKILL.md');
    assert.strictEqual(REQUIREMENTS_MARKER, '---REQUIREMENTS.TXT---');
  });
});
