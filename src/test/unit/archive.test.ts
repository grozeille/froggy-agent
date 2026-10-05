import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import {
  ARCHIVE_CONTEXT_VALUE,
  ARCHIVE_LABEL,
  archiveSummary
} from '../../archive';
import {
  ARCHIVED_SESSION_CONTEXT_VALUE,
  SESSION_CONTEXT_VALUE
} from '../../sessions';

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

suite('archive', () => {
  test('archive node label and context value are stable', () => {
    assert.strictEqual(ARCHIVE_LABEL, 'Archive');
    assert.strictEqual(ARCHIVE_CONTEXT_VALUE, 'archive');
  });

  test('archiveSummary counts with the caller noun', () => {
    assert.strictEqual(archiveSummary(0, 'skill', 'skills'), 'empty');
    assert.strictEqual(archiveSummary(1, 'skill', 'skills'), '1 skill');
    assert.strictEqual(archiveSummary(2, 'skill', 'skills'), '2 skills');
    assert.strictEqual(archiveSummary(1, 'session', 'sessions'), '1 session');
    assert.strictEqual(archiveSummary(3, 'session', 'sessions'), '3 sessions');
  });

  test('session archive/restore/delete commands are contributed', () => {
    const commands = readPackageJson().contributes?.commands ?? [];
    const byId = new Map(commands.map((entry) => [entry.command, entry.title]));
    assert.strictEqual(byId.get('poc-vscode-addin.deleteSession'), 'Archive');
    assert.strictEqual(byId.get('poc-vscode-addin.restoreSession'), 'Restore');
    assert.strictEqual(byId.get('poc-vscode-addin.deleteSessionPermanently'), 'Delete');
  });

  test('sessions view context menus target live vs archived sessions', () => {
    const menus = readPackageJson().contributes?.menus?.['view/item/context'] ?? [];
    const byId = new Map(menus.map((entry) => [entry.command, entry.when]));
    assert.strictEqual(
      byId.get('poc-vscode-addin.deleteSession'),
      `view == pocSessionsView && viewItem == ${SESSION_CONTEXT_VALUE}`
    );
    assert.strictEqual(
      byId.get('poc-vscode-addin.restoreSession'),
      `view == pocSessionsView && viewItem == ${ARCHIVED_SESSION_CONTEXT_VALUE}`
    );
    assert.strictEqual(
      byId.get('poc-vscode-addin.deleteSessionPermanently'),
      `view == pocSessionsView && viewItem == ${ARCHIVED_SESSION_CONTEXT_VALUE}`
    );
  });

  test('session archive commands are hidden from the command palette', () => {
    const palette = readPackageJson().contributes?.menus?.commandPalette ?? [];
    const byId = new Map(palette.map((entry) => [entry.command, entry.when]));
    for (const id of [
      'poc-vscode-addin.deleteSession',
      'poc-vscode-addin.restoreSession',
      'poc-vscode-addin.deleteSessionPermanently'
    ]) {
      assert.strictEqual(byId.get(id), 'never', id);
    }
  });
});
