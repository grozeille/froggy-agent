import * as assert from 'assert';
import * as vscode from 'vscode';

suite('Extension Test Suite', () => {
  test('Extension should be present', () => {
    assert.ok(vscode.extensions.getExtension('poc.poc-vscode-addin'));
  });

  test('Should activate and register commands', async () => {
    const ext = vscode.extensions.getExtension('poc.poc-vscode-addin');
    assert.ok(ext);
    await ext.activate();
    assert.strictEqual(ext.isActive, true);
    const commands = await vscode.commands.getCommands(true);
    assert.ok(commands.includes('poc-vscode-addin.sayHello'));
    assert.ok(commands.includes('poc-vscode-addin.askAi'));
    assert.ok(commands.includes('poc-vscode-addin.newSession'));
    assert.ok(commands.includes('poc-vscode-addin.clearSession'));
    assert.ok(commands.includes('poc-vscode-addin.openSession'));
    assert.ok(commands.includes('poc-vscode-addin.openMainChat'));
    assert.ok(commands.includes('poc-vscode-addin.refreshExplorer'));
    assert.ok(commands.includes('poc-vscode-addin.copyFile'));
    assert.ok(commands.includes('poc-vscode-addin.pasteFile'));
    assert.ok(commands.includes('poc-vscode-addin.renameFile'));
    assert.ok(commands.includes('poc-vscode-addin.deleteFile'));
    assert.ok(commands.includes('poc-vscode-addin.revealFile'));
    assert.ok(commands.includes('poc-vscode-addin.copyPath'));
    assert.ok(commands.includes('poc-vscode-addin.copyRelativePath'));
    assert.ok(commands.includes('poc-vscode-addin.newFile'));
    assert.ok(commands.includes('poc-vscode-addin.newFolder'));
    assert.ok(commands.includes('poc-vscode-addin.openPreview'));
    assert.ok(commands.includes('poc-vscode-addin.deleteSkill'));
    assert.ok(commands.includes('poc-vscode-addin.restoreSkill'));
    assert.ok(commands.includes('poc-vscode-addin.deleteSkillPermanently'));
    assert.ok(commands.includes('poc-vscode-addin.deleteSession'));
    assert.ok(commands.includes('poc-vscode-addin.restoreSession'));
    assert.ok(commands.includes('poc-vscode-addin.deleteSessionPermanently'));
  });

  test('Should default the model setting to auto', async () => {
    const ext = vscode.extensions.getExtension('poc.poc-vscode-addin');
    assert.ok(ext);
    await ext.activate();
    assert.strictEqual(
      vscode.workspace.getConfiguration('poc-vscode-addin').get('model'),
      'auto'
    );
  });

  test('Should register the Google search language model tool', async () => {
    const ext = vscode.extensions.getExtension('poc.poc-vscode-addin');
    assert.ok(ext);
    await ext.activate();
    assert.ok(vscode.lm, 'Language model API should be available');
    assert.ok(
      vscode.lm.tools.some((tool) => tool.name === 'pocGoogleSearch'),
      'pocGoogleSearch tool should be registered'
    );
  });

  test('Should register the data file language model tools', async () => {
    const ext = vscode.extensions.getExtension('poc.poc-vscode-addin');
    assert.ok(ext);
    await ext.activate();
    assert.ok(vscode.lm, 'Language model API should be available');
    assert.ok(
      vscode.lm.tools.some((tool) => tool.name === 'pocReadDataFile'),
      'pocReadDataFile tool should be registered'
    );
    assert.ok(
      vscode.lm.tools.some((tool) => tool.name === 'pocListDataFiles'),
      'pocListDataFiles tool should be registered'
    );
  });

  test('Should register the run-skill language model tool', async () => {
    const ext = vscode.extensions.getExtension('poc.poc-vscode-addin');
    assert.ok(ext);
    await ext.activate();
    assert.ok(vscode.lm, 'Language model API should be available');
    assert.ok(
      vscode.lm.tools.some((tool) => tool.name === 'pocRunSkill'),
      'pocRunSkill tool should be registered'
    );
  });

  test('Should register the create-skill language model tool', async () => {
    const ext = vscode.extensions.getExtension('poc.poc-vscode-addin');
    assert.ok(ext);
    await ext.activate();
    assert.ok(vscode.lm, 'Language model API should be available');
    assert.ok(
      vscode.lm.tools.some((tool) => tool.name === 'pocCreateSkill'),
      'pocCreateSkill tool should be registered'
    );
  });

  test('Should register the ask-questions language model tool', async () => {
    const ext = vscode.extensions.getExtension('poc.poc-vscode-addin');
    assert.ok(ext);
    await ext.activate();
    assert.ok(vscode.lm, 'Language model API should be available');
    assert.ok(
      vscode.lm.tools.some((tool) => tool.name === 'pocAskQuestions'),
      'pocAskQuestions tool should be registered'
    );
  });

  test('Should register the terminal language model tool', async () => {
    const ext = vscode.extensions.getExtension('poc.poc-vscode-addin');
    assert.ok(ext);
    await ext.activate();
    assert.ok(vscode.lm, 'Language model API should be available');
    assert.ok(
      vscode.lm.tools.some((tool) => tool.name === 'pocRunTerminal'),
      'pocRunTerminal tool should be registered'
    );
  });

  test('Should register the open-page language model tool', async () => {
    const ext = vscode.extensions.getExtension('poc.poc-vscode-addin');
    assert.ok(ext);
    await ext.activate();
    assert.ok(vscode.lm, 'Language model API should be available');
    assert.ok(
      vscode.lm.tools.some((tool) => tool.name === 'pocOpenBrowserPage'),
      'pocOpenBrowserPage tool should be registered'
    );
  });

  test('Should register the memory language model tools', async () => {
    const ext = vscode.extensions.getExtension('poc.poc-vscode-addin');
    assert.ok(ext);
    await ext.activate();
    assert.ok(vscode.lm, 'Language model API should be available');
    assert.ok(
      vscode.lm.tools.some((tool) => tool.name === 'pocReadMemory'),
      'pocReadMemory tool should be registered'
    );
    assert.ok(
      vscode.lm.tools.some((tool) => tool.name === 'pocAppendMemory'),
      'pocAppendMemory tool should be registered'
    );
  });

  test('Should invoke the date/time language model tool', async () => {
    const ext = vscode.extensions.getExtension('poc.poc-vscode-addin');
    assert.ok(ext);
    await ext.activate();
    assert.ok(vscode.lm, 'Language model API should be available');
    const result = await vscode.lm.invokeTool('pocDateTime', {
      input: {},
      toolInvocationToken: undefined
    });
    const text = result.content
      .map((part) => (part instanceof vscode.LanguageModelTextPart ? part.value : ''))
      .join('');
    assert.match(text, /ISO \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });
});
