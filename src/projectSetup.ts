/** Fresh-project setup: scaffold contents and decisions (pure parts). */

import { MODEL_SETTING_DEFAULT } from './modelSelection';
import { BROWSE_GITIGNORE_ENTRY } from './browseWatch';

/** Command id, must match the contribution in package.json. */
export const SETUP_COMMAND_ID = 'froggy-agent.setupProject';

/** Workspace folders/files the setup creates (relative to the workspace root). */
export const DATA_DIR_NAME = 'data';
export const VSCODE_SETTINGS_PATH = '.vscode/settings.json';
export const GITIGNORE_FILE_NAME = '.gitignore';

/** `workspaceState` flag remembering the user dismissed the setup prompt. */
export const SETUP_DISMISSED_KEY = 'froggy-agent.setupDismissed';

/** Offer text shown when the extension activates on a folder without markers. */
export const SETUP_PROMPT_MESSAGE =
  'This folder is not a Froggy Agent project yet. ' +
  'Set it up with memory.md, a data folder, an editable agent identity ' +
  'and the built-in skills?';
export const SETUP_PROMPT_ACTION = 'Setup Project';
export const SETUP_DISMISS_ACTION = 'Not now';

/** Setup without an open folder cannot scaffold anything. */
export const SETUP_NO_WORKSPACE_MESSAGE =
  'Open a folder first, then run Froggy Agent: Setup Project.';

/** Note appended to the summary when the workspace `.venv` was already there. */
export const SETUP_VENV_REUSED_NOTE = ' The existing workspace .venv was reused.';

/** Note appended to the summary when no Python interpreter exists at all. */
export const SETUP_PYTHON_MISSING_NOTE =
  ' Python was not found: install Python 3, then run Setup Project again.';

/**
 * Initial `memory.md`: the `# Memory` header only, matching what the memory
 * tool writes when the file is missing. No guidance text: the whole file is
 * shown to the model on read.
 */
export const MEMORY_SEED_CONTENT = '# Memory\n\n';

/** `.gitignore` entries the setup ensures (same set as the demo project). */
export const SETUP_GITIGNORE_ENTRIES: readonly string[] = [
  '.venv/',
  '__pycache__/',
  '*.py[cod]',
  BROWSE_GITIGNORE_ENTRY
];

/**
 * Fresh-project `.vscode/settings.json`: Markdown preview association, the
 * `auto` chat model (same as the extension default, pinned per project) and
 * the builtins-only tools default. Written only when the file is missing:
 * existing settings are never touched.
 */
export function buildSettingsContent(): string {
  return (
    JSON.stringify(
      {
        'workbench.editorAssociations': {
          '*.md': 'vscode.markdown.preview.editor'
        },
        'froggy-agent.model': MODEL_SETTING_DEFAULT,
        'froggy-agent.tools': []
      },
      null,
      2
    ) + '\n'
  );
}

/** Which scaffold markers already exist in the workspace. */
export interface ProjectMarkers {
  memory: boolean;
  data: boolean;
  skills: boolean;
}

/**
 * Prompt for setup only on a virgin folder: no `memory.md`, no `data/`, no
 * `.github/skills/`. Anything present means an intentional (possibly partial)
 * structure, or a project from before setup existed: stay silent, the
 * command stays available.
 */
export function shouldPromptProjectSetup(markers: ProjectMarkers): boolean {
  return !markers.memory && !markers.data && !markers.skills;
}

/**
 * One-line setup report: what was created, plus the preformatted Python
 * note (empty when venv creation failed with its own alert).
 */
export function formatSetupSummary(
  created: readonly string[],
  pythonNote: string
): string {
  const base =
    created.length === 0
      ? 'Froggy Agent project is already set up.'
      : `Froggy Agent project ready (created: ${created.join(', ')}).`;
  return `${base}${pythonNote}`;
}
