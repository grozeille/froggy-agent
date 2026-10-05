import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { ARCHIVE_CONTEXT_VALUE } from '../../archive';
import {
  DEFAULT_SKILL_NAMES,
  DEFAULT_SKILLS,
  isBuiltinSkill
} from '../../defaultSkills';
import { MODEL_SETTING_DEFAULT } from '../../modelSelection';
import {
  DATA_DIR_NAME,
  MEMORY_SEED_CONTENT,
  SETUP_COMMAND_ID,
  SETUP_GITIGNORE_ENTRIES,
  VSCODE_SETTINGS_PATH,
  buildSettingsContent,
  formatSetupSummary,
  shouldPromptProjectSetup
} from '../../projectSetup';
import { VENV_GITIGNORE_ENTRY } from '../../pythonEnv';
import { MEMORY_FILE_NAME } from '../../sections';
import {
  ARCHIVED_SKILL_CONTEXT_VALUE,
  BUILTIN_SKILL_CONTEXT_VALUE,
  SKILL_CONTEXT_VALUE
} from '../../skillArchive';
import { resolveSkillName } from '../../skillRun';
import { extractSkillDescription, extractSkillTitle } from '../../skills';

interface CommandDef {
  command: string;
  title: string;
}

interface MenuDef {
  command: string;
  when?: string;
}

interface PackageJson {
  activationEvents?: string[];
  contributes?: {
    commands?: CommandDef[];
    menus?: Record<string, MenuDef[]>;
    configuration?: {
      properties?: Record<string, { default?: unknown }>;
    };
  };
}

function readPackageJson(): PackageJson {
  const file = path.join(__dirname, '..', '..', '..', 'package.json');
  return JSON.parse(fs.readFileSync(file, 'utf8')) as PackageJson;
}

function readDemoSkillFile(skillName: string, fileName: string): string {
  const file = path.join(
    __dirname,
    '..',
    '..',
    '..',
    'demo-project',
    '.github',
    'skills',
    skillName,
    fileName
  );
  return fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
}

suite('defaultSkills', () => {
  test('ships the documented default skills', () => {
    assert.deepStrictEqual([...DEFAULT_SKILL_NAMES], [
      'browser-search',
      'count-words',
      'skill-factory'
    ]);
  });

  test('names are valid skill folder names', () => {
    for (const skill of DEFAULT_SKILLS) {
      assert.strictEqual(resolveSkillName(skill.name), skill.name, skill.name);
    }
  });

  test('every SKILL.md has matching frontmatter, a description and a title', () => {
    for (const skill of DEFAULT_SKILLS) {
      assert.ok(
        skill.skillMd.startsWith(`---\nname: ${skill.name}\n`),
        `${skill.name}: frontmatter name`
      );
      assert.ok(extractSkillDescription(skill.skillMd, ''), `${skill.name}: description`);
      assert.notStrictEqual(
        extractSkillTitle(skill.skillMd, skill.name),
        skill.name,
        `${skill.name}: H1 title`
      );
    }
  });

  test('templates are LF-only with a trailing newline', () => {
    for (const skill of DEFAULT_SKILLS) {
      for (const [label, text] of [
        ['SKILL.md', skill.skillMd],
        ...(skill.runPy !== undefined ? [['run.py', skill.runPy] as const] : []),
        ...(skill.requirements !== undefined
          ? [['requirements.txt', skill.requirements] as const]
          : [])
      ]) {
        assert.ok(!text.includes('\r'), `${skill.name} ${label}: no CR`);
        assert.ok(text.endsWith('\n'), `${skill.name} ${label}: trailing newline`);
      }
    }
  });

  test('runnable defaults ship a real script entry point', () => {
    const runnable = DEFAULT_SKILLS.filter((skill) => skill.runPy !== undefined);
    assert.ok(runnable.length > 0, 'at least one runnable default skill');
    for (const skill of runnable) {
      assert.ok(skill.runPy?.includes('def main'), `${skill.name}: main entry point`);
    }
  });

  test('default skills are standard library only', () => {
    for (const skill of DEFAULT_SKILLS) {
      assert.strictEqual(skill.requirements, undefined, skill.name);
    }
  });

  test('templates mirror the demo-project skills', () => {
    for (const skill of DEFAULT_SKILLS) {
      assert.strictEqual(
        skill.skillMd,
        readDemoSkillFile(skill.name, 'SKILL.md'),
        `${skill.name}/SKILL.md`
      );
      if (skill.runPy !== undefined) {
        assert.strictEqual(
          skill.runPy,
          readDemoSkillFile(skill.name, 'run.py'),
          `${skill.name}/run.py`
        );
      }
    }
  });

  test('isBuiltinSkill matches default names only', () => {
    for (const name of DEFAULT_SKILL_NAMES) {
      assert.strictEqual(isBuiltinSkill(name), true, name);
    }
    for (const name of ['', 'my-skill', 'count-words-x', 'browser-search-2']) {
      assert.strictEqual(isBuiltinSkill(name), false, name);
    }
  });
});

