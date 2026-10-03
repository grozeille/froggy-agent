import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as vm from 'vm';

// The renderer is a plain webview script: load the real shipped file in a VM.
function loadRenderer(): (src: string) => string {
  const file = path.join(__dirname, '..', '..', '..', 'media', 'markdown.js');
  const source = fs.readFileSync(file, 'utf8');
  const sandbox: Record<string, unknown> = {};
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox);
  const render = sandbox['renderMarkdown'];
  assert.strictEqual(typeof render, 'function');
  return render as (src: string) => string;
}

const renderMarkdown = loadRenderer();

suite('markdown', () => {
  test('renders emphasis and code spans', () => {
    assert.strictEqual(renderMarkdown('**bold**'), '<p><strong>bold</strong></p>');
    assert.strictEqual(renderMarkdown('*italic*'), '<p><em>italic</em></p>');
    assert.strictEqual(renderMarkdown('~~gone~~'), '<p><del>gone</del></p>');
    assert.strictEqual(renderMarkdown('`x < y`'), '<p><code>x &lt; y</code></p>');
  });

  test('keeps snake_case and math alone', () => {
    assert.strictEqual(renderMarkdown('some_var_name'), '<p>some_var_name</p>');
    assert.strictEqual(renderMarkdown('2*3*4'), '<p>2*3*4</p>');
  });

  test('renders headings and rules', () => {
    assert.strictEqual(renderMarkdown('# Title'), '<h1>Title</h1>');
    assert.strictEqual(renderMarkdown('### Deep ##'), '<h3>Deep</h3>');
    assert.strictEqual(renderMarkdown('---'), '<hr>');
  });

  test('renders fenced code, even unclosed while streaming', () => {
    assert.strictEqual(
      renderMarkdown('```js\nconst a = 1 < 2;\n```'),
      '<pre><code class="language-js">const a = 1 &lt; 2;</code></pre>'
    );
    assert.strictEqual(
      renderMarkdown('```\npartial('),
      '<pre><code>partial(</code></pre>'
    );
  });

  test('escapes raw HTML instead of passing it through', () => {
    const html = renderMarkdown('<img src=x onerror=alert(1)>');
    assert.ok(!html.includes('<img'));
    assert.ok(html.includes('&lt;img'));
  });

  test('links http URLs and rejects javascript: URLs', () => {
    assert.strictEqual(
      renderMarkdown('[docs](https://example.com/a)'),
      '<p><a href="https://example.com/a">docs</a></p>'
    );
    const evil = renderMarkdown('[x](javascript:alert(1))');
    assert.ok(!evil.includes('<a'));
    assert.ok(evil.includes('javascript:alert(1)'));
  });

  test('renders lists and task items', () => {
    assert.strictEqual(
      renderMarkdown('- a\n- b'),
      '<ul><li>a</li><li>b</li></ul>'
    );
    assert.strictEqual(
      renderMarkdown('1. a\n2. b'),
      '<ol><li>a</li><li>b</li></ol>'
    );
    const task = renderMarkdown('- [x] done');
    assert.ok(task.includes('checked'));
    assert.ok(task.includes('done'));
  });

  test('renders tables with alignment', () => {
    const html = renderMarkdown('| a | b |\n|---|--:|\n| 1 | 2 |');
    assert.ok(html.includes('<th>a</th>'));
    assert.ok(html.includes('<th class="md-r">b</th>'));
    assert.ok(html.includes('<td>1</td>'));
    assert.ok(html.includes('<td class="md-r">2</td>'));
  });

  test('renders quotes and paragraphs', () => {
    assert.strictEqual(renderMarkdown('> hello'), '<blockquote><p>hello</p></blockquote>');
    assert.strictEqual(renderMarkdown('a\n\nb'), '<p>a</p><p>b</p>');
    assert.strictEqual(renderMarkdown(''), '');
  });
});
