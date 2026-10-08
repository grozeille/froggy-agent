import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { REFRESH_FILES_TOOL_NAME, refreshFilesHint } from '../../refreshFiles';

interface LanguageModelToolDef {
  name: string;
  toolReferenceName?: string;
}

function readLanguageModelTools(): LanguageModelToolDef[] {
  const file = path.join(__dirname, '..', '..', '..', 'package.json');
  const pkg = JSON.parse(fs.readFileSync(file, 'utf8')) as {
    contributes?: { languageModelTools?: LanguageModelToolDef[] };
  };
  return pkg.contributes?.languageModelTools ?? [];
}

suite('refreshFiles', () => {
  test('tool name is defined', () => {
    assert.strictEqual(REFRESH_FILES_TOOL_NAME, 'froggyRefreshFiles');
  });

  test('refreshFilesHint tells the model to refresh after any file change', () => {
    const hint = refreshFilesHint(['froggyRunTerminal', REFRESH_FILES_TOOL_NAME]);
    assert.ok(hint.includes(REFRESH_FILES_TOOL_NAME), 'names the refresh tool');
    for (const verb of ['create', 'modify', 'move', 'rename', 'delete']) {
      assert.ok(hint.includes(verb), `covers ${verb}`);
    }
    assert.match(hint, /before answering/);
  });

  test('refreshFilesHint stays silent without the refresh tool', () => {
    assert.strictEqual(refreshFilesHint(['froggyRunTerminal']), '');
    assert.strictEqual(refreshFilesHint([]), '');
  });

  test('package.json contributes the refresh tool', () => {
    const tool = readLanguageModelTools().find(
      (entry) => entry.name === REFRESH_FILES_TOOL_NAME
    );
    assert.ok(tool, `${REFRESH_FILES_TOOL_NAME} contributed`);
    assert.strictEqual(tool?.toolReferenceName, 'refreshFiles');
  });
});
