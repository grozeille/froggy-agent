import * as assert from 'assert';
import {
  formatAnswerNotification,
  formatConfirmNotification,
  formatErrorNotification,
  formatQuestionNotification,
  shouldNotifyAttention,
  toNativeBody
} from '../../notify';

suite('notify', () => {
  test('notifies only when the window lost the focus', () => {
    assert.strictEqual(shouldNotifyAttention(false), true);
    assert.strictEqual(shouldNotifyAttention(true), false);
  });

  test('answer quotes a one-line preview', () => {
    assert.strictEqual(
      formatAnswerNotification('Total: **42** words.'),
      'Froggy Agent finished: Total: **42** words.'
    );
    assert.strictEqual(
      formatAnswerNotification('  line one\nline two  '),
      'Froggy Agent finished: line one line two'
    );
    assert.strictEqual(formatAnswerNotification('   '), 'Froggy Agent finished answering');
    assert.strictEqual(formatAnswerNotification(''), 'Froggy Agent finished answering');
  });

  test('answer truncates long previews', () => {
    const message = formatAnswerNotification(`${'a'.repeat(200)} end`);
    assert.ok(message.startsWith('Froggy Agent finished: aaaa'));
    assert.ok(message.endsWith('…'));
    assert.ok(!message.includes('end'));
  });

  test('question quotes the first question', () => {
    assert.strictEqual(
      formatQuestionNotification([
        { id: 'q1', question: 'Top 5 or 10?', options: ['5', '10'] },
        { id: 'q2', question: 'Second?', options: [] }
      ]),
      'Froggy Agent has a question: Top 5 or 10?'
    );
    assert.strictEqual(
      formatQuestionNotification([]),
      'Froggy Agent has a question for you'
    );
  });

  test('confirm quotes the card title', () => {
    assert.strictEqual(
      formatConfirmNotification('Run: ls data'),
      'Froggy Agent needs confirmation: Run: ls data'
    );
    assert.strictEqual(formatConfirmNotification('  '), 'Froggy Agent needs your confirmation');
  });

  test('error points back to the chat', () => {
    assert.strictEqual(
      formatErrorNotification(),
      'Froggy Agent hit an error — open the chat to see it'
    );
  });

  test('native body drops the repeated app prefix', () => {
    assert.strictEqual(toNativeBody('Froggy Agent finished: hello'), 'Finished: hello');
    assert.strictEqual(toNativeBody('Froggy Agent has a question for you'), 'Has a question for you');
    assert.strictEqual(toNativeBody('Something else'), 'Something else');
    assert.strictEqual(toNativeBody(''), '');
  });
});
