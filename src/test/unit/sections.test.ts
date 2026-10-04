import * as assert from 'assert';
import { MAIN_CHAT_LABEL, MEMORY_FILE_NAME } from '../../sections';

suite('sections', () => {
  test('Ask AI actions use the expected labels', () => {
    assert.strictEqual(MAIN_CHAT_LABEL, 'Main chat');
    assert.strictEqual(MEMORY_FILE_NAME, 'memory.md');
  });
});
