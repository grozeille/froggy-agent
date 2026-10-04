import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

interface ViewDef {
  id: string;
  name: string;
}

interface ViewContainerDef {
  id: string;
  title: string;
}

interface PackageJson {
  contributes?: {
    viewsContainers?: {
      activitybar?: ViewContainerDef[];
    };
    views?: {
      pocSidebar?: ViewDef[];
    };
  };
}

function readPackageJson(): PackageJson {
  const file = path.join(__dirname, '..', '..', '..', 'package.json');
  return JSON.parse(fs.readFileSync(file, 'utf8')) as PackageJson;
}

suite('views', () => {
  test('sidebar contributes Ask AI, Sessions, Files and Skills views in order', () => {
    const views = readPackageJson().contributes?.views?.pocSidebar ?? [];
    assert.deepStrictEqual(
      views.map((view) => view.name),
      ['Ask AI', 'Sessions', 'Files', 'Skills']
    );
    assert.deepStrictEqual(
      views.map((view) => view.id),
      ['pocAskAiView', 'pocSessionsView', 'pocFilesView', 'pocSkillsView']
    );
  });

  test('activity bar container is titled Froggy Agent', () => {
    const containers = readPackageJson().contributes?.viewsContainers?.activitybar ?? [];
    const sidebar = containers.find((container) => container.id === 'pocSidebar');
    assert.strictEqual(sidebar?.title, 'Froggy Agent');
  });
});
