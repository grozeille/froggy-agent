import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import {
  BROWSE_GITIGNORE_ENTRY,
  BROWSE_LAUNCH_ARGS,
  BROWSE_LAUNCH_IGNORE_DEFAULT_ARGS,
  BROWSE_MAX_CONSOLE_ERRORS_KEPT,
  BROWSE_MAX_CONSOLE_ERRORS_SHOWN,
  BROWSE_MAX_TEXT_CHARS,
  BROWSE_OPEN_TOOL_NAME,
  BROWSE_PROFILE_DIR_NAME,
  BROWSE_SCREENSHOT_TOOL_NAME,
  BROWSE_STATE_TOOL_NAME,
  browseLaunchAttempts,
  browseLaunchOptions,
  browseWatchHint,
  describeBrowseLaunch,
  formatBrowseState,
  pushConsoleError,
  resolveBrowseChannel,
  resolveBrowseOpenUrl,
  resolveBrowseProfileDir
} from '../../browseWatch';
import { SETUP_GITIGNORE_ENTRIES } from '../../projectSetup';

interface LanguageModelToolDef {
  name: string;
  toolReferenceName?: string;
}

function readLanguageModelTools(): LanguageModelToolDef[] {
  const file = path.join(__dirname, '..', '..', '..', 'package.json');
  const pkg = JSON.parse(fs.readFileSync(file, 'utf8')) as {
    contributes?: { languageModelTools?: LanguageModelToolDef[] };
  };
  return pkg.contributes?.languageModelTools ?? [];
}

