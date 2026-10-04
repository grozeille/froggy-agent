import * as assert from 'assert';
import {
  FETCH_PAGE_TOOL_NAME,
  fetchPageText,
  formatFetchedPage,
  isBlockedFetchHost,
  MAX_FETCH_BYTES,
  resolveFetchPageUrl,
  type PageFetch,
  type PageFetchResponse
} from '../../fetchPage';

suite('fetchPage', () => {
  test('allows public hosts', () => {
    assert.strictEqual(isBlockedFetchHost('example.com'), false);
    assert.strictEqual(isBlockedFetchHost('en.wikipedia.org'), false);
    assert.strictEqual(isBlockedFetchHost('8.8.8.8'), false);
    assert.strictEqual(isBlockedFetchHost('1.1.1.1'), false);
    assert.strictEqual(isBlockedFetchHost('172.15.0.1'), false);
    assert.strictEqual(isBlockedFetchHost('172.32.0.1'), false);
  });

  test('blocks loopback, private and link-local hosts', () => {
    assert.strictEqual(isBlockedFetchHost('localhost'), true);
    assert.strictEqual(isBlockedFetchHost('LOCALHOST'), true);
    assert.strictEqual(isBlockedFetchHost('app.localhost'), true);
    assert.strictEqual(isBlockedFetchHost('printer.local'), true);
    assert.strictEqual(isBlockedFetchHost('wiki.internal'), true);
    assert.strictEqual(isBlockedFetchHost('router.lan'), true);
    assert.strictEqual(isBlockedFetchHost('0.0.0.0'), true);
    assert.strictEqual(isBlockedFetchHost('127.0.0.1'), true);
    assert.strictEqual(isBlockedFetchHost('10.1.2.3'), true);
    assert.strictEqual(isBlockedFetchHost('172.16.0.1'), true);
    assert.strictEqual(isBlockedFetchHost('172.31.255.255'), true);
    assert.strictEqual(isBlockedFetchHost('192.168.1.1'), true);
    assert.strictEqual(isBlockedFetchHost('169.254.169.254'), true);
    assert.strictEqual(isBlockedFetchHost('::1'), true);
    assert.strictEqual(isBlockedFetchHost('[::1]'), true);
    assert.strictEqual(isBlockedFetchHost('fe80::1'), true);
    assert.strictEqual(isBlockedFetchHost('fc00::1'), true);
    assert.strictEqual(isBlockedFetchHost('fd12:3456::1'), true);
    assert.strictEqual(isBlockedFetchHost(''), true);
  });

  test('resolves public http(s) URLs', () => {
    assert.strictEqual(
      resolveFetchPageUrl({ url: 'https://example.test/a' }),
      'https://example.test/a'
    );
    assert.strictEqual(
      resolveFetchPageUrl({ url: '  http://example.test/  ' }),
      'http://example.test/'
    );
  });

  test('rejects unsafe, credentialed and local URLs', () => {
    assert.strictEqual(resolveFetchPageUrl({}), undefined);
    assert.strictEqual(resolveFetchPageUrl({ url: '' }), undefined);
    assert.strictEqual(resolveFetchPageUrl({ url: 'javascript:alert(1)' }), undefined);
    assert.strictEqual(resolveFetchPageUrl({ url: 'file:///etc/passwd' }), undefined);
    assert.strictEqual(resolveFetchPageUrl({ url: 'https://user:pass@example.test/' }), undefined);
    assert.strictEqual(resolveFetchPageUrl({ url: 'http://localhost:3000/' }), undefined);
    assert.strictEqual(resolveFetchPageUrl({ url: 'http://192.168.1.1/' }), undefined);
    assert.strictEqual(resolveFetchPageUrl({ url: 'http://169.254.169.254/' }), undefined);
    assert.strictEqual(resolveFetchPageUrl({ url: 42 }), undefined);
    assert.strictEqual(resolveFetchPageUrl(null), undefined);
  });

  test('tool name matches the package.json contribution', () => {
    assert.strictEqual(FETCH_PAGE_TOOL_NAME, 'pocFetchWebPage');
  });
});

function stubPageResponse(
  body: string,
  contentType = 'text/html; charset=utf-8',
  ok = true,
  status = 200,
  contentLength?: number
): PageFetchResponse {
  const headers: Record<string, string> = { 'content-type': contentType };
  if (contentLength !== undefined) {
    headers['content-length'] = String(contentLength);
  }
  return {
    ok,
    status,
    headers: { get: (name: string) => headers[name.toLowerCase()] ?? null },
    text: () => Promise.resolve(body)
  };
}

suite('fetchPageText', () => {
  test('reduces an HTML page to title and readable text', async () => {
    const fetchImpl: PageFetch = () =>
      Promise.resolve(
        stubPageResponse(
          '<html><head><title>Hi</title><script>var x = 1;</script></head>' +
            '<body><p>Hello <b>world</b>.</p></body></html>'
        )
      );
    const page = await fetchPageText('https://example.test/', fetchImpl);
    assert.strictEqual(page.url, 'https://example.test/');
    assert.strictEqual(page.title, 'Hi');
    assert.strictEqual(page.text, 'Hello world.');
  });

  test('passes JSON bodies through untouched', async () => {
    const fetchImpl: PageFetch = () =>
      Promise.resolve(stubPageResponse('{"a":1}', 'application/json'));
    const page = await fetchPageText('https://example.test/api', fetchImpl);
    assert.strictEqual(page.text, '{"a":1}');
  });

  test('throws a readable error on HTTP failures', async () => {
    const fetchImpl: PageFetch = () => Promise.resolve(stubPageResponse('nope', 'text/html', false, 404));
    await assert.rejects(() => fetchPageText('https://example.test/missing', fetchImpl), /HTTP 404/);
  });

  test('refuses binary content types', async () => {
    const fetchImpl: PageFetch = () =>
      Promise.resolve(stubPageResponse('...', 'image/png'));
    await assert.rejects(() => fetchPageText('https://example.test/i.png', fetchImpl), /not readable/);
  });

  test('refuses oversized pages', async () => {
    const byHeader: PageFetch = () =>
      Promise.resolve(stubPageResponse('small', 'text/html', true, 200, MAX_FETCH_BYTES + 1));
    await assert.rejects(() => fetchPageText('https://example.test/big', byHeader), /too large/);
    const byBody: PageFetch = () =>
      Promise.resolve(stubPageResponse('x'.repeat(MAX_FETCH_BYTES + 1), 'text/html'));
    await assert.rejects(() => fetchPageText('https://example.test/big', byBody), /too large/);
  });
});

suite('formatFetchedPage', () => {
  test('renders title and text', () => {
    const text = formatFetchedPage({ url: 'https://example.test/', title: 'Hi', text: 'Hello.' });
    assert.match(text, /Fetched https:\/\/example\.test\//);
    assert.match(text, /Title: Hi/);
    assert.match(text, /Hello\./);
  });

  test('marks pages without readable text', () => {
    assert.match(
      formatFetchedPage({ url: 'https://example.test/', title: '', text: '' }),
      /no readable text/
    );
  });

  test('truncates long pages with a marker', () => {
    const text = formatFetchedPage({
      url: 'https://example.test/',
      title: '',
      text: 'x'.repeat(9000)
    });
    assert.match(text, /…\(truncated, showing the first 8000 of 9000 characters\)/);
  });
});
