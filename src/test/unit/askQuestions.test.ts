import * as assert from 'assert';
import {
  ASK_QUESTIONS_TOOL_NAME,
  MAX_ANSWER_CHARS,
  MAX_ID_CHARS,
  MAX_OPTIONS,
  MAX_OPTION_CHARS,
  MAX_QUESTIONS,
  MAX_QUESTION_CHARS,
  dismissedQuestionsText,
  formatAskQuestionsHint,
  formatQuestionAnswers,
  resolveAskedQuestions
} from '../../askQuestions';

suite('askQuestions', () => {
  test('resolves well-formed questions, trimmed', () => {
    assert.deepStrictEqual(
      resolveAskedQuestions({
        questions: [
          { id: 'n', question: '  Top how many?  ', options: [' 5 ', '', 42, '10'] },
          { question: 'Output file?' }
        ]
      }),
      [
        { id: 'n', question: 'Top how many?', options: ['5', '10'] },
        { id: 'q2', question: 'Output file?', options: [] }
      ]
    );
  });

  test('rejects missing, empty and malformed input', () => {
    assert.strictEqual(resolveAskedQuestions(null), undefined);
    assert.strictEqual(resolveAskedQuestions({}), undefined);
    assert.strictEqual(resolveAskedQuestions({ questions: 'nope' }), undefined);
    assert.strictEqual(resolveAskedQuestions({ questions: [] }), undefined);
    assert.strictEqual(resolveAskedQuestions({ questions: [{}, null, { question: '  ' }] }), undefined);
  });

  test('caps counts, lengths and de-duplicates ids', () => {
    const many = Array.from({ length: 10 }, (_, i) => ({
      id: 'same',
      question: `Q${i} ${'x'.repeat(500)}`,
      options: Array.from({ length: 10 }, () => `opt-${'y'.repeat(200)}`)
    }));
    const resolved = resolveAskedQuestions({ questions: many });
    assert.strictEqual(resolved?.length, MAX_QUESTIONS);
    assert.deepStrictEqual(
      resolved?.map((item) => item.id),
      ['same', 'q2', 'q3', 'q4']
    );
    for (const item of resolved ?? []) {
      assert.ok(item.question.length <= MAX_QUESTION_CHARS);
      assert.ok(item.id.length <= MAX_ID_CHARS);
      assert.strictEqual(item.options.length, MAX_OPTIONS);
      for (const option of item.options) {
        assert.ok(option.length <= MAX_OPTION_CHARS);
      }
    }
  });

  test('formats answers paired by id, marking blanks', () => {
    const text = formatQuestionAnswers(
      [
        { id: 'n', question: 'Top how many?', options: ['5', '10'] },
        { id: 'f', question: 'Output file?', options: [] }
      ],
      [{ id: 'n', value: '  10  ' }]
    );
    assert.ok(text.includes('Q: Top how many?'));
    assert.ok(text.includes('A: 10'));
    assert.ok(text.includes('Q: Output file?'));
    assert.ok(text.includes('A: (no answer)'));
  });

  test('truncates long answers', () => {
    const text = formatQuestionAnswers(
      [{ id: 'q1', question: 'Q?', options: [] }],
      [{ id: 'q1', value: 'x'.repeat(MAX_ANSWER_CHARS + 50) }]
    );
    assert.ok(text.includes('x'.repeat(MAX_ANSWER_CHARS)));
    assert.ok(!text.includes('x'.repeat(MAX_ANSWER_CHARS + 1)));
  });

  test('dismissed text tells the model not to re-ask', () => {
    const text = dismissedQuestionsText();
    assert.match(text, /dismissed/);
    assert.match(text, /Do not re-ask/);
  });

  test('hint names the tool and its shape', () => {
    const hint = formatAskQuestionsHint('pocAskQuestions');
    assert.ok(hint.includes('"pocAskQuestions"'), 'names the tool');
    assert.match(hint, /up to 4 questions/);
    assert.match(hint, /instead of guessing/);
  });

  test('tool name matches the package.json contribution', () => {
    assert.strictEqual(ASK_QUESTIONS_TOOL_NAME, 'pocAskQuestions');
  });
});
