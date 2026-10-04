import * as assert from 'assert';
import { extractSkillDescription, extractSkillTitle } from '../../skills';
import { isAskAiMessage, isOpenLinkMessage } from '../../askAi';

suite('skills', () => {
  test('extracts first H1 title', () => {
    assert.strictEqual(extractSkillTitle('# My Skill\nSome text\n', 'fallback'), 'My Skill');
  });

  test('skips frontmatter and H2 before first H1', () => {
    const md = '---\nname: x\n---\n\n## Not this\n\n# Real Title\n';
    assert.strictEqual(extractSkillTitle(md, 'fallback'), 'Real Title');
  });

  test('ignores ## headings', () => {
    assert.strictEqual(extractSkillTitle('## Only H2\n# Good\n', 'fallback'), 'Good');
  });

  test('falls back to folder name when no H1', () => {
    assert.strictEqual(extractSkillTitle('No title here\n', 'my-skill'), 'my-skill');
    assert.strictEqual(extractSkillTitle('', 'my-skill'), 'my-skill');
  });

  test('trims whitespace', () => {
    assert.strictEqual(extractSkillTitle('  #   Spaced Title   \n', 'fallback'), 'Spaced Title');
  });

  test('extracts frontmatter description', () => {
    const md = '---\nname: count-words\ndescription: Count words of a file.\n---\n\n# Count Words\n';
    assert.strictEqual(extractSkillDescription(md, ''), 'Count words of a file.');
  });

  test('strips quotes around the description', () => {
    assert.strictEqual(
      extractSkillDescription('---\ndescription: "Quoted."\n---\n', ''),
      'Quoted.'
    );
    assert.strictEqual(
      extractSkillDescription("---\ndescription: 'Single.'\n---\n", ''),
      'Single.'
    );
  });

  test('falls back without frontmatter or description', () => {
    assert.strictEqual(extractSkillDescription('# No Frontmatter\n', 'fallback'), 'fallback');
    assert.strictEqual(extractSkillDescription('---\nname: x\n---\n', 'fallback'), 'fallback');
    assert.strictEqual(extractSkillDescription('', 'fallback'), 'fallback');
    assert.strictEqual(
      extractSkillDescription('---\ndescription:\n---\n', 'fallback'),
      'fallback'
    );
  });
});

suite('askAi', () => {
  test('accepts valid ask message', () => {
    assert.strictEqual(isAskAiMessage({ command: 'ask', prompt: 'hello', sessionId: 's1' }), true);
  });

  test('rejects empty prompt, missing session and junk', () => {
    assert.strictEqual(isAskAiMessage({ command: 'ask', prompt: '   ', sessionId: 's1' }), false);
    assert.strictEqual(isAskAiMessage({ command: 'ask', prompt: 'hello' }), false);
    assert.strictEqual(isAskAiMessage({ command: 'ask', prompt: 'hello', sessionId: '' }), false);
    assert.strictEqual(isAskAiMessage({ command: 'ask' }), false);
    assert.strictEqual(isAskAiMessage({ command: 'other', prompt: 'hi', sessionId: 's1' }), false);
    assert.strictEqual(isAskAiMessage(null), false);
    assert.strictEqual(isAskAiMessage('ask'), false);
  });

  test('isOpenLinkMessage validates link requests', () => {
    assert.strictEqual(isOpenLinkMessage({ command: 'openLink', url: 'https://example.com' }), true);
    assert.strictEqual(isOpenLinkMessage({ command: 'openLink', url: '' }), false);
    assert.strictEqual(isOpenLinkMessage({ command: 'openLink' }), false);
    assert.strictEqual(isOpenLinkMessage({ command: 'ask', prompt: 'hi', sessionId: 's1' }), false);
    assert.strictEqual(isOpenLinkMessage(null), false);
  });
});
