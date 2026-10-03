import * as assert from 'assert';
import { copyNameFor, isMarkdownFile, validateFileName } from '../../files';

suite('files', () => {
  test('detects markdown files', () => {
    assert.strictEqual(isMarkdownFile('SKILL.md'), true);
    assert.strictEqual(isMarkdownFile('memory.md'), true);
    assert.strictEqual(isMarkdownFile('notes.markdown'), true);
    assert.strictEqual(isMarkdownFile('README.MD'), true);
  });

  test('rejects non-markdown files', () => {
    assert.strictEqual(isMarkdownFile('sample.csv'), false);
    assert.strictEqual(isMarkdownFile('data.json'), false);
    assert.strictEqual(isMarkdownFile('md'), false);
    assert.strictEqual(isMarkdownFile(''), false);
  });

  test('copyNameFor keeps the original on first attempt', () => {
    assert.strictEqual(copyNameFor('a.txt', 0), 'a.txt');
    assert.strictEqual(copyNameFor('a.txt', -1), 'a.txt');
  });

  test('copyNameFor numbers copies before the extension', () => {
    assert.strictEqual(copyNameFor('a.txt', 1), 'a copy.txt');
    assert.strictEqual(copyNameFor('a.txt', 2), 'a copy 2.txt');
    assert.strictEqual(copyNameFor('archive.tar.gz', 1), 'archive.tar copy.gz');
  });

  test('copyNameFor handles names without extension', () => {
    assert.strictEqual(copyNameFor('README', 1), 'README copy');
    assert.strictEqual(copyNameFor('.env', 1), '.env copy');
  });

  test('validateFileName accepts plain names', () => {
    assert.strictEqual(validateFileName('notes.md'), undefined);
    assert.strictEqual(validateFileName('my folder'), undefined);
  });

  test('validateFileName rejects empty names and slashes', () => {
    assert.strictEqual(validateFileName(''), 'Name cannot be empty.');
    assert.strictEqual(validateFileName('   '), 'Name cannot be empty.');
    assert.strictEqual(validateFileName('a/b'), 'Name cannot contain slashes.');
    assert.strictEqual(validateFileName('a\\b'), 'Name cannot contain slashes.');
  });
});
