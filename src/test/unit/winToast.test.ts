import * as assert from 'assert';
import {
  buildToastScript,
  encodeToastCommand,
  showWindowsToast,
  supportsNativeToast,
  WIN_TOAST_APP_ID
} from '../../winToast';

suite('winToast', () => {
  test('script shows a two-line toast for the app id', () => {
    const script = buildToastScript(WIN_TOAST_APP_ID, 'Froggy Agent', 'Finished: hello');
    assert.ok(script.includes('ToastText02'), 'two-line template');
    assert.ok(script.includes('CreateTextNode(\'Froggy Agent\')'), 'title node');
    assert.ok(script.includes('CreateTextNode(\'Finished: hello\')'), 'body node');
    assert.ok(
      script.includes(`CreateToastNotifier('${WIN_TOAST_APP_ID}')`),
      'notifier bound to the app id'
    );
  });

  test('script neutralizes single quotes and collapses whitespace', () => {
    const script = buildToastScript('app', "l'agent\na  agi", "d'accord");
    assert.ok(script.includes("l''agent a agi"), 'quote doubled, newline folded');
    assert.ok(script.includes("d''accord"), 'body quote doubled');
  });

  test('script truncates overlong bodies', () => {
    const script = buildToastScript('app', 't', `${'b'.repeat(500)} TAILMARKERZZ9`);
    assert.ok(!script.includes('TAILMARKERZZ9'), 'tail dropped');
    assert.ok(script.includes('…'), 'ellipsis marks the cut');
  });

  test('encoded command round-trips through base64 utf16le', () => {
    const script = buildToastScript('app', 't', 'b');
    const decoded = Buffer.from(encodeToastCommand(script), 'base64').toString('utf16le');
    assert.strictEqual(decoded, script);
  });

  test('spawns an encoded powershell toast on Windows', () => {
    const calls: Array<{ command: string; args: string[] }> = [];
    showWindowsToast('Froggy Agent', 'Finished: hello', 'win32', (command, args) => {
      calls.push({ command, args });
      return { once: () => undefined, unref: () => undefined };
    });
    assert.strictEqual(calls.length, 1);
    assert.strictEqual(calls[0].command, 'powershell.exe');
    assert.deepStrictEqual(calls[0].args.slice(0, 3), ['-NoProfile', '-NonInteractive', '-EncodedCommand']);
    const decoded = Buffer.from(calls[0].args[3], 'base64').toString('utf16le');
    assert.ok(decoded.includes('Finished: hello'), 'payload carries the body');
  });

  test('native toast is Windows-only', () => {
    assert.strictEqual(supportsNativeToast('win32'), true);
    assert.strictEqual(supportsNativeToast('darwin'), false);
    assert.strictEqual(supportsNativeToast('linux'), false);
  });

  test('stays silent off Windows', () => {
    for (const platform of ['darwin', 'linux']) {
      showWindowsToast('t', 'b', platform, () => {
        throw new Error('must not spawn');
      });
    }
  });

  test('never throws when spawning fails', () => {
    showWindowsToast('t', 'b', 'win32', () => {
      throw new Error('no powershell');
    });
  });
});
