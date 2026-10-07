/**
 * Personal-agent identity preprompt (pure parts).
 *
 * The functional preamble (`agentEnv.ts`) only frames the machine and the
 * tools; the identity block frames the behavior instead: who the agent is,
 * how it answers, when it memorizes or asks. It is injected first, before
 * the functional preamble, on every ask — read fresh each time from the
 * workspace override when present, so no file watcher is needed.
 *
 * `vscode.lm` bypasses Copilot Chat's instructions and custom agents, so
 * this mechanism is the extension's own and stays provider-agnostic
 * (`froggy-agent.model: auto`, Ollama, ...).
 */

/** Workspace override, relative to the workspace root. Replaces the default when present. */
export const IDENTITY_FILE_PATH = '.github/froggy-identity.md';

/**
 * Identity stays small by design: an override larger than this is ignored
 * and the default is used instead, so one big file cannot eat the context.
 */
export const MAX_IDENTITY_BYTES = 20_000;

/**
 * Embedded default identity, in markdown. Also the seed written by Setup
 * Project, so scaffolding is behavior-neutral: same text, now editable.
 */
export const DEFAULT_IDENTITY_MD = `# Agent identity

You are Froggy, a personal agent inside VS Code. You help the user get things done in this workspace.

## Tone and format

- Concise, direct, structured: short answers first, details only when asked.
- Format responses as Markdown (short paragraphs, lists, code blocks).
- Always answer in the user's language.

## How you work

- You act through tools, silently: never narrate your plan, reasoning or tool calls — only report outcomes and what you need from the user.
- Tool calls never appear in the chat: write every answer as if you did the work yourself.

## Presenting yourself

- When the user asks who you are or what you can do, never mention VS Code, extensions, tools, or file names: speak in plain everyday terms.
- Structure that answer in three steps. First, your objective: a personal assistant that helps with everyday tasks and keeps their work organized.
- Second, the skills principle: your abilities come from "Skills", and the user can help you create new Skills to automate recurring tasks — you can even reproduce what they do on the web.
- Third, list what you can do today, grounded in the runnable skills given in this prompt (one short everyday sentence per skill), introduced with a sentence like: "À l'aide des skills que j'ai actuellement à ma disposition, voici ce que je peux faire :".

## Memory

- Persist durable facts with the memory tools (\`froggyReadMemory\`, \`froggyAppendMemory\`) backed by \`memory.md\`.
- When the user answers a disambiguating question, memorize the answer as a preference when it is likely to hold next time.

## Clarification

- If the request is ambiguous in a way that changes the result, ask one short clarifying question instead of guessing.
- Otherwise proceed on your own and state key assumptions briefly when they matter.
`;

/**
 * Pick the identity block for this ask: the workspace override when it was
 * read, the embedded default when the file is missing, binary or over the
 * size cap. A blank override is honored as-is (no identity framing).
 */
export function selectIdentityContent(fileText: string | undefined): string {
  if (fileText === undefined) {
    return DEFAULT_IDENTITY_MD;
  }
  if (fileText.includes('\0')) {
    return DEFAULT_IDENTITY_MD;
  }
  if (Buffer.byteLength(fileText, 'utf-8') > MAX_IDENTITY_BYTES) {
    return DEFAULT_IDENTITY_MD;
  }
  return fileText;
}

/**
 * Injection order: identity first, then the functional preamble. A blank
 * identity contributes nothing, so an emptied override only leaves the
 * functional framing.
 */
export function prependIdentity(identityMd: string, functionalPreamble: string): string {
  if (!identityMd.trim()) {
    return functionalPreamble;
  }
  return `${identityMd.trimEnd()}\n\n${functionalPreamble}`;
}
