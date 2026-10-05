import * as assert from 'assert';
import { buildGoogleSearchUrl, GOOGLE_SEARCH_TOOL_NAME } from '../../searchUrl';

suite('searchTool', () => {
  test('builds a google.com search URL', () => {
    assert.strictEqual(
      buildGoogleSearchUrl('vscode extensions'),
      'https://www.google.com/search?q=vscode%20extensions'
    );
  });

  test('trims whitespace', () => {
    assert.strictEqual(
      buildGoogleSearchUrl('  hello  '),
      'https://www.google.com/search?q=hello'
    );
  });

  test('encodes special characters', () => {
    assert.strictEqual(
      buildGoogleSearchUrl('c++ & c#?'),
      'https://www.google.com/search?q=c%2B%2B%20%26%20c%23%3F'
    );
  });

  test('tool name matches the package.json contribution', () => {
    assert.strictEqual(GOOGLE_SEARCH_TOOL_NAME, 'froggyGoogleSearch');
  });
});