suite('projectSetup', () => {
  test('memory seed is the bare header the memory tool writes when missing', () => {
    assert.strictEqual(MEMORY_FILE_NAME, 'memory.md');
    assert.strictEqual(MEMORY_SEED_CONTENT, '# Memory\n\n');
  });

  test('scaffolded settings pin the auto model with builtins-only tools', () => {
    const settings = JSON.parse(buildSettingsContent()) as Record<string, unknown>;
    assert.strictEqual(settings['froggy-agent.model'], MODEL_SETTING_DEFAULT);
    assert.strictEqual(settings['froggy-agent.model'], 'auto');
    assert.deepStrictEqual(settings['froggy-agent.tools'], []);
    assert.deepStrictEqual(settings['workbench.editorAssociations'], {
      '*.md': 'vscode.markdown.preview.editor'
    });
  });

  test('settings path and data dir are workspace-relative', () => {
    assert.strictEqual(VSCODE_SETTINGS_PATH, '.vscode/settings.json');
    assert.strictEqual(DATA_DIR_NAME, 'data');
  });

  test('gitignore entries cover the venv', () => {
    assert.ok(SETUP_GITIGNORE_ENTRIES.includes(VENV_GITIGNORE_ENTRY));
  });

  test('prompts only on a virgin folder', () => {
    assert.strictEqual(
      shouldPromptProjectSetup({ memory: false, data: false, skills: false }),
      true
    );
    for (const markers of [
      { memory: true, data: false, skills: false },
      { memory: false, data: true, skills: false },
      { memory: false, data: false, skills: true },
      { memory: true, data: true, skills: true }
    ]) {
      assert.strictEqual(shouldPromptProjectSetup(markers), false, JSON.stringify(markers));
    }
  });

  test('summary reports created pieces plus the python note', () => {
    assert.strictEqual(
      formatSetupSummary([], ''),
      'Froggy Agent project is already set up.'
    );
    assert.strictEqual(
      formatSetupSummary(['memory.md', 'data/'], ' Venv note.'),
      'Froggy Agent project ready (created: memory.md, data/). Venv note.'
    );
  });

  test('builtin context value is distinct so no menu can target it by accident', () => {
    for (const other of [SKILL_CONTEXT_VALUE, ARCHIVED_SKILL_CONTEXT_VALUE, ARCHIVE_CONTEXT_VALUE]) {
      assert.notStrictEqual(BUILTIN_SKILL_CONTEXT_VALUE, other);
    }
  });

  test('setup command is contributed and activates the extension', () => {
    const pkg = readPackageJson();
    assert.ok(
      (pkg.activationEvents ?? []).includes(`onCommand:${SETUP_COMMAND_ID}`),
      'activation event'
    );
    const commands = pkg.contributes?.commands ?? [];
    const setup = commands.find((entry) => entry.command === SETUP_COMMAND_ID);
    assert.strictEqual(setup?.title, 'Froggy Agent: Setup Project');
  });

  test('setup command stays visible in the command palette', () => {
    const palette = readPackageJson().contributes?.menus?.commandPalette ?? [];
    assert.ok(
      !palette.some((entry) => entry.command === SETUP_COMMAND_ID),
      'no palette hide entry'
    );
  });

  test('extension default model is auto', () => {
    const properties = readPackageJson().contributes?.configuration?.properties ?? {};
    assert.strictEqual(properties['froggy-agent.model']?.default, 'auto');
  });

  test('no menu targets built-in skills for archive or delete', () => {
    const menus = readPackageJson().contributes?.menus ?? {};
    for (const [section, entries] of Object.entries(menus)) {
      for (const entry of entries) {
        assert.ok(
          !(entry.when ?? '').includes(BUILTIN_SKILL_CONTEXT_VALUE),
          `${section}: ${entry.command}`
        );
      }
    }
  });
});
