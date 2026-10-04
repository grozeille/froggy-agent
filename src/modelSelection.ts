/** Setting `poc-vscode-addin.model`: which chat model Ask AI uses. */
export const MODEL_SETTING_KEY = 'model';
export const MODEL_SETTING_DEFAULT = 'auto';

/** Structural subset of `vscode.LanguageModelChat` used for matching. */
export interface ChatModelInfo {
  id: string;
  name: string;
  vendor: string;
  family: string;
}

/**
 * Pick a chat model from the available ones. `auto` (or blank) takes the
 * first model; anything else matches (case-insensitively) a model id, name,
 * family or `vendor/family`. Throws a helpful error when nothing matches.
 */
export function pickChatModel<T extends ChatModelInfo>(
  models: readonly T[],
  setting: string
): T {
  if (models.length === 0) {
    throw new Error(
      'No AI model available. Make sure Copilot is signed in or a local model provider (e.g. Ollama) is running.'
    );
  }
  const want = setting.trim();
  if (!want || want.toLowerCase() === MODEL_SETTING_DEFAULT) {
    return models[0];
  }
  const lower = want.toLowerCase();
  const found = models.find(
    (model) =>
      model.id.toLowerCase() === lower ||
      model.name.toLowerCase() === lower ||
      model.family.toLowerCase() === lower ||
      `${model.vendor}/${model.family}`.toLowerCase() === lower
  );
  if (!found) {
    const available = models.map((model) => model.id).join(', ');
    throw new Error(
      `Model "${want}" not found. Available: ${available}. Use "auto" or one of these ids.`
    );
  }
  return found;
}
