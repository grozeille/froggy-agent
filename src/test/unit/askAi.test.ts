import * as assert from 'assert';
import {
  isAnswerResultMessage,
  isAskAiMessage,
  isConfirmResultMessage,
  isOpenActionLogMessage,
  isOpenLinkMessage,
  isStopMessage
} from '../../askAi';

suite('askAi', () => {
  test('isAskAiMessage validates ask messages', () => {
    assert.strictEqual(
      isAskAiMessage({ command: 'ask', prompt: 'hi', sessionId: 's1' }),
      true
    );
    assert.strictEqual(isAskAiMessage({ command: 'ask', prompt: '  ', sessionId: 's1' }), false);
    assert.strictEqual(isAskAiMessage({ command: 'ask', prompt: 'hi' }), false);
    assert.strictEqual(isAskAiMessage({ command: 'other' }), false);
    assert.strictEqual(isAskAiMessage(null), false);
  });

  test('isOpenLinkMessage validates openLink messages', () => {
    assert.strictEqual(isOpenLinkMessage({ command: 'openLink', url: 'https://x.test' }), true);
    assert.strictEqual(isOpenLinkMessage({ command: 'openLink' }), false);
    assert.strictEqual(isOpenLinkMessage(null), false);
  });

  test('isConfirmResultMessage validates confirm results', () => {
    assert.strictEqual(
      isConfirmResultMessage({ command: 'confirmResult', id: 'confirm-1', approved: true }),
      true
    );
    assert.strictEqual(
      isConfirmResultMessage({ command: 'confirmResult', id: 'confirm-1', approved: false }),
      true
    );
    assert.strictEqual(isConfirmResultMessage({ command: 'confirmResult', id: 'c1' }), false);
    assert.strictEqual(
      isConfirmResultMessage({ command: 'confirmResult', id: '', approved: true }),
      false
    );
    assert.strictEqual(
      isConfirmResultMessage({ command: 'confirmResult', id: 'c1', approved: 'yes' }),
      false
    );
    assert.strictEqual(isConfirmResultMessage({ command: 'ask' }), false);
    assert.strictEqual(isConfirmResultMessage(null), false);
  });

  test('isOpenActionLogMessage validates openActionLog messages', () => {
    assert.strictEqual(
      isOpenActionLogMessage({ command: 'openActionLog', sessionId: 's1' }),
      true
    );
    assert.strictEqual(isOpenActionLogMessage({ command: 'openActionLog' }), false);
    assert.strictEqual(
      isOpenActionLogMessage({ command: 'openActionLog', sessionId: '' }),
      false
    );
    assert.strictEqual(isOpenActionLogMessage({ command: 'ask' }), false);
    assert.strictEqual(isOpenActionLogMessage(null), false);
  });

  test('isStopMessage validates stop messages', () => {
    assert.strictEqual(isStopMessage({ command: 'stop', sessionId: 's1' }), true);
    assert.strictEqual(isStopMessage({ command: 'stop' }), false);
    assert.strictEqual(isStopMessage({ command: 'stop', sessionId: '' }), false);
    assert.strictEqual(isStopMessage({ command: 'ask' }), false);
    assert.strictEqual(isStopMessage(null), false);
  });

  test('isAnswerResultMessage validates answer results', () => {
    assert.strictEqual(
      isAnswerResultMessage({
        command: 'answerResult',
        id: 'question-1',
        answers: [{ id: 'q1', value: 'top 10' }]
      }),
      true
    );
    assert.strictEqual(
      isAnswerResultMessage({ command: 'answerResult', id: 'question-1', answers: null }),
      true
    );
    assert.strictEqual(isAnswerResultMessage({ command: 'answerResult', id: 'q1' }), false);
    assert.strictEqual(
      isAnswerResultMessage({ command: 'answerResult', id: '', answers: [] }),
      false
    );
    assert.strictEqual(
      isAnswerResultMessage({
        command: 'answerResult',
        id: 'q1',
        answers: [{ id: 'q1', value: 42 }]
      }),
      false
    );
    assert.strictEqual(isAnswerResultMessage({ command: 'ask' }), false);
    assert.strictEqual(isAnswerResultMessage(null), false);
  });
});
