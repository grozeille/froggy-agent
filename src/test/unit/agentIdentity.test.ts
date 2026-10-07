import * as assert from 'assert';
import {
  DEFAULT_IDENTITY_MD,
  IDENTITY_FILE_PATH,
  MAX_IDENTITY_BYTES,
  prependIdentity,
  selectIdentityContent
} from '../../agentIdentity';

suite('agentIdentity', () => {
  test('override path lives next to the skills', () => {
    assert.strictEqual(IDENTITY_FILE_PATH, '.github/froggy-identity.md');
  });

  test('size cap matches the memory file cap', () => {
    assert.strictEqual(MAX_IDENTITY_BYTES, 20_000);
  });

  test('default frames a concise personal agent', () => {
    assert.match(DEFAULT_IDENTITY_MD, /personal agent/);
    assert.match(DEFAULT_IDENTITY_MD, /Concise, direct, structured/);
  });

  test('default hides the tooling behind silent calls', () => {
    assert.match(DEFAULT_IDENTITY_MD, /silently/);
    assert.match(DEFAULT_IDENTITY_MD, /never narrate/);
  });

  test('default disciplines memory through the memory tools', () => {
    assert.ok(DEFAULT_IDENTITY_MD.includes('froggyReadMemory'), 'read tool');
    assert.ok(DEFAULT_IDENTITY_MD.includes('froggyAppendMemory'), 'append tool');
    assert.match(DEFAULT_IDENTITY_MD, /preference/);
  });

  test('default covers clarify-vs-proceed', () => {
    assert.match(DEFAULT_IDENTITY_MD, /clarifying question/);
    assert.match(DEFAULT_IDENTITY_MD, /proceed on your own/);
  });

  test('default answers in the user language', () => {
    assert.match(DEFAULT_IDENTITY_MD, /user's language/);
  });

  test('default presents capabilities in plain everyday terms', () => {
    assert.match(DEFAULT_IDENTITY_MD, /never mention VS Code/);
    assert.match(DEFAULT_IDENTITY_MD, /plain everyday terms/);
    assert.match(DEFAULT_IDENTITY_MD, /First, your objective/);
  });

  test('default explains the skills principle before listing', () => {
    assert.match(DEFAULT_IDENTITY_MD, /abilities come from "Skills"/);
    assert.match(DEFAULT_IDENTITY_MD, /create new Skills/);
    assert.match(DEFAULT_IDENTITY_MD, /reproduce what they do on the web/);
    assert.match(DEFAULT_IDENTITY_MD, /voici ce que je peux faire/);
  });

  test('default is LF-only with a trailing newline for scaffolding', () => {
    assert.ok(!DEFAULT_IDENTITY_MD.includes('\r'), 'no CR');
    assert.ok(DEFAULT_IDENTITY_MD.endsWith('\n'), 'trailing newline');
  });

  test('missing override falls back to the default', () => {
    assert.strictEqual(selectIdentityContent(undefined), DEFAULT_IDENTITY_MD);
  });

  test('present override replaces the default', () => {
    assert.strictEqual(selectIdentityContent('# Custom\n'), '# Custom\n');
  });

  test('blank override stays blank (no identity framing)', () => {
    assert.strictEqual(selectIdentityContent('  \n '), '  \n ');
  });

  test('binary override falls back to the default', () => {
    assert.strictEqual(selectIdentityContent('a\0b'), DEFAULT_IDENTITY_MD);
  });

  test('oversized override falls back to the default', () => {
    const fitting = 'x'.repeat(MAX_IDENTITY_BYTES);
    assert.strictEqual(selectIdentityContent(fitting), fitting);
    assert.strictEqual(
      selectIdentityContent(`${fitting}x`),
      DEFAULT_IDENTITY_MD
    );
  });

  test('prependIdentity injects identity before the functional preamble', () => {
    const full = prependIdentity('# Me', 'System: Linux');
    assert.ok(full.startsWith('# Me'), 'identity first');
    assert.ok(full.endsWith('System: Linux'), 'functional preamble last');
  });

  test('prependIdentity drops a blank identity', () => {
    assert.strictEqual(prependIdentity('', 'System: Linux'), 'System: Linux');
    assert.strictEqual(prependIdentity('  \n', 'System: Linux'), 'System: Linux');
  });
});
