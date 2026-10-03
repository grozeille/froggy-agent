# poc-vscode-addin

Proof of concept: a VS Code extension (TypeScript) that contributes a sidebar
tree view and a central Ask AI panel with two-way message passing.

## What it demonstrates

- Activity-bar container (`POC`) with four tree views, each with its own
  collapsible header like the standard Explorer: `Ask AI`, `Sessions`,
  `Files` and `Skills`.
- `Ask AI` holds `New discussion` and `Memory` (`<workspace>/memory.md`),
  `Sessions` lists chat sessions (newest first), `Files` lists
  `<workspace>/data` files and subfolders with explorer-like actions (new
  file/folder, drag & drop, copy, paste, rename, delete, reveal in OS
  explorer, copy path), and `Skills`
  lists `<workspace>/.github/skills/*/SKILL.md` folders using the first
  `# Title`. The Files context menu contains only these actions.
- Central `Ask AI` panel: simplified Copilot-style UI with no agent/tool/model
  pickers (model auto via `vscode.lm.selectChatModels()`), showing
  `Processing your request...` while the model responds. Sessions persist in
  `globalState` and reopen with their full transcript. Agent mode: the model
  can call tools (date/time, read/list files in `<workspace>/data`) silently
  — tool calls never appear in the panel. Files the user mentions are
  resolved inside `data/` implicitly (relative paths only, `..` rejected).
  The model receives the last 20 messages for follow-up context, and
  responses render as Markdown (bold, code, tables, links).
- `WebviewPanel` with a strict Content Security Policy (nonce + `cspSource`).
- Two-way messaging: webview `postMessage` -> extension `onDidReceiveMessage`,
  and extension `postMessage` -> webview `message` listener.
- Theming through `var(--vscode-*)` CSS variables (no hardcoded palette).
- Commands: `POC: Say Hello` shows a message, `POC: Ask AI` opens the last
  session, `POC: New Discussion` starts one, `POC: Refresh Explorer` refreshes
  the views.

## Run it

```sh
npm install
```

Then press `F5` in VS Code (launch config `Run Extension`). The Extension
Development Host opens the `demo-project/` folder as its workspace, so the
sidebar shows its `data/` files and `.github/skills`. Click the `POC` icon in
the activity bar.

## Scripts

- `npm run compile` — typecheck and emit to `out/`
- `npm run watch` — incremental rebuild on save
- `npm run lint` — eslint over `src/`
- `npm run test:unit` — mocha unit tests for the pure logic (no display needed)
- `npm test` — extension-host integration tests (needs a display / desktop session)

## Message protocol

Webview -> extension (`src/askAi.ts`, validated by `isAskAiMessage`):

- `{ command: 'ask', prompt: string, sessionId: string }`

Extension -> webview (each message carries its `sessionId`):

- `{ command: 'transcript', messages: [...] }` (full history on session open)
- `{ command: 'status', text: string }`
- `{ command: 'chunk', text: string }` (streamed response parts)
- `{ command: 'done' }`
- `{ command: 'error', message: string }`

## Project layout

- `src/extension.ts` — activation, provider + command registration
- `src/askAiActionsProvider.ts`, `src/sessionsProvider.ts`,
  `src/filesProvider.ts`, `src/skillsProvider.ts` — one `TreeDataProvider`
  per sidebar view (markdown files open in Preview via `poc-vscode-addin.openPreview`)
- `src/fileCommands.ts` — Files view actions: new file/folder, copy/paste/rename/delete/reveal/copy path
- `src/filesProvider.ts` — recursive `data/` listing + drag & drop controller (`Files` view)
- `src/treeItems.ts` — shared tree item helpers
- `src/sections.ts` — Ask AI action labels (unit-tested)
- `src/files.ts` — `isMarkdownFile` helper (unit-tested)
- `src/skills.ts` — `extractSkillTitle` from `SKILL.md` (unit-tested)
- `src/AskAiPanel.ts` — central `WebviewPanel`, `vscode.lm` auto-model chat (no tools)
- `src/askAi.ts` — Ask AI message validation (unit-tested)
- `src/sessions.ts` — session types and titles (unit-tested)
- `src/sessionStore.ts` — session persistence in `globalState`
- `src/searchTool.ts` + `src/searchUrl.ts` — `pocGoogleSearch` language model tool
  (`#googleSearch`), opens a Google search in the Simple Browser (unit-tested)
- `src/dateTimeTool.ts` + `src/dateTime.ts` — `pocDateTime` language model tool
  (`#dateTime`), returns the current date and time (unit-tested)
- `src/dataFilesTool.ts` + `src/dataFiles.ts` — `pocReadDataFile`
  (`#readDataFile`) and `pocListDataFiles` (`#listDataFiles`) language model
  tools, scoped to `<workspace>/data` with relative paths (unit-tested)
- `demo-project/` — sample workspace opened by the debug host: `memory.md`,
  `data/` files and `.github/skills/` (incl. `browser-search`: Copilot skill
  to search Google in VS Code)
- `media/askAi.js`, `media/askAi.css` — Ask AI panel script and styles
- `media/markdown.js` — dependency-free Markdown renderer (unit-tested)
- `src/urls.ts` — safe external-link gate (unit-tested)
- `src/test/unit/` — mocha unit tests, `src/test/suite/` — host integration tests

Before publishing, change `publisher` in `package.json` from the `poc` placeholder.
