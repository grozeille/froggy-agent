import * as assert from 'assert';
import { OPEN_PAGE_TOOL_NAME, resolveOpenPageUrl } from '../../openPage';

suite('openPage', () => {
  test('resolves plain https URLs', () => {
    assert.strictEqual(resolveOpenPageUrl({ url: 'https://example.test/a' }), 'https://example.test/a');
    assert.strictEqual(
      resolveOpenPageUrl({ url: '  http://example.test/  ' }),
      'http://example.test/'
    );
  });

  test('rejects missing, blank, unsafe and non-string URLs', () => {
    assert.strictEqual(resolveOpenPageUrl({}), undefined);
    assert.strictEqual(resolveOpenPageUrl({ url: '' }), undefined);
    assert.strictEqual(resolveOpenPageUrl({ url: '   ' }), undefined);
    assert.strictEqual(resolveOpenPageUrl({ url: 'javascript:alert(1)' }), undefined);
    assert.strictEqual(resolveOpenPageUrl({ url: 'ftp://example.test/f' }), undefined);
    assert.strictEqual(resolveOpenPageUrl({ url: 'file:///etc/passwd' }), undefined);
    assert.strictEqual(resolveOpenPageUrl({ url: 42 }), undefined);
    assert.strictEqual(resolveOpenPageUrl(null), undefined);
    assert.strictEqual(resolveOpenPageUrl('https://example.test/'), undefined);
  });

  test('tool name is defined', () => {
    assert.strictEqual(OPEN_PAGE_TOOL_NAME, 'froggyOpenBrowserPage');
  });
});
