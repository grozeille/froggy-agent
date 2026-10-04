/** Tool name must match the `languageModelTools` contribution in package.json. */
export const ASK_QUESTIONS_TOOL_NAME = 'pocAskQuestions';

/** Caps so one round stays a small card, not a form. */
export const MAX_QUESTIONS = 4;
export const MAX_QUESTION_CHARS = 200;
export const MAX_OPTIONS = 6;
export const MAX_OPTION_CHARS = 80;
export const MAX_ANSWER_CHARS = 500;
export const MAX_ID_CHARS = 40;

export interface AskQuestionsToolInput {
  /** Raw model input, validated at runtime (see `resolveAskedQuestions`). */
  questions: unknown;
}

export interface AskedQuestion {
  id: string;
  question: string;
  options: string[];
}

export interface QuestionAnswer {
  id: string;
  value: string;
}

function cleanOptions(options: unknown): string[] {
  if (!Array.isArray(options)) {
    return [];
  }
  return options
    .filter((option): option is string => typeof option === 'string')
    .map((option) => option.trim())
    .filter((option) => option.length > 0)
    .slice(0, MAX_OPTIONS)
    .map((option) => option.slice(0, MAX_OPTION_CHARS));
}

/**
 * Validate + normalize model input: trim, truncate, drop empties, cap the
 * counts, and assign unique positional ids (`q1`…) when missing or taken.
 * Returns undefined when no valid question remains.
 */
export function resolveAskedQuestions(input: unknown): AskedQuestion[] | undefined {
  if (typeof input !== 'object' || input === null) {
    return undefined;
  }
  const raw = (input as { questions?: unknown }).questions;
  if (!Array.isArray(raw)) {
    return undefined;
  }
  const questions: AskedQuestion[] = [];
  const used = new Set<string>();
  for (const item of raw) {
    if (questions.length >= MAX_QUESTIONS) {
      break;
    }
    if (typeof item !== 'object' || item === null) {
      continue;
    }
    const record = item as Record<string, unknown>;
    const question =
      typeof record.question === 'string'
        ? record.question.trim().slice(0, MAX_QUESTION_CHARS)
        : '';
    if (!question) {
      continue;
    }
    let id = typeof record.id === 'string' ? record.id.trim().slice(0, MAX_ID_CHARS) : '';
    if (!id || used.has(id)) {
      let n = questions.length + 1;
      while (used.has(`q${n}`)) {
        n += 1;
      }
      id = `q${n}`;
    }
    used.add(id);
    questions.push({ id, question, options: cleanOptions(record.options) });
  }
  return questions.length > 0 ? questions : undefined;
}

/**
 * Render Q/A pairs for the tool result (and the action log): answers are
 * paired by question id, missing or blank ones marked `(no answer)`.
 */
export function formatQuestionAnswers(
  questions: readonly AskedQuestion[],
  answers: readonly QuestionAnswer[]
): string {
  const byId = new Map(answers.map((answer) => [answer.id, answer.value]));
  return questions
    .map((question) => {
      const value = (byId.get(question.id) ?? '').trim().slice(0, MAX_ANSWER_CHARS);
      return `Q: ${question.question}\nA: ${value || '(no answer)'}`;
    })
    .join('\n');
}

/** Result text when the user dismisses the card (or leaves mid-question). */
export function dismissedQuestionsText(): string {
  return 'The user dismissed the questions. Do not re-ask; continue with sensible defaults.';
}

/** Preamble nudge so the model reaches for structured questions. */
export function formatAskQuestionsHint(toolName: string): string {
  return (
    ` When a value you need is missing or ambiguous, call the "${toolName}" tool` +
    ` with up to 4 questions (each with concrete options when possible) instead` +
    ` of guessing.`
  );
}
