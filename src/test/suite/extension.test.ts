import * as assert from 'assert';
import * as vscode from 'vscode';

suite('Extension Test Suite', () => {
  test('Extension should be present', () => {
    assert.ok(vscode.extensions.getExtension('grozeille.froggy-agent'));
  });

  test('Should activate and register commands', async () => {
    const ext = vscode.extensions.getExtension('grozeille.froggy-agent');
    assert.ok(ext);
    await ext.activate();
    assert.strictEqual(ext.isActive, true);
    const commands = await vscode.commands.getCommands(true);
    assert.ok(commands.includes('froggy-agent.sayHello'));
    assert.ok(commands.includes('froggy-agent.askAi'));
    assert.ok(commands.includes('froggy-agent.newSession'));
    assert.ok(commands.includes('froggy-agent.clearSession'));
    assert.ok(commands.includes('froggy-agent.openSession'));
    assert.ok(commands.includes('froggy-agent.openMainChat'));
    assert.ok(commands.includes('froggy-agent.refreshExplorer'));
    assert.ok(commands.includes('froggy-agent.copyFile'));
    assert.ok(commands.includes('froggy-agent.pasteFile'));
    assert.ok(commands.includes('froggy-agent.renameFile'));
    assert.ok(commands.includes('froggy-agent.deleteFile'));
    assert.ok(commands.includes('froggy-agent.revealFile'));
    assert.ok(commands.includes('froggy-agent.copyPath'));
    assert.ok(commands.includes('froggy-agent.copyRelativePath'));
    assert.ok(commands.includes('froggy-agent.newFile'));
    assert.ok(commands.includes('froggy-agent.newFolder'));
    assert.ok(commands.includes('froggy-agent.openPreview'));
    assert.ok(commands.includes('froggy-agent.deleteSkill'));
    assert.ok(commands.includes('froggy-agent.restoreSkill'));
    assert.ok(commands.includes('froggy-agent.deleteSkillPermanently'));
    assert.ok(commands.includes('froggy-agent.deleteSession'));
    assert.ok(commands.includes('froggy-agent.restoreSession'));
    assert.ok(commands.includes('froggy-agent.deleteSessionPermanently'));
  });

  test('Should default the model setting to auto', async () => {
    const ext = vscode.extensions.getExtension('grozeille.froggy-agent');
    assert.ok(ext);
    await ext.activate();
    assert.strictEqual(
      vscode.workspace.getConfiguration('froggy-agent').get('model'),
      'auto'
    );
  });

  test('Should register the Google search language model tool', async () => {
    const ext = vscode.extensions.getExtension('grozeille.froggy-agent');
    assert.ok(ext);
    await ext.activate();
    assert.ok(vscode.lm, 'Language model API should be available');
    assert.ok(
      vscode.lm.tools.some((tool) => tool.name === 'froggyGoogleSearch'),
      'froggyGoogleSearch tool should be registered'
    );
  });

  test('Should register the web search language model tool', async () => {
    const ext = vscode.extensions.getExtension('grozeille.froggy-agent');
    assert.ok(ext);
    await ext.activate();
    assert.ok(vscode.lm, 'Language model API should be available');
    assert.ok(
      vscode.lm.tools.some((tool) => tool.name === 'froggyWebSearch'),
      'froggyWebSearch tool should be registered'
    );
  });

  test('Should register the fetch-page language model tool', async () => {
    const ext = vscode.extensions.getExtension('grozeille.froggy-agent');
    assert.ok(ext);
    await ext.activate();
    assert.ok(vscode.lm, 'Language model API should be available');
    assert.ok(
      vscode.lm.tools.some((tool) => tool.name === 'froggyFetchWebPage'),
      'froggyFetchWebPage tool should be registered'
    );
  });

  test('Should register the data file language model tools', async () => {
    const ext = vscode.extensions.getExtension('grozeille.froggy-agent');
    assert.ok(ext);
    await ext.activate();
    assert.ok(vscode.lm, 'Language model API should be available');
    assert.ok(
      vscode.lm.tools.some((tool) => tool.name === 'froggyReadDataFile'),
      'froggyReadDataFile tool should be registered'
    );
    assert.ok(
      vscode.lm.tools.some((tool) => tool.name === 'froggyListDataFiles'),
      'froggyListDataFiles tool should be registered'
    );
  });

  test('Should register the run-skill language model tool', async () => {
    const ext = vscode.extensions.getExtension('grozeille.froggy-agent');
    assert.ok(ext);
    await ext.activate();
    assert.ok(vscode.lm, 'Language model API should be available');
    assert.ok(
      vscode.lm.tools.some((tool) => tool.name === 'froggyRunSkill'),
      'froggyRunSkill tool should be registered'
    );
  });

  test('Should register the create-skill language model tool', async () => {
    const ext = vscode.extensions.getExtension('grozeille.froggy-agent');
    assert.ok(ext);
    await ext.activate();
    assert.ok(vscode.lm, 'Language model API should be available');
    assert.ok(
      vscode.lm.tools.some((tool) => tool.name === 'froggyCreateSkill'),
      'froggyCreateSkill tool should be registered'
    );
  });

  test('Should register the ask-questions language model tool', async () => {
    const ext = vscode.extensions.getExtension('grozeille.froggy-agent');
    assert.ok(ext);
    await ext.activate();
    assert.ok(vscode.lm, 'Language model API should be available');
    assert.ok(
      vscode.lm.tools.some((tool) => tool.name === 'froggyAskQuestions'),
      'froggyAskQuestions tool should be registered'
    );
  });

  test('Should register the terminal language model tool', async () => {
    const ext = vscode.extensions.getExtension('grozeille.froggy-agent');
    assert.ok(ext);
    await ext.activate();
    assert.ok(vscode.lm, 'Language model API should be available');
    assert.ok(
      vscode.lm.tools.some((tool) => tool.name === 'froggyRunTerminal'),
      'froggyRunTerminal tool should be registered'
    );
  });

  test('Should register the open-page language model tool', async () => {
    const ext = vscode.extensions.getExtension('grozeille.froggy-agent');
    assert.ok(ext);
    await ext.activate();
    assert.ok(vscode.lm, 'Language model API should be available');
    assert.ok(
      vscode.lm.tools.some((tool) => tool.name === 'froggyOpenBrowserPage'),
      'froggyOpenBrowserPage tool should be registered'
    );
  });

  test('Should register the memory language model tools', async () => {
    const ext = vscode.extensions.getExtension('grozeille.froggy-agent');
    assert.ok(ext);
    await ext.activate();
    assert.ok(vscode.lm, 'Language model API should be available');
    assert.ok(
      vscode.lm.tools.some((tool) => tool.name === 'froggyReadMemory'),
      'froggyReadMemory tool should be registered'
    );
    assert.ok(
      vscode.lm.tools.some((tool) => tool.name === 'froggyAppendMemory'),
      'froggyAppendMemory tool should be registered'
    );
  });

  test('Should invoke the date/time language model tool', async () => {
    const ext = vscode.extensions.getExtension('grozeille.froggy-agent');
    assert.ok(ext);
    await ext.activate();
    assert.ok(vscode.lm, 'Language model API should be available');
    const result = await vscode.lm.invokeTool('froggyDateTime', {
      input: {},
      toolInvocationToken: undefined
    });
    const text = result.content
      .map((part) => (part instanceof vscode.LanguageModelTextPart ? part.value : ''))
      .join('');
    assert.match(text, /ISO \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });
});
