import * as assert from 'assert';
import { MEMORY_FILE_NAME, NEW_DISCUSSION_LABEL } from '../../sections';

suite('sections', () => {
  test('Ask AI actions use the expected labels', () => {
    assert.strictEqual(NEW_DISCUSSION_LABEL, 'New discussion');
    assert.strictEqual(MEMORY_FILE_NAME, 'memory.md');
  });
});
