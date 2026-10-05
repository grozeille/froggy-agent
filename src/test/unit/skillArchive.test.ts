import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { ARCHIVE_CONTEXT_VALUE } from '../../archive';
import {
  ARCHIVE_DIR_NAME,
  ARCHIVED_SKILL_CONTEXT_VALUE,
  archiveCopyNameFor,
  SKILL_CONTEXT_VALUE
} from '../../skillArchive';
import { SKILLS_DIR_NAME } from '../../skillRun';

interface CommandDef {
  command: string;
  title: string;
}

interface MenuDef {
  command: string;
  when?: string;
}

interface PackageJson {
  contributes?: {
    commands?: CommandDef[];
    menus?: {
      'view/item/context'?: MenuDef[];
      commandPalette?: MenuDef[];
    };
  };
}

function readPackageJson(): PackageJson {
  const file = path.join(__dirname, '..', '..', '..', 'package.json');
  return JSON.parse(fs.readFileSync(file, 'utf8')) as PackageJson;
}

suite('skillArchive', () => {
  test('archive lives outside .github so archived skills stay invisible to the model', () => {
    assert.ok(!ARCHIVE_DIR_NAME.startsWith('.github'), 'outside .github');
    assert.ok(!SKILLS_DIR_NAME.startsWith(ARCHIVE_DIR_NAME), 'no overlap with the skills dir');
    assert.notStrictEqual(ARCHIVE_DIR_NAME, SKILLS_DIR_NAME);
  });

  test('skill context values are distinct so menus target the right nodes', () => {
    assert.notStrictEqual(SKILL_CONTEXT_VALUE, ARCHIVED_SKILL_CONTEXT_VALUE);
    assert.notStrictEqual(ARCHIVE_CONTEXT_VALUE, SKILL_CONTEXT_VALUE);
    assert.notStrictEqual(ARCHIVE_CONTEXT_VALUE, ARCHIVED_SKILL_CONTEXT_VALUE);
  });

  test('archiveCopyNameFor keeps the name then appends -2, -3, ...', () => {
    assert.strictEqual(archiveCopyNameFor('ram-report', -1), 'ram-report');
    assert.strictEqual(archiveCopyNameFor('ram-report', 0), 'ram-report');
    assert.strictEqual(archiveCopyNameFor('ram-report', 1), 'ram-report-2');
    assert.strictEqual(archiveCopyNameFor('ram-report', 2), 'ram-report-3');
  });

  test('archive/restore/delete commands are contributed', () => {
    const commands = readPackageJson().contributes?.commands ?? [];
    const byId = new Map(commands.map((entry) => [entry.command, entry.title]));
    assert.strictEqual(byId.get('froggy-agent.deleteSkill'), 'Archive');
    assert.strictEqual(byId.get('froggy-agent.restoreSkill'), 'Restore');
    assert.strictEqual(byId.get('froggy-agent.deleteSkillPermanently'), 'Delete');
  });

  test('skills view context menus target live vs archived skills', () => {
    const menus = readPackageJson().contributes?.menus?.['view/item/context'] ?? [];
    const byId = new Map(menus.map((entry) => [entry.command, entry.when]));
    assert.strictEqual(
      byId.get('froggy-agent.deleteSkill'),
      `view == froggySkillsView && viewItem == ${SKILL_CONTEXT_VALUE}`
    );
    assert.strictEqual(
      byId.get('froggy-agent.restoreSkill'),
      `view == froggySkillsView && viewItem == ${ARCHIVED_SKILL_CONTEXT_VALUE}`
    );
    assert.strictEqual(
      byId.get('froggy-agent.deleteSkillPermanently'),
      `view == froggySkillsView && viewItem == ${ARCHIVED_SKILL_CONTEXT_VALUE}`
    );
  });

  test('skill archive commands are hidden from the command palette', () => {
    const palette = readPackageJson().contributes?.menus?.commandPalette ?? [];
    const byId = new Map(palette.map((entry) => [entry.command, entry.when]));
    for (const id of [
      'froggy-agent.deleteSkill',
      'froggy-agent.restoreSkill',
      'froggy-agent.deleteSkillPermanently'
    ]) {
      assert.strictEqual(byId.get(id), 'never', id);
    }
  });
});
