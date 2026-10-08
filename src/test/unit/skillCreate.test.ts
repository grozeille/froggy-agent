import * as assert from 'assert';
import {
  BUILDER_END_MARKER,
  CREATE_SKILL_TOOL_NAME,
  MAX_FIX_FAILURE_CHARS,
  MAX_SKILL_BUILD_ATTEMPTS,
  MAX_SKILL_FILE_CHARS,
  MAX_SKILL_TASK_CHARS,
  REQUIREMENTS_MARKER,
  RUN_PY_MARKER,
  SKILL_BUILD_TIMEOUT_MS,
  SKILL_DRY_RUN_ARGS,
  SKILL_MD_MARKER,
  SKILL_MD_NAME,
  buildSkillBuilderPrompt,
  buildSkillFixPrompt,
  ensureSkillMdFrontmatter,
  formatCreateSkillHint,
  formatCreatedSkillSummary,
  parseBuilderOutput,
  resolveNewSkillName,
  resolveTask,
  runSkillBuildLoop,
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

  test('builder prompt requires a side-effect-free --help dry-run', () => {
    const prompt = buildSkillBuilderPrompt('count words', 'count-words');
    assert.ok(prompt.includes('--help'), 'requires --help support');
    assert.ok(prompt.includes('dry-run'), 'announces the dry-run gate');
    assert.ok(prompt.includes('exit 0'), 'requires a zero exit');
    assert.ok(prompt.includes('without side effects'), 'forbids dry-run side effects');
    assert.ok(prompt.includes('data/'), 'keeps task outputs under data/');
    assert.ok(prompt.includes('never create, modify or delete'), 'forbids writes on --help');
  });

  test('fix prompt carries the failure, the previous script and the layout', () => {
    const prompt = buildSkillFixPrompt(
      'count words',
      'count-words',
      { stage: 'dry-run', detail: 'Traceback: boom', previousScript: 'print(1/0)' },
      2,
      3
    );
    assert.ok(prompt.includes('"count-words"'), 'names the skill');
    assert.ok(prompt.includes('count words'), 'names the task');
    assert.ok(prompt.includes('Traceback: boom'), 'carries the failure detail');
    assert.ok(prompt.includes('print(1/0)'), 'carries the previous run.py');
    assert.ok(prompt.includes('dry-run'), 'names the failed stage');
    assert.ok(prompt.includes(SKILL_MD_MARKER), 'shows the SKILL.md marker');
    assert.ok(prompt.includes(RUN_PY_MARKER), 'shows the run.py marker');
    assert.ok(prompt.includes(BUILDER_END_MARKER), 'shows the end marker');
    assert.ok(prompt.includes('attempt 2 of 3'), 'shows the attempt count');
  });

  test('fix prompt omits the previous script when there is none', () => {
    const prompt = buildSkillFixPrompt(
      'count words',
      'count-words',
      { stage: 'parse', detail: 'no markers' },
      2,
      3
    );
    assert.ok(!prompt.includes('Previous run.py'), 'has no previous-script section');
    assert.ok(prompt.includes('no markers'), 'still carries the failure');
  });

  test('fix prompt truncates long failure output', () => {
    const prompt = buildSkillFixPrompt(
      'count words',
      'count-words',
      { stage: 'dry-run', detail: 'x'.repeat(MAX_FIX_FAILURE_CHARS + 500) },
      2,
      3
    );
    assert.ok(prompt.includes('truncated'), 'marks the truncation');
    assert.ok(
      prompt.length < 'x'.repeat(MAX_FIX_FAILURE_CHARS + 500).length + 2000,
      'does not echo the full output'
    );
  });

  test('fix prompt labels every failure stage', () => {
    const labels: Record<string, RegExp> = {
      build: /builder error/,
      parse: /to parse/,
      validate: /validation/,
      syntax: /syntax check/,
      requirements: /requirements install/,
      'dry-run': /dry-run/
    };
    for (const [stage, label] of Object.entries(labels)) {
      const prompt = buildSkillFixPrompt(
        'task',
        'skill',
        { stage: stage as 'build', detail: 'd' },
        2,
        3
      );
      assert.match(prompt, label, stage);
    }
  });

  test('build budgets are deterministic constants', () => {
    assert.strictEqual(MAX_SKILL_BUILD_ATTEMPTS, 3);
    assert.strictEqual(SKILL_BUILD_TIMEOUT_MS, 300_000);
    assert.deepStrictEqual([...SKILL_DRY_RUN_ARGS], ['--help']);
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
    const hint = formatCreateSkillHint('froggyCreateSkill');
    assert.ok(hint.includes('"froggyCreateSkill"'), 'names the tool');
    assert.match(hint, /create/);
    assert.match(hint, /automate/);
    assert.match(hint, /instead of writing/);
    assert.ok(hint.includes('Python'), 'says the factory builds Python');
    assert.match(hint, /never an implementation/);
  });

  test('summary names the skill, description and runner', () => {
    const summary = formatCreatedSkillSummary('count-words', 'Count words.', 'froggyRunSkill');
    assert.ok(summary.includes('"count-words"'), 'names the skill');
    assert.ok(summary.includes('.github/skills/count-words/'), 'shows the folder');
    assert.ok(summary.includes('Count words.'), 'shows the description');
    assert.ok(summary.includes('"froggyRunSkill"'), 'names the runner');
    assert.ok(summary.includes('dry-run passed'), 'mentions the dry-run gate');
  });

  test('summary reports fix iterations past the first attempt', () => {
    assert.ok(
      !formatCreatedSkillSummary('x', 'Y.', 'froggyRunSkill').includes('after '),
      'stays silent on a first-try pass'
    );
    const summary = formatCreatedSkillSummary('x', 'Y.', 'froggyRunSkill', '', false, 3);
    assert.ok(summary.includes('dry-run passed after 3 attempts'), 'counts the attempts');
  });

  test('summary appends the environment note when given', () => {
    const summary = formatCreatedSkillSummary('x', 'Y.', 'froggyRunSkill', ' Created the venv.');
    assert.ok(summary.endsWith(' Created the venv.'), 'appends the note');
    assert.ok(
      !formatCreatedSkillSummary('x', 'Y.', 'froggyRunSkill').includes('.venv'),
      'stays silent without a note'
    );
  });

  test('summary names requirements.txt when present', () => {
    const summary = formatCreatedSkillSummary('x', 'Y.', 'froggyRunSkill', '', true);
    assert.ok(summary.includes('requirements.txt'), 'names requirements.txt');
    assert.ok(
      !formatCreatedSkillSummary('x', 'Y.', 'froggyRunSkill').includes('requirements.txt'),
      'omits it otherwise'
    );
  });

  test('tool and file names match the package.json contribution', () => {
    assert.strictEqual(CREATE_SKILL_TOOL_NAME, 'froggyCreateSkill');
    assert.strictEqual(SKILL_MD_NAME, 'SKILL.md');
    assert.strictEqual(REQUIREMENTS_MARKER, '---REQUIREMENTS.TXT---');
  });

  test('build loop passes a green first attempt straight through', async () => {
    const prompts: string[] = [];
    const result = await runSkillBuildLoop('count words', 'count-words', {
      build: async (prompt) => {
        prompts.push(prompt);
        return builderAnswer('# Count Words\n', 'print("ok")\n');
      },
      dryRun: async () => ({ ok: true })
    });
    assert.strictEqual(result.attempts, 1);
    assert.strictEqual(result.files.script, 'print("ok")');
    assert.strictEqual(prompts.length, 1);
  });

  test('build loop fixes a broken first attempt on retry', async () => {
    const prompts: string[] = [];
    const answers = [
      builderAnswer('# Count Words\n', 'import missing_dep_xyz\nprint("ok")\n'),
      builderAnswer('# Count Words\n', 'print("ok")\n')
    ];
    const result = await runSkillBuildLoop('count words', 'count-words', {
      build: async (prompt, attempt) => {
        prompts.push(prompt);
        return answers[attempt - 1] ?? answers[answers.length - 1];
      },
      dryRun: async (files) =>
        files.script.includes('missing_dep_xyz')
          ? {
              ok: false,
              stage: 'dry-run',
              detail: 'Skill failed (exit 1).\nModuleNotFoundError: No module named \'missing_dep_xyz\''
            }
          : { ok: true }
    });
    assert.strictEqual(result.attempts, 2, 'took one fix iteration');
    assert.strictEqual(result.files.script, 'print("ok")', 'kept the fixed script');
    assert.strictEqual(prompts.length, 2);
    assert.ok(prompts[1].includes('ModuleNotFoundError'), 'fix prompt carries the traceback');
    assert.ok(prompts[1].includes('missing_dep_xyz'), 'fix prompt carries the broken script');
    assert.ok(prompts[1].includes('attempt 2 of 3'), 'fix prompt counts the attempt');
  });

  test('build loop fails cleanly after exhausting the attempts', async () => {
    let builds = 0;
    await assert.rejects(
      runSkillBuildLoop('count words', 'count-words', {
        build: async () => {
          builds += 1;
          return builderAnswer('# T\n', 'print(1/0)\n');
        },
        dryRun: async () => ({
          ok: false,
          stage: 'dry-run',
          detail: 'Skill failed (exit 1).\nZeroDivisionError: division by zero'
        })
      }),
      (err: unknown) => {
        assert.match((err as Error).message, /failed after 3 attempts/);
        assert.match((err as Error).message, /ZeroDivisionError/);
        return true;
      }
    );
    assert.strictEqual(builds, 3, 'spent every attempt');
  });

  test('build loop retries unparseable and empty answers', async () => {
    const answers = ['just some prose, no markers', builderAnswer('# T\n', 'print(1)\n')];
    const result = await runSkillBuildLoop('count words', 'count-words', {
      build: async (_prompt, attempt) => answers[attempt - 1] ?? answers[answers.length - 1],
      dryRun: async () => ({ ok: true })
    });
    assert.strictEqual(result.attempts, 2);
    assert.strictEqual(result.files.script, 'print(1)');
  });

  test('build loop retries builder errors', async () => {
    let builds = 0;
    const prompts: string[] = [];
    const result = await runSkillBuildLoop('count words', 'count-words', {
      build: async (prompt) => {
        prompts.push(prompt);
        builds += 1;
        if (builds === 1) {
          throw new Error('model overloaded');
        }
        return builderAnswer('# T\n', 'print(1)\n');
      },
      dryRun: async () => ({ ok: true })
    });
    assert.strictEqual(result.attempts, 2);
    assert.ok(prompts[1].includes('model overloaded'), 'fix prompt carries the error');
  });

  test('build loop fails immediately on non-retryable dry-run failures', async () => {
    let builds = 0;
    await assert.rejects(
      runSkillBuildLoop('count words', 'count-words', {
        build: async () => {
          builds += 1;
          return builderAnswer('# T\n', 'print(1)\n');
        },
        dryRun: async () => ({
          ok: false,
          stage: 'dry-run',
          detail: 'Python was not found. Install Python 3 on PATH.',
          retryable: false
        })
      }),
      /Python was not found/
    );
    assert.strictEqual(builds, 1, 'spent no fix attempt on the environment');
  });

  test('build loop respects the global timeout', async () => {
    let builds = 0;
    const times = [0, 10_000];
    await assert.rejects(
      runSkillBuildLoop(
        'count words',
        'count-words',
        {
          build: async () => {
            builds += 1;
            return builderAnswer('# T\n', 'print(1)\n');
          },
          dryRun: async () => ({ ok: true }),
          now: () => times.shift() ?? 10_000
        },
        { timeoutMs: 1000 }
      ),
      /timed out after 1s/
    );
    assert.strictEqual(builds, 0, 'started no attempt past the budget');
  });

  test('build loop rethrows cancellations without retrying', async () => {
    const cancelled = new Error('cancelled');
    cancelled.name = 'CancellationError';
    let builds = 0;
    await assert.rejects(
      runSkillBuildLoop('count words', 'count-words', {
        build: async () => {
          builds += 1;
          throw cancelled;
        },
        dryRun: async () => ({ ok: true })
      }),
      (err: unknown) => {
        assert.strictEqual(err, cancelled, 'propagates the original error');
        return true;
      }
    );
    assert.strictEqual(builds, 1);
    await assert.rejects(
      runSkillBuildLoop('count words', 'count-words', {
        build: async () => builderAnswer('# T\n', 'print(1)\n'),
        dryRun: async () => ({ ok: true }),
        throwIfCancelled: () => {
          throw cancelled;
        }
      }),
      (err: unknown) => {
        assert.strictEqual(err, cancelled);
        return true;
      }
    );
  });
});
