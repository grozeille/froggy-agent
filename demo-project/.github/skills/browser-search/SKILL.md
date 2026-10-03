---
name: browser-search
description: Open a browser inside VS Code and run a Google search for what the user asks about. Use when the user wants to search the web, look something up, or google a question.
---

# Browser Search

Open a browser inside VS Code and search Google for what the user asks.

## When to use

- The user asks to search the web, google something, or look up information online.
- The user asks to open a browser without leaving VS Code.

## How to do it

1. Take the user's question or topic and turn it into a short search query.
2. Call the `#googleSearch` tool with that query.
3. The tool opens `google.com` search results in the VS Code Simple Browser.
4. Confirm to the user what you searched for.

## Rules

- Always use the `#googleSearch` tool so the browser opens **inside VS Code**.
  Do not open an external browser and do not run terminal commands to open URLs.
- Keep the query short: a few keywords, no full sentences.
- If the user's request is not a search (e.g. they want you to write code),
  do the task directly instead of searching.

## Example

User: "search for the VS Code Simple Browser docs"

Tool call: `#googleSearch` with `query: "VS Code Simple Browser docs"`

Reply: "I opened a Google search for 'VS Code Simple Browser docs' in VS Code."
