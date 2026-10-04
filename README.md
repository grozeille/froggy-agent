# poc-vscode-addin

Proof of concept: a VS Code extension (TypeScript) that contributes a sidebar
tree view and a central Ask AI panel with two-way message passing.

## What it demonstrates

- Activity-bar container (`Froggy Agent`) with four tree views, each with its own
  collapsible header like the standard Explorer: `Ask AI`, `Sessions`,
  `Files` and `Skills`.
- `Ask AI` holds `Main chat` and `Memory` (`<workspace>/memory.md`),
  `Sessions` lists chat sessions (newest first, main chat excluded) with an
  `Archive` node, `Files` lists
  `<workspace>/data` files and subfolders with explorer-like actions (new
  file/folder, drag & drop, copy, paste, rename, delete, reveal in OS
  explorer, copy path), and `Skills`
  lists `<workspace>/.github/skills/*/SKILL.md` folders using the first
  `# Title`. Right-click Delete moves a skill or a session to the view's
  `Archive` node (skills are kept outside `.github`, invisible to the
  model), where it can be restored or deleted permanently. The Files
  context menu contains only these actions.
- Central `Ask AI` panel: simplified Copilot-style UI with no agent/tool
  pickers (model from the `poc-vscode-addin.model` setting, `auto` by
  default — any provider works, including Ollama), showing
  `Thinking...` while the model responds. The effective model
  is shown in the panel badge. Sessions persist in
  `globalState` and reopen with their full transcript. Agent mode: the model
  can call tools silently — tool calls never appear in the panel. Builtins:
  date/time, read/list files in `<workspace>/data` (paths the user mentions
  resolve inside `data/` implicitly: relative only, `..` rejected), Google
  search and opening any page in the Simple Browser, memory read/append
  (`<workspace>/memory.md`), the skill runner
  (`.github/skills/<name>/run.py`), the skill factory (new skills built by a
  Python-dev sub-agent), and the terminal runner (shell commands
  from the workspace root, confirmed in-chat); extra tool names from the
  `poc-vscode-addin.tools` setting (empty by default: builtins only, so every
  confirmation happens in-chat and no native popup ever shows). After a
  question that ran tools, a "See action
  logs..." link opens the session's runs (tool, input, decision, commands, output) in
  a new tab. The model receives the last 20 messages for follow-up context,
  with past tool calls and their results replayed so it does not redo
  previous turns' actions, and responses render as Markdown (bold, code,
  tables, links). When VS Code lost the focus, a finished answer, a question
  card or a confirmation card also raises a native Windows toast (a VS Code
  notification with an `Open Chat` action where native toasts don't exist).
- `WebviewPanel` with a strict Content Security Policy (nonce + `cspSource`).
- Two-way messaging: webview `postMessage` -> extension `onDidReceiveMessage`,
  and extension `postMessage` -> webview `message` listener.
- Theming through `var(--vscode-*)` CSS variables (no hardcoded palette).
- Commands: `POC: Say Hello` shows a message, `POC: Ask AI` opens the last
  session, `POC: New Discussion` starts one, `POC: Clear Discussion` empties
  the open discussion (transcript and tool history; Stop first if an answer
  is running), `POC: Open Main Chat` opens the
  special main chat session (never listed in `Sessions`), `POC: Refresh Explorer`
  refreshes the views.

## Run it

```sh
npm install
```

Then press `F5` in VS Code (launch config `Run Extension`). The Extension
Development Host opens the `demo-project/` folder as its workspace, so the
sidebar shows its `data/` files and `.github/skills`. Click the `Froggy Agent` icon in
the activity bar.

## Scripts

- `npm run compile` — typecheck and emit to `out/`
- `npm run watch` — incremental rebuild on save
- `npm run lint` — eslint over `src/`
- `npm run test:unit` — mocha unit tests for the pure logic (no display needed)
- `npm test` — extension-host integration tests (needs a display / desktop session)

## Settings

- `poc-vscode-addin.model` — chat model for Ask AI (`auto` by default: the
  first available model). Set it to a model id, name, family or
  `vendor/family` to pin a model, e.g. an Ollama model from the model picker.
  The effective model is shown in the panel badge; an unknown value fails
  with the list of available models. Agent behavior (tool calls) is offered
  to every model, but only models with function-calling support will use it
  (e.g. `qwen3:8b` under Ollama).
- `poc-vscode-addin.tools` — extra tool names offered to the model, on top of
  the builtins (default: `[]`, builtins only). Unknown names are silently
  ignored. External action tools (e.g. Copilot's browser or terminal tools)
  may show VS Code's own popup in addition to the in-chat card, so only add
  names you need. The model gets no other access to the machine than the
  tools it is offered.
- `poc-vscode-addin.confirmTools` — tool names asking for an in-chat
  Continue/Cancel confirmation card before running (default:
  `pocRunTerminal`, `run_in_terminal`, `send_to_terminal`, `pocRunSkill`,
  `pocCreateSkill`).
  Reads outside `<workspace>/data` are only possible through these tools;
  `[]` disables confirmation. Leaving the session while a confirmation is
  pending denies it. The card shows a plain question plus what will run
  (command + one-line explanation, skill + arguments). Structured model
  questions render as an answer card with clickable options.

Executable skills: a skill folder with a `run.py` next to its `SKILL.md` can
be run by the model (`#runSkill`, empty skill lists the runnable ones).
Every request includes the runnable skill catalog (folder name plus the
`description:` frontmatter), so a matching request routes to the skill runner
instead of the terminal — no need to name the skill explicitly. Scripts run
with `<workspace>/.venv` Python when present, else PATH `python`, from the
workspace root (so `data/...` paths work), with a 60s timeout; only their
truncated output returns to the model. A skill may also ship `requirements.txt`
(one pinned package per line): the runner installs it into the workspace
`.venv` (created when missing) before running, skipping reinstalls while it
is unchanged.

Skill factory: when the user asks to create a skill or automate a recurring
task, the main chat delegates to a dedicated Python-developer sub-agent
(`#createSkill`, confirmation-gated like the other writers): it ensures the
workspace Python (alerts when Python is missing, creates `.venv` when absent
and ignores it via `.gitignore`), writes `.github/skills/<name>/SKILL.md` plus
`run.py` (command-line script, standard library only), syntax-checks the
script, and hands the new skill back —
immediately runnable via `#runSkill`. The name is derived from the task when
omitted, and existing skills are never overwritten. Tasks describe the goal,
never an implementation: the factory always builds Python. Third-party
packages, when needed, are declared in `requirements.txt` (pinned, one per
line) and installed into the `.venv` at run time.

Terminal commands: the model runs shell commands from the workspace root
(`#runTerminal`) with a 60s timeout; only their truncated output returns to
the model. The builtin runner replaces the external `run_in_terminal` /
`send_to_terminal` tools: when it is available they are not offered to the
model, so a command asks once (in-chat card) instead of twice (card +
VS Code's own popup, which cannot be suppressed for external tools).

Memory: when the user asks to remember something (`#appendMemory`), the model
appends one short fact per call to `<workspace>/memory.md` (created with a
`# Memory` header when missing, capped at 20KB); when the user asks what is
remembered, it reads the file back (`#readMemory`). Appending is not gated:
memorizing stays a one-step answer.

## Message protocol

Webview -> extension (`src/askAi.ts`):

- `{ command: 'ask', prompt: string, sessionId: string }`
- `{ command: 'confirmResult', id: string, approved: boolean }` (in-chat confirmation answer)
- `{ command: 'answerResult', id: string, answers: [...] | null }` (in-chat question answers, null when dismissed)
- `{ command: 'openActionLog', sessionId: string }` (open the session's action log tab)
- `{ command: 'stop', sessionId: string }` (abort the in-flight ask, keeps partial answer)

Extension -> webview (each message carries its `sessionId`):

- `{ command: 'transcript', messages: [...], busy: boolean }` (full history on session open; busy locks the input while that session still works)
- `{ command: 'model', name: string }` (effective model, shown in the badge)
- `{ command: 'confirm', id: string, title: string, detail: string }` (in-chat confirmation card)
- `{ command: 'question', id: string, questions: [...] }` (in-chat question card)
- `{ command: 'actionLog' }` (shows the "See action logs..." link when tools ran)
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
- `src/skills.ts` — `extractSkillTitle` and frontmatter `description` from `SKILL.md` (unit-tested)
- `src/AskAiPanel.ts` — central `WebviewPanel`, `vscode.lm` agent chat (builtins + `tools` setting)
- `src/askAi.ts` — Ask AI message validation (unit-tested)
- `src/notify.ts` — unfocused-window attention popup texts (unit-tested)
- `src/winToast.ts` — native Windows toast via WinRT, no dependency (unit-tested)
- `src/sessions.ts` — session types, titles, the special main chat session and history replay with past tool runs (unit-tested)
- `src/modelSelection.ts` — picks the chat model from the `model` setting (unit-tested)
- `src/toolSelection.ts` — resolves builtins + `tools` setting names, friendly confirmation text, external-terminal supersede (unit-tested)
- `src/agentEnv.ts` — unsaved per-request preamble: OS/shell match + default-to-terminal nudge (unit-tested)
- `src/actionLog.ts` — per-session tool-run journal, opened as a text tab (unit-tested)
- `src/sessionStore.ts` — session persistence in `globalState`
- `src/searchTool.ts` + `src/searchUrl.ts` — `pocGoogleSearch` language model tool
  (`#googleSearch`), opens a Google search in the Simple Browser (unit-tested)
- `src/openPageTool.ts` + `src/openPage.ts` — `pocOpenBrowserPage` language model
  tool (`#openPage`), opens any http(s) page in the Simple Browser (unit-tested)
- `src/memoryTool.ts` + `src/memory.ts` — `pocReadMemory` (`#readMemory`)
  and `pocAppendMemory` (`#appendMemory`) language model tools, read and
  append one-line facts in `<workspace>/memory.md` (unit-tested)
- `src/dateTimeTool.ts` + `src/dateTime.ts` — `pocDateTime` language model tool
  (`#dateTime`), returns the current date and time (unit-tested)
- `src/dataFilesTool.ts` + `src/dataFiles.ts` — `pocReadDataFile`
  (`#readDataFile`) and `pocListDataFiles` (`#listDataFiles`) language model
  tools, scoped to `<workspace>/data` with relative paths (unit-tested)
- `src/skillRunTool.ts` + `src/skillRun.ts` — `pocRunSkill` language model
  tool (`#runSkill`), runs `.github/skills/<name>/run.py` with the project
  `.venv` or PATH `python`, plus the per-request runnable-skill catalog hint
  (unit-tested)
- `src/skillCreateTool.ts` + `src/skillCreate.ts` — `pocCreateSkill` language
  model tool (`#createSkill`), skill factory: a Python-dev sub-agent builds
  `.github/skills/<name>/SKILL.md` + `run.py`, syntax-checked before saving
  (unit-tested)
- `src/pythonEnv.ts` — workspace Python probe, `.venv` creation,
  `.gitignore` update and requirements fingerprint (unit-tested)
- `src/pythonEnvSetup.ts` — shared Python ensure (probe, `.venv`,
  `.gitignore`) for the skill factory and runner
- `src/askQuestionsTool.ts` + `src/askQuestions.ts` — `pocAskQuestions`
  language model tool (`#askQuestions`), structured user questions with an
  in-chat answer card (unit-tested)
- `src/terminalTool.ts` + `src/terminal.ts` — `pocRunTerminal` language model
  tool (`#runTerminal`), runs a shell command from the workspace root with a
  60s timeout (unit-tested)
- `demo-project/` — sample workspace opened by the debug host: `memory.md`,
  `data/` files and `.github/skills/` (incl. `browser-search`: Copilot skill
  to search Google in VS Code; `count-words`: runnable skill counting a
  file's lines/words/characters; `skill-factory`: build new skills via
  `#createSkill`)
- `media/askAi.js`, `media/askAi.css` — Ask AI panel script and styles
- `media/markdown.js` — dependency-free Markdown renderer (unit-tested)
- `src/urls.ts` — safe external-link gate (unit-tested)
- `src/test/unit/` — mocha unit tests, `src/test/suite/` — host integration tests

Before publishing, change `publisher` in `package.json` from the `poc` placeholder.
