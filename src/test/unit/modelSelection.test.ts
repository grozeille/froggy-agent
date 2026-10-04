import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { MODEL_SETTING_DEFAULT, MODEL_SETTING_KEY, pickChatModel } from '../../modelSelection';

interface ModelSettingDef {
  default: unknown;
}

function readModelSetting(): ModelSettingDef | undefined {
  const file = path.join(__dirname, '..', '..', '..', 'package.json');
  const pkg = JSON.parse(fs.readFileSync(file, 'utf8')) as {
    contributes?: { configuration?: { properties?: Record<string, ModelSettingDef> } };
  };
  return pkg.contributes?.configuration?.properties?.[`poc-vscode-addin.${MODEL_SETTING_KEY}`];
}

const MODELS = [
  { id: 'copilot-gpt-4o', name: 'GPT-4o', vendor: 'copilot', family: 'gpt-4o' },
  { id: 'ollama-qwen3', name: 'qwen3:14b', vendor: 'ollama', family: 'qwen3:14b' }
];

suite('modelSelection', () => {
  test('auto (and blank) picks the first available model', () => {
    assert.strictEqual(pickChatModel(MODELS, 'auto'), MODELS[0]);
    assert.strictEqual(pickChatModel(MODELS, '  AUTO  '), MODELS[0]);
    assert.strictEqual(pickChatModel(MODELS, ''), MODELS[0]);
    assert.strictEqual(pickChatModel(MODELS, MODEL_SETTING_DEFAULT), MODELS[0]);
  });

  test('matches by id, name, family or vendor/family', () => {
    assert.strictEqual(pickChatModel(MODELS, 'ollama-qwen3'), MODELS[1]);
    assert.strictEqual(pickChatModel(MODELS, 'QWEN3:14b'), MODELS[1]);
    assert.strictEqual(pickChatModel(MODELS, 'ollama/qwen3:14b'), MODELS[1]);
    assert.strictEqual(pickChatModel(MODELS, 'gpt-4o'), MODELS[0]);
  });

  test('unknown model throws and lists what is available', () => {
    assert.throws(() => pickChatModel(MODELS, 'nope'), /Model "nope" not found/);
    assert.throws(() => pickChatModel(MODELS, 'nope'), /copilot-gpt-4o, ollama-qwen3/);
  });

  test('no models at all throws a helpful error', () => {
    assert.throws(() => pickChatModel([], 'auto'), /No AI model available/);
  });

  test('package.json contributes the model setting defaulting to auto', () => {
    assert.strictEqual(MODEL_SETTING_KEY, 'model');
    assert.strictEqual(MODEL_SETTING_DEFAULT, 'auto');
    assert.strictEqual(readModelSetting()?.default, 'auto');
  });
});
