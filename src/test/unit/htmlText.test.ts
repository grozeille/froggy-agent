import * as assert from 'assert';
import {
  collapseWhitespace,
  decodeHtmlEntities,
  htmlToText,
  snippetToText,
  stripHtmlTags
} from '../../htmlText';

suite('htmlText', () => {
  test('decodeHtmlEntities decodes named entities', () => {
    assert.strictEqual(
      decodeHtmlEntities('a &amp; b &lt;c&gt; &quot;q&quot; &#39;apos&#39;'),
      'a & b <c> "q" \'apos\''
    );
  });

  test('decodeHtmlEntities decodes numeric references', () => {
    assert.strictEqual(decodeHtmlEntities('&#65;&#x42;C'), 'ABC');
    assert.strictEqual(decodeHtmlEntities('S&amp;P&#039;s'), "S&P's");
  });

  test('decodeHtmlEntities leaves unknown entities alone', () => {
    assert.strictEqual(decodeHtmlEntities('&copy; &#xZZ; &#;'), '&copy; &#xZZ; &#;');
  });

  test('stripHtmlTags removes tags but keeps text', () => {
    assert.strictEqual(
      stripHtmlTags('<p>Hello <b>world</b></p>').replace(/\s+/g, ' ').trim(),
      'Hello world'
    );
  });

  test('stripHtmlTags drops script, style and comment content', () => {
    const stripped = stripHtmlTags(
      '<style>.a{color:red}</style><p>Keep</p><script>alert(1)</script><!-- secret -->'
    );
    assert.ok(!stripped.includes('color'), 'no style content');
    assert.ok(!stripped.includes('alert'), 'no script content');
    assert.ok(!stripped.includes('secret'), 'no comment content');
    assert.ok(stripped.includes('Keep'), 'keeps readable text');
  });

  test('collapseWhitespace squeezes runs to single spaces', () => {
    assert.strictEqual(collapseWhitespace('  a\n\t b  \n c '), 'a b c');
  });

  test('htmlToText extracts the title and body text', () => {
    const page = htmlToText(
      '<html><head><title>Example page</title><script>var x = 1;</script></head>' +
        '<body><h1>Hi</h1><p>Some text.</p></body></html>'
    );
    assert.strictEqual(page.title, 'Example page');
    assert.strictEqual(page.text, 'Hi Some text.');
  });

  test('htmlToText falls back to the whole document without a body', () => {
    const page = htmlToText('<p>Loose fragment</p>');
    assert.strictEqual(page.title, '');
    assert.strictEqual(page.text, 'Loose fragment');
  });

  test('snippetToText cleans search-result HTML', () => {
    assert.strictEqual(
      snippetToText(
        'the <span class="searchmatch">S</span>&amp;<span class="searchmatch">P</span> 500 index'
      ),
      'the S&P 500 index'
    );
  });
});
