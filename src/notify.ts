import type { AskedQuestion } from './askQuestions';

/** Action button on the attention notification; reveals the Ask AI panel. */
export const ATTENTION_ACTION = 'Open Chat';

/**
 * Notify only when VS Code lost the focus: while focused the chat panel
 * itself shows the answer or question, so a popup would just be noise.
 */
export function shouldNotifyAttention(windowFocused: boolean): boolean {
  return !windowFocused;
}

function oneLine(text: string, max: number): string {
  const single = text.replace(/\s+/g, ' ').trim();
  return single.length > max ? `${single.slice(0, max - 1).trimEnd()}…` : single;
}

/** Finished-answer popup, with an answer preview when there is one. */
export function formatAnswerNotification(answer: string): string {
  const snippet = oneLine(answer, 120);
  return snippet ? `Froggy Agent finished: ${snippet}` : 'Froggy Agent finished answering';
}

/** Structured-question popup, quoting the first question when there is one. */
export function formatQuestionNotification(questions: readonly AskedQuestion[]): string {
  const first = questions.length > 0 ? oneLine(questions[0].question, 120) : '';
  return first ? `Froggy Agent has a question: ${first}` : 'Froggy Agent has a question for you';
}

/** Tool-confirmation popup, quoting the card title when there is one. */
export function formatConfirmNotification(title: string): string {
  const short = oneLine(title, 120);
  return short ? `Froggy Agent needs confirmation: ${short}` : 'Froggy Agent needs your confirmation';
}

/** Failed-answer popup; the details stay in the chat panel. */
export function formatErrorNotification(): string {
  return 'Froggy Agent hit an error — open the chat to see it';
}

/** Title of the native OS toast; must match the toast app id. */
export const NATIVE_APP_NAME = 'Froggy Agent';

/**
 * Body for the native OS toast: the full message minus the app prefix the
 * toast title already shows.
 */
export function toNativeBody(fullMessage: string): string {
  const prefix = `${NATIVE_APP_NAME} `;
  const body = fullMessage.startsWith(prefix) ? fullMessage.slice(prefix.length) : fullMessage;
  return body.length > 0 ? body.charAt(0).toUpperCase() + body.slice(1) : body;
}
