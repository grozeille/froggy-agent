import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import {
  formatFileListing,
  LIST_DATA_FILES_TOOL_NAME,
  MAX_DATA_FILE_BYTES,
  READ_DATA_FILE_TOOL_NAME,
  resolveDataRelativePath
} from '../../dataFiles';

interface LanguageModelToolDef {
  name: string;
  modelDescription: string;
  inputSchema: { required?: string[] };
}

function readToolDefs(): LanguageModelToolDef[] {
  const file = path.join(__dirname, '..', '..', '..', 'package.json');
  const pkg = JSON.parse(fs.readFileSync(file, 'utf8')) as {
    contributes?: { languageModelTools?: LanguageModelToolDef[] };
  };
  return pkg.contributes?.languageModelTools ?? [];
}

suite('dataFiles', () => {
  test('resolves plain relative paths', () => {
    assert.strictEqual(resolveDataRelativePath('notes/todo.md'), 'notes/todo.md');
    assert.strictEqual(resolveDataRelativePath('todo.md'), 'todo.md');
  });

  test('trims, accepts backslashes and skips dot segments', () => {
    assert.strictEqual(resolveDataRelativePath('  notes\\todo.md  '), 'notes/todo.md');
    assert.strictEqual(resolveDataRelativePath('./notes/./todo.md'), 'notes/todo.md');
  });

  test('rejects empty, absolute and escaping paths', () => {
    assert.strictEqual(resolveDataRelativePath(''), undefined);
    assert.strictEqual(resolveDataRelativePath('   '), undefined);
    assert.strictEqual(resolveDataRelativePath('.'), undefined);
    assert.strictEqual(resolveDataRelativePath('/etc/passwd'), undefined);
    assert.strictEqual(resolveDataRelativePath('C:/data/todo.md'), undefined);
    assert.strictEqual(resolveDataRelativePath('C:\\data\\todo.md'), undefined);
    assert.strictEqual(resolveDataRelativePath('../todo.md'), undefined);
    assert.strictEqual(resolveDataRelativePath('notes/../../todo.md'), undefined);
  });

  test('formats listings with folders first and trailing slashes', () => {
    assert.strictEqual(
      formatFileListing([
        { name: 'b.md', isDirectory: false },
        { name: 'notes', isDirectory: true },
        { name: 'a.md', isDirectory: false },
        { name: 'archive', isDirectory: true }
      ]),
      'archive/\nnotes/\na.md\nb.md'
    );
    assert.strictEqual(formatFileListing([]), '');
  });

  test('caps file content sent to the model', () => {
    assert.strictEqual(MAX_DATA_FILE_BYTES, 100_000);
  });

  test('package.json contributes the data tools against the data folder', () => {
    const tools = readToolDefs();
    const read = tools.find((tool) => tool.name === READ_DATA_FILE_TOOL_NAME);
    const list = tools.find((tool) => tool.name === LIST_DATA_FILES_TOOL_NAME);
    assert.ok(read, 'froggyReadDataFile should be contributed');
    assert.ok(list, 'froggyListDataFiles should be contributed');
    assert.deepStrictEqual(read.inputSchema.required, ['path']);
    assert.match(read.modelDescription, /data folder/);
    assert.match(read.modelDescription, /relative/);
    assert.match(list.modelDescription, /data folder/);
  });
});
