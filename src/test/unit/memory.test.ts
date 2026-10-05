import * as assert from 'assert';
import {
  APPEND_MEMORY_TOOL_NAME,
  formatMemoryContent,
  MAX_MEMORY_BYTES,
  MAX_MEMORY_NOTE_CHARS,
  MEMORY_PATH,
  READ_MEMORY_TOOL_NAME,
  resolveMemoryNote
} from '../../memory';
import { MEMORY_FILE_NAME } from '../../sections';

suite('memory', () => {
  test('resolves plain notes', () => {
    assert.strictEqual(resolveMemoryNote({ note: 'My name is Mathias' }), 'My name is Mathias');
    assert.strictEqual(resolveMemoryNote({ note: '  padded  ' }), 'padded');
  });

  test('rejects missing, blank and non-string notes', () => {
    assert.strictEqual(resolveMemoryNote({}), undefined);
    assert.strictEqual(resolveMemoryNote({ note: '' }), undefined);
    assert.strictEqual(resolveMemoryNote({ note: '   ' }), undefined);
    assert.strictEqual(resolveMemoryNote({ note: 42 }), undefined);
    assert.strictEqual(resolveMemoryNote(null), undefined);
    assert.strictEqual(resolveMemoryNote('note'), undefined);
  });

  test('formats content and marks the empty state', () => {
    assert.strictEqual(formatMemoryContent('My name is Mathias'), 'My name is Mathias');
    assert.match(formatMemoryContent(''), /nothing memorized yet/);
    assert.match(formatMemoryContent('  \n '), /nothing memorized yet/);
  });

  test('constants are defined', () => {
    assert.strictEqual(READ_MEMORY_TOOL_NAME, 'froggyReadMemory');
    assert.strictEqual(APPEND_MEMORY_TOOL_NAME, 'froggyAppendMemory');
    assert.strictEqual(MEMORY_PATH, MEMORY_FILE_NAME);
    assert.strictEqual(MEMORY_PATH, 'memory.md');
    assert.strictEqual(MAX_MEMORY_BYTES, 20_000);
    assert.strictEqual(MAX_MEMORY_NOTE_CHARS, 2000);
  });
});
