# Change Log

## Unreleased

- Personal-agent identity preprompt: embedded markdown default injected
  before the functional preamble, overridable per workspace via
  `.github/froggy-identity.md` (20KB cap, read fresh on every ask) and
  scaffolded by Setup Project.
- Project setup: scaffold `memory.md`, `data/`, built-in skills, VS Code
  settings and the `.venv` on virgin folders (`Froggy Agent: Setup Project`);
  built-in skills are marked and cannot be archived or deleted.

## 0.0.1

- Initial release: sidebar counter webview with two-way message passing.
