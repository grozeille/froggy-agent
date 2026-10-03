import * as assert from 'assert';
import { isSafeHttpUrl } from '../../urls';

suite('urls', () => {
  test('accepts http and https links', () => {
    assert.strictEqual(isSafeHttpUrl('https://example.com'), true);
    assert.strictEqual(isSafeHttpUrl('http://example.com/a?b=1#c'), true);
    assert.strictEqual(isSafeHttpUrl('HTTPS://EXAMPLE.COM/x'), true);
    assert.strictEqual(isSafeHttpUrl('  https://example.com  '), true);
  });

  test('rejects dangerous and malformed URLs', () => {
    assert.strictEqual(isSafeHttpUrl('javascript:alert(1)'), false);
    assert.strictEqual(isSafeHttpUrl('data:text/html,<h1>x</h1>'), false);
    assert.strictEqual(isSafeHttpUrl('file:///etc/passwd'), false);
    assert.strictEqual(isSafeHttpUrl('ftp://example.com/f'), false);
    assert.strictEqual(isSafeHttpUrl('not a url'), false);
    assert.strictEqual(isSafeHttpUrl(''), false);
  });
});
