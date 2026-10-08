# froggy-agent

Froggy Agent is a VS Code extension (TypeScript) that contributes a sidebar
tree view and a central Ask AI panel with two-way message passing.

## What it demonstrates

- Activity-bar container (`Froggy Agent`) with four tree views, each with its own
  collapsible header like the standard Explorer: `Ask AI`, `Sessions`,
  `Files` and `Skills`.
- `Ask AI` holds `Main chat`, `Memory` (`<workspace>/memory.md`) and
  `Open Browser` (starts the watched browser),
  `Sessions` lists chat sessions (newest first, main chat excluded) with an
  `Archive` node, `Files` lists
  `<workspace>/data` files and subfolders with explorer-like actions (new
  file/folder, drag & drop, copy, paste, rename, delete, reveal in OS
  explorer, copy path), and `Skills`
  lists `<workspace>/.github/skills/*/SKILL.md` folders using the first
  `# Title`. Right-click Delete moves a skill or a session to the view's
  `Archive` node (skills are kept outside `.github`, invisible to the
  model), where it can be restored or deleted permanently. The Files
  context menu contains only these actions. The built-in skills
  (`browser-search`, `count-words`, `skill-factory`) show a `built-in` marker
  with a package icon and cannot be archived or deleted.
- Central `Ask AI` panel: simplified Copilot-style UI with no agent/tool
  pickers (model from the `froggy-agent.model` setting, `auto` by
  default — any provider works, including Ollama), showing
  `Thinking...` while the model responds. The effective model
  is shown in the panel badge. Sessions persist in
  `globalState` and reopen with their full transcript. Agent mode: the model
  can call tools silently — tool calls never appear in the panel, only a
  one-line running status (`Building the skill…`) with a still-running
  heartbeat on slow runs. Multi-turn answers are paragraph-separated, so step
  sentences never glue together. Builtins:
  date/time, read/list files in `<workspace>/data` (paths the user mentions
  resolve inside `data/` implicitly: relative only, `..` rejected), Google
  search and opening any page in the Simple Browser, internet search with
  page fetch (explicit "using internet" requests are researched and
  summarized with sources), watched-browser observe, memory read/append
  (`<workspace>/memory.md`), the skill runner
  (`.github/skills/<name>/run.py`), the skill factory (new skills built by a
  Python-dev sub-agent), the terminal runner (shell commands
  from the workspace root, confirmed in-chat) and the files-view refresh
  (the model calls it after creating, modifying, moving, renaming or
  deleting files, so the Files view lists the change); extra tool names from the
  `froggy-agent.tools` setting (empty by default: builtins only, so every
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
- Commands: `Froggy Agent: Say Hello` shows a message, `Froggy Agent: Ask AI` opens the last
  session, `Froggy Agent: New Discussion` starts one, `Froggy Agent: Clear Discussion` empties
  the open discussion (transcript and tool history; Stop first if an answer
  is running), `Froggy Agent: Open Main Chat` opens the
  special main chat session (never listed in `Sessions`), `Froggy Agent: Refresh Explorer`
  refreshes the views, `Froggy Agent: Setup Project` scaffolds a fresh
  workspace (see Project setup).

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

- `froggy-agent.model` — chat model for Ask AI (`auto` by default: the
  first available model). Set it to a model id, name, family or
  `vendor/family` to pin a model, e.g. an Ollama model from the model picker.
  The effective model is shown in the panel badge; an unknown value fails
  with the list of available models. Agent behavior (tool calls) is offered
  to every model, but only models with function-calling support will use it
  (e.g. `qwen3:8b` under Ollama).
- `froggy-agent.tools` — extra tool names offered to the model, on top of
  the builtins (default: `[]`, builtins only). Unknown names are silently
  ignored. External action tools (e.g. Copilot's browser or terminal tools)
  may show VS Code's own popup in addition to the in-chat card, so only add
  names you need. The model gets no other access to the machine than the
  tools it is offered.
- `froggy-agent.confirmTools` — tool names asking for an in-chat
  Continue/Cancel confirmation card before running (default:
  `froggyRunTerminal`, `run_in_terminal`, `send_to_terminal`, `froggyRunSkill`,
  `froggyCreateSkill`).
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
`run.py` (command-line script, standard library only), dry-runs the script
in a staging folder (`run.py --help` must exit 0, fixed over up to 3
write→run→fix attempts), and hands the new skill back —
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

Web search: when the user asks to use the internet (`#webSearch`), the model
searches (instant answers with sources, market quotes for known indices,
stocks, commodities and crypto, Wikipedia matches) and summarizes the
results with their sources; it reads a promising result in full via
`#fetchWebPage` (public pages only, truncated to 8KB). Plain questions
never trigger a search — only explicit internet requests do.

Watched browser: the Simple Browser is opaque to the agent (another
extension's webview, no URL or DOM access), so "what do you see on my page?"
is answered from a real external browser driven by Playwright
(`#browseState`: URL, title, post-JavaScript text truncated to 8KB, recent
console errors; `#browseOpen` navigates it; `#browseScreenshot` sends a PNG
to vision-capable models). The first call starts system Chrome or Edge when
installed, the downloaded bundled Chromium otherwise, in a visible window
the user drives; logins persist in `<workspace>/.froggy-browser/`
(gitignored, never committed). An `Open Browser` row below `Memory` in
the Ask AI view starts it on demand. The browser launches with the Chromium
sandbox kept on and no automation switches (no `--no-sandbox` or
unsupported-flag banner); `navigator.webdriver` is masked in-page instead,
so sign-in pages that refuse automation-driven browsers (notably Google)
accept it.

Project setup: on a virgin folder (no `memory.md`, `data/` or
`.github/skills/`) the extension offers to scaffold a project; `Froggy Agent:
Setup Project` runs it any time. Setup creates `data/`, `memory.md` (bare
`# Memory` header), the built-in skills (`browser-search`, `count-words`,
`skill-factory`), `.vscode/settings.json` (`auto` model, builtins-only tools,
Markdown preview), `.gitignore` entries and the workspace `.venv` — only
missing pieces are created, existing files are never overwritten. Built-in
skills are standard library only (no `requirements.txt` to install) and are
marked `built-in` in the Skills view, where they cannot be archived or
deleted. When no Python interpreter exists, setup alerts instead of creating
the `.venv`.

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
  per sidebar view (markdown files open in Preview via `froggy-agent.openPreview`)
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
- `src/searchTool.ts` + `src/searchUrl.ts` — `froggyGoogleSearch` language model tool
  (`#googleSearch`), opens a Google search in the Simple Browser (unit-tested)
- `src/openPageTool.ts` + `src/openPage.ts` — `froggyOpenBrowserPage` language model
  tool (`#openPage`), opens any http(s) page in the Simple Browser (unit-tested)
- `src/webSearchTool.ts` + `src/webSearch.ts` — `froggyWebSearch` language model
  tool (`#webSearch`), searches the internet (instant answers, market quotes,
  Wikipedia) and returns readable results to summarize (unit-tested)
- `src/fetchPageTool.ts` + `src/fetchPage.ts` — `froggyFetchWebPage` language model
  tool (`#fetchWebPage`), fetches a public page as text for the model to read
  (local URLs refused); `src/htmlText.ts` holds the shared HTML-to-text
  helpers (unit-tested)
- `src/browseWatchTool.ts` + `src/browseWatch.ts` — `froggyBrowseOpen`
  (`#browseOpen`), `froggyBrowseState` (`#browseState`) and
  `froggyBrowseScreenshot` (`#browseScreenshot`) language model tools:
  navigate, read (URL, title, post-JS text, console errors) and screenshot
  the watched external browser (unit-tested)
- `src/browseWatchDriver.ts` — Playwright persistent context in
  `<workspace>/.froggy-browser/`: system Chrome/Edge first, bundled
  Chromium fallback, console-error capture
- `src/memoryTool.ts` + `src/memory.ts` — `froggyReadMemory` (`#readMemory`)
  and `froggyAppendMemory` (`#appendMemory`) language model tools, read and
  append one-line facts in `<workspace>/memory.md` (unit-tested)
- `src/dateTimeTool.ts` + `src/dateTime.ts` — `froggyDateTime` language model tool
  (`#dateTime`), returns the current date and time (unit-tested)
- `src/dataFilesTool.ts` + `src/dataFiles.ts` — `froggyReadDataFile`
  (`#readDataFile`) and `froggyListDataFiles` (`#listDataFiles`) language model
  tools, scoped to `<workspace>/data` with relative paths (unit-tested)
- `src/skillRunTool.ts` + `src/skillRun.ts` — `froggyRunSkill` language model
  tool (`#runSkill`), runs `.github/skills/<name>/run.py` with the project
  `.venv` or PATH `python`, plus the per-request runnable-skill catalog hint
  (unit-tested)
- `src/skillExec.ts` — shared Python execution (script runs, pip installs,
  syntax checks) for the skill runner and the factory dry-run
- `src/defaultSkills.ts` — built-in skill templates embedded in the
  extension (`browser-search`, `count-words`, `skill-factory`), written by
  project setup (unit-tested)
- `src/projectSetup.ts` + `src/projectSetupCommands.ts` — fresh-project
  scaffold (structure, settings, `.venv`, virgin-folder prompt) and the
  `Setup Project` command (unit-tested)
- `src/skillCreateTool.ts` + `src/skillCreate.ts` — `froggyCreateSkill` language
  model tool (`#createSkill`), skill factory: a Python-dev sub-agent builds
  `.github/skills/<name>/SKILL.md` + `run.py`, dry-run in a staging folder
  (write→run→fix loop) before saving (unit-tested)
- `src/pythonEnv.ts` — workspace Python probe, `.venv` creation,
  `.gitignore` update and requirements fingerprint (unit-tested)
- `src/pythonEnvSetup.ts` — shared Python ensure (probe, `.venv`,
  `.gitignore`) for the skill factory and runner
- `src/askQuestionsTool.ts` + `src/askQuestions.ts` — `froggyAskQuestions`
  language model tool (`#askQuestions`), structured user questions with an
  in-chat answer card (unit-tested)
- `src/terminalTool.ts` + `src/terminal.ts` — `froggyRunTerminal` language model
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
