import * as vscode from 'vscode';
import {
  ASK_QUESTIONS_TOOL_NAME,
  formatQuestionAnswers,
  resolveAskedQuestions,
  type AskQuestionsToolInput,
  type QuestionAnswer
} from './askQuestions';

/**
 * Structured user questions. Inside the Ask AI panel the call is answered
 * by an in-chat card (see AskAiPanel); this fallback prompts with native
 * pickers so the tool stays usable when invoked by any other agent.
 */
export class AskQuestionsTool implements vscode.LanguageModelTool<AskQuestionsToolInput> {
  public async prepareInvocation(
    options: vscode.LanguageModelToolInvocationPrepareOptions<AskQuestionsToolInput>,
    _token: vscode.CancellationToken
  ): Promise<vscode.PreparedToolInvocation> {
    const count = resolveAskedQuestions(options.input)?.length ?? 0;
    return {
      invocationMessage:
        count > 0 ? `Asking the user ${count} question${count > 1 ? 's' : ''}` : 'Asking follow-up questions'
    };
  }

  public async invoke(
    options: vscode.LanguageModelToolInvocationOptions<AskQuestionsToolInput>,
    token: vscode.CancellationToken
  ): Promise<vscode.LanguageModelToolResult> {
    const questions = resolveAskedQuestions(options.input);
    if (!questions) {
      throw new Error('Ask at least one valid question with a non-empty question text.');
    }
    const answers: QuestionAnswer[] = [];
    for (const question of questions) {
      if (token.isCancellationRequested) {
        break;
      }
      const value =
        question.options.length > 0
          ? await vscode.window.showQuickPick(question.options, {
              title: question.question,
              placeHolder: 'Pick an answer or press Esc to skip'
            })
          : await vscode.window.showInputBox({ prompt: question.question });
      answers.push({ id: question.id, value: value ?? '' });
    }
    return new vscode.LanguageModelToolResult([
      new vscode.LanguageModelTextPart(formatQuestionAnswers(questions, answers))
    ]);
  }
}

export function registerAskQuestionsTool(): vscode.Disposable | undefined {
  if (!vscode.lm?.registerTool) {
    return undefined;
  }
  return vscode.lm.registerTool(ASK_QUESTIONS_TOOL_NAME, new AskQuestionsTool());
}
