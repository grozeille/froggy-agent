import * as assert from 'assert';
import {
  DEPS_MARKER_NAME,
  PIP_INSTALL_TIMEOUT_MS,
  PYTHON_NOT_FOUND_MESSAGE,
  PYTHON_PROBE_TIMEOUT_MS,
  VENV_DIR_NAME,
  VENV_GITIGNORE_ENTRY,
  VENV_TIMEOUT_MS,
  ensureGitignoreEntry,
  hashRequirements
} from '../../pythonEnv';

suite('pythonEnv', () => {
  test('creates a gitignore holding only the venv entry', () => {
    assert.deepStrictEqual(ensureGitignoreEntry(undefined), {
      content: '.venv/\n',
      changed: true
    });
    assert.deepStrictEqual(ensureGitignoreEntry(''), {
      content: '.venv/\n',
      changed: true
    });
  });

  test('appends the entry preserving existing content', () => {
    assert.deepStrictEqual(ensureGitignoreEntry('node_modules/\n'), {
      content: 'node_modules/\n.venv/\n',
      changed: true
    });
    assert.deepStrictEqual(ensureGitignoreEntry('# comment\nnode_modules/'), {
      content: '# comment\nnode_modules/\n.venv/\n',
      changed: true
    });
  });

  test('keeps CRLF files CRLF', () => {
    assert.deepStrictEqual(ensureGitignoreEntry('node_modules/\r\n'), {
      content: 'node_modules/\r\n.venv/\r\n',
      changed: true
    });
  });

  test('leaves an already-ignored venv alone', () => {
    for (const current of ['.venv/\n', 'node_modules/\n.venv\n', '  .venv/  \n', '.venv/']) {
      assert.deepStrictEqual(ensureGitignoreEntry(current), {
        content: current,
        changed: false
      });
    }
  });

  test('does not match partial lines', () => {
    const update = ensureGitignoreEntry('my.venv/\n');
    assert.strictEqual(update.changed, true);
    assert.ok(update.content.includes('.venv/\n'));
  });

  test('hashes requirements stably', () => {
    const hash = hashRequirements('requests==2.32.3\n');
    assert.match(hash, /^[0-9a-f]{64}$/);
    assert.strictEqual(hashRequirements('requests==2.32.3\n'), hash);
    assert.notStrictEqual(hashRequirements('requests==2.32.4\n'), hash);
  });

  test('constants are defined', () => {
    assert.strictEqual(VENV_DIR_NAME, '.venv');
    assert.strictEqual(VENV_GITIGNORE_ENTRY, '.venv/');
    assert.strictEqual(PYTHON_PROBE_TIMEOUT_MS, 15_000);
    assert.strictEqual(VENV_TIMEOUT_MS, 120_000);
    assert.strictEqual(PIP_INSTALL_TIMEOUT_MS, 180_000);
    assert.strictEqual(DEPS_MARKER_NAME, '.deps-installed');
    assert.match(PYTHON_NOT_FOUND_MESSAGE, /Python 3 was not found/);
    assert.match(PYTHON_NOT_FOUND_MESSAGE, /PATH/);
  });
});