suite('browseWatch', () => {
  test('launch attempts prefer system Chrome, then Edge, then bundled Chromium', () => {
    assert.deepStrictEqual(browseLaunchAttempts(), [
      { channel: 'chrome' },
      { channel: 'msedge' },
      {}
    ]);
  });

  test('launch attempts are labelled for user-facing messages', () => {
    assert.strictEqual(describeBrowseLaunch({ channel: 'chrome' }), 'Google Chrome');
    assert.strictEqual(describeBrowseLaunch({ channel: 'msedge' }), 'Microsoft Edge');
    assert.strictEqual(describeBrowseLaunch({}), 'bundled Chromium');
  });

  test('launch options keep the sandbox and carry the channel through', () => {
    assert.deepStrictEqual(browseLaunchOptions({ channel: 'chrome' }), {
      channel: 'chrome',
      headless: false,
      chromiumSandbox: true,
      args: BROWSE_LAUNCH_ARGS,
      ignoreDefaultArgs: BROWSE_LAUNCH_IGNORE_DEFAULT_ARGS
    });
    const bundled = browseLaunchOptions({});
    assert.strictEqual(bundled.channel, undefined);
    assert.strictEqual(bundled.headless, false);
    assert.strictEqual(bundled.chromiumSandbox, true);
  });

  test('launch flags hide automation fingerprints (Google sign-in)', () => {
    assert.ok(
      BROWSE_LAUNCH_ARGS.includes('--disable-blink-features=AutomationControlled'),
      'navigator.webdriver stays false'
    );
    assert.ok(
      BROWSE_LAUNCH_IGNORE_DEFAULT_ARGS.includes('--enable-automation'),
      'no automation infobar'
    );
  });

  test('resolveBrowseChannel prefers Chrome, then Edge', () => {
    assert.strictEqual(resolveBrowseChannel(['chrome', 'msedge']), 'chrome');
    assert.strictEqual(resolveBrowseChannel(['msedge', 'chrome']), 'chrome');
    assert.strictEqual(resolveBrowseChannel(['msedge']), 'msedge');
    assert.strictEqual(resolveBrowseChannel(['chrome']), 'chrome');
  });

  test('resolveBrowseChannel falls back to bundled Chromium when nothing matches', () => {
    assert.strictEqual(resolveBrowseChannel([]), undefined);
    assert.strictEqual(resolveBrowseChannel(['firefox', 'webkit']), undefined);
    assert.strictEqual(resolveBrowseChannel(['Chrome']), undefined);
  });

  test('profile lives in .froggy-browser/ inside the workspace', () => {
    assert.strictEqual(BROWSE_PROFILE_DIR_NAME, '.froggy-browser');
    assert.strictEqual(BROWSE_GITIGNORE_ENTRY, '.froggy-browser/');
    assert.strictEqual(
      resolveBrowseProfileDir(path.join('ws')),
      path.join('ws', '.froggy-browser')
    );
  });

  test('project setup gitignores the browser profile', () => {
    assert.ok(SETUP_GITIGNORE_ENTRIES.includes(BROWSE_GITIGNORE_ENTRY));
  });

  test('resolves plain https URLs to open', () => {
    assert.strictEqual(
      resolveBrowseOpenUrl({ url: 'https://example.test/a' }),
      'https://example.test/a'
    );
    assert.strictEqual(
      resolveBrowseOpenUrl({ url: '  http://example.test/  ' }),
      'http://example.test/'
    );
  });

  test('rejects missing, blank, unsafe and non-string URLs to open', () => {
    assert.strictEqual(resolveBrowseOpenUrl({}), undefined);
    assert.strictEqual(resolveBrowseOpenUrl({ url: '' }), undefined);
    assert.strictEqual(resolveBrowseOpenUrl({ url: '   ' }), undefined);
    assert.strictEqual(resolveBrowseOpenUrl({ url: 'javascript:alert(1)' }), undefined);
    assert.strictEqual(resolveBrowseOpenUrl({ url: 'ftp://example.test/f' }), undefined);
    assert.strictEqual(resolveBrowseOpenUrl({ url: 'file:///etc/passwd' }), undefined);
    assert.strictEqual(resolveBrowseOpenUrl({ url: 42 }), undefined);
    assert.strictEqual(resolveBrowseOpenUrl(null), undefined);
    assert.strictEqual(resolveBrowseOpenUrl('https://example.test/'), undefined);
  });

  test('formats the state with URL, title and post-JS text', () => {
    const report = formatBrowseState({
      url: 'https://example.test/a',
      title: 'Example',
      text: 'Hello world',
      consoleErrors: []
    });
    assert.ok(report.includes('https://example.test/a'), 'URL');
    assert.ok(report.includes('Title: Example'), 'title');
    assert.ok(report.includes('Hello world'), 'text');
    assert.ok(!report.includes('Console errors'), 'no console section without errors');
  });

  test('formats empty text and missing title explicitly', () => {
    const report = formatBrowseState({
      url: 'https://example.test/empty',
      title: '',
      text: '   ',
      consoleErrors: []
    });
    assert.ok(report.includes('https://example.test/empty'), 'URL');
    assert.ok(!report.includes('Title:'), 'no title line');
    assert.ok(report.includes('(the page contains no readable text)'), 'empty marker');
  });

  test('truncates long text with a marker', () => {
    const text = 'x'.repeat(BROWSE_MAX_TEXT_CHARS + 100);
    const report = formatBrowseState({
      url: 'https://example.test/long',
      title: 'Long',
      text,
      consoleErrors: []
    });
    assert.ok(
      report.includes(
        `…(truncated, showing the first ${BROWSE_MAX_TEXT_CHARS} of ${text.length} characters)`
      ),
      'truncation marker with counts'
    );
  });

  test('lists console errors, most recent only', () => {
    const errors = Array.from(
      { length: BROWSE_MAX_CONSOLE_ERRORS_SHOWN + 3 },
      (_, i) => `boom ${i}`
    );
    const report = formatBrowseState({
      url: 'https://example.test/broken',
      title: 'Broken',
      text: 'content',
      consoleErrors: errors
    });
    assert.ok(report.includes(`Console errors (${errors.length}):`), 'error count');
    assert.ok(report.includes('- boom 0') === false, 'oldest errors hidden');
    assert.ok(report.includes(`boom ${errors.length - 1}`), 'newest error shown');
    assert.ok(report.includes('older error'), 'hidden-count note');
  });

  test('reports an unloaded browser instead of a blank page', () => {
    for (const url of ['', 'about:blank']) {
      const report = formatBrowseState({ url, title: '', text: '', consoleErrors: [] });
      assert.ok(report.includes('has no page loaded'), `empty state for ${JSON.stringify(url)}`);
      assert.ok(report.includes(BROWSE_OPEN_TOOL_NAME), 'names the open tool');
    }
  });

  test('pushConsoleError keeps only the most recent errors', () => {
    const kept = pushConsoleError(['a', 'b'], 'c');
    assert.deepStrictEqual(kept, ['a', 'b', 'c']);
    const full = Array.from({ length: BROWSE_MAX_CONSOLE_ERRORS_KEPT }, (_, i) => `e${i}`);
    const rotated = pushConsoleError(full, 'new');
    assert.strictEqual(rotated.length, BROWSE_MAX_CONSOLE_ERRORS_KEPT);
    assert.strictEqual(rotated[rotated.length - 1], 'new');
    assert.ok(!rotated.includes('e0'), 'oldest evicted');
  });

  test('browseWatchHint names the state tool when offered', () => {
    const hint = browseWatchHint(['froggyDateTime', BROWSE_STATE_TOOL_NAME]);
    assert.ok(hint.includes(BROWSE_STATE_TOOL_NAME), 'names the state tool');
    assert.match(hint, /instead of guessing/);
  });

  test('browseWatchHint mentions the open tool only when offered', () => {
    const withOpen = browseWatchHint([BROWSE_STATE_TOOL_NAME, BROWSE_OPEN_TOOL_NAME]);
    assert.ok(withOpen.includes(BROWSE_OPEN_TOOL_NAME), 'names the open tool');
    const withoutOpen = browseWatchHint([BROWSE_STATE_TOOL_NAME]);
    assert.ok(!withoutOpen.includes(BROWSE_OPEN_TOOL_NAME), 'skips the open tool');
  });

  test('browseWatchHint stays silent without the state tool', () => {
    assert.strictEqual(browseWatchHint(['froggyDateTime']), '');
    assert.strictEqual(browseWatchHint([BROWSE_OPEN_TOOL_NAME]), '');
    assert.strictEqual(browseWatchHint([]), '');
  });

  test('tool names are defined', () => {
    assert.strictEqual(BROWSE_OPEN_TOOL_NAME, 'froggyBrowseOpen');
    assert.strictEqual(BROWSE_STATE_TOOL_NAME, 'froggyBrowseState');
    assert.strictEqual(BROWSE_SCREENSHOT_TOOL_NAME, 'froggyBrowseScreenshot');
  });

  test('package.json contributes the three browse tools', () => {
    const tools = readLanguageModelTools();
    for (const [name, ref] of [
      [BROWSE_OPEN_TOOL_NAME, 'browseOpen'],
      [BROWSE_STATE_TOOL_NAME, 'browseState'],
      [BROWSE_SCREENSHOT_TOOL_NAME, 'browseScreenshot']
    ]) {
      const tool = tools.find((entry) => entry.name === name);
      assert.ok(tool, `${name} contributed`);
      assert.strictEqual(tool?.toolReferenceName, ref, `${name} reference`);
    }
  });
});
