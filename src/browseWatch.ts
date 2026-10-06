import * as path from 'path';
import { isSafeHttpUrl } from './urls';

/**
 * Watched-browser observation: the agent cannot see pages opened in VS Code's
 * Simple Browser (opaque webview of another extension, no URL or DOM access),
 * so it pilots a real external browser via Playwright and reads it back on
 * demand. Pure parts: channel resolution, profile location, state formatting.
 */

/** Tool names must match the `languageModelTools` contributions in package.json. */
export const BROWSE_OPEN_TOOL_NAME = 'froggyBrowseOpen';
export const BROWSE_STATE_TOOL_NAME = 'froggyBrowseState';
export const BROWSE_SCREENSHOT_TOOL_NAME = 'froggyBrowseScreenshot';

/** Workspace folder holding the persistent Playwright user profile. */
export const BROWSE_PROFILE_DIR_NAME = '.froggy-browser';

/** `.gitignore` entry keeping the browser profile (cookies, logins) untracked. */
export const BROWSE_GITIGNORE_ENTRY = '.froggy-browser/';

/** Page text handed to the model is capped here (with a truncation marker). */
export const BROWSE_MAX_TEXT_CHARS = 8000;

/** Console errors kept per browser session (ring buffer, most recent last). */
export const BROWSE_MAX_CONSOLE_ERRORS_KEPT = 20;

/** Console errors shown in one state report (most recent). */
export const BROWSE_MAX_CONSOLE_ERRORS_SHOWN = 10;

/** One console error line is capped here (with a truncation marker). */
export const BROWSE_MAX_CONSOLE_ERROR_CHARS = 500;

/** Playwright `channel` values for the supported system browsers. */
export type BrowseChannel = 'chrome' | 'msedge';

/** Launch preference: system Chrome, then system Edge, then bundled Chromium. */
export const BROWSE_CHANNEL_PREFERENCE: readonly BrowseChannel[] = ['chrome', 'msedge'];

/** One browser launch attempt: a system channel, or no channel (bundled Chromium). */
export interface BrowseLaunchAttempt {
  readonly channel?: BrowseChannel;
}

/**
 * Ordered launch attempts: prefer the already-installed system browser
 * (Chrome, then Edge) in a visible external window; only fall back to the
 * downloaded bundled Chromium when no compatible browser launched.
 */
export function browseLaunchAttempts(): BrowseLaunchAttempt[] {
  return [...BROWSE_CHANNEL_PREFERENCE.map((channel) => ({ channel })), {}];
}

/** Human label for a launch attempt, used in user-facing messages. */
export function describeBrowseLaunch(attempt: BrowseLaunchAttempt): string {
  if (attempt.channel === 'chrome') {
    return 'Google Chrome';
  }
  if (attempt.channel === 'msedge') {
    return 'Microsoft Edge';
  }
  return 'bundled Chromium';
}

/**
 * Init script evaluated in every watched-browser page: it reports
 * `navigator.webdriver` as false so bot protections (notably Google
 * sign-in) accept the browser. Done in-page rather than with the
 * `--disable-blink-features=AutomationControlled` switch, which Chrome
 * banners as an unsupported command-line flag.
 */
export const BROWSE_WEBDRIVER_INIT_SCRIPT =
  "Object.defineProperty(navigator, 'webdriver', { get: () => false });";

/**
 * Playwright default args filtered out of the watched browser launch.
 * `--enable-automation` shows the "controlled by automated software"
 * infobar and feeds the same bot detections; filtering it is a no-op when
 * Playwright does not pass it.
 */
export const BROWSE_LAUNCH_IGNORE_DEFAULT_ARGS: readonly string[] = [
  '--enable-automation'
];

/** Full launch options for one watched-browser attempt (pure, unit-tested). */
export interface BrowseLaunchOptions {
  readonly channel?: BrowseChannel;
  readonly headless: false;
  /**
   * Keep the Chromium sandbox enabled. Playwright disables it by default
   * (it pushes `--no-sandbox`), which Chrome banners as an unsupported
   * flag; the watched browser is user-driven, so it needs no exemption.
   */
  readonly chromiumSandbox: true;
  /**
   * No fixed viewport: Playwright defaults to 1280x720, which freezes the
   * page size when the user resizes the window. `null` makes the page
   * follow the host window size instead (it is user-driven).
   */
  readonly viewport: null;
  readonly ignoreDefaultArgs: readonly string[];
}

/** Build the Playwright options for one launch attempt. */
export function browseLaunchOptions(attempt: BrowseLaunchAttempt): BrowseLaunchOptions {
  return {
    channel: attempt.channel,
    headless: false,
    chromiumSandbox: true,
    viewport: null,
    ignoreDefaultArgs: BROWSE_LAUNCH_IGNORE_DEFAULT_ARGS
  };
}

/**
 * Pick the preferred channel from the detected system browsers. Returns
 * undefined when none matches, meaning the bundled Chromium fallback.
 * Matching is exact on Playwright channel names.
 */
export function resolveBrowseChannel(
  detected: readonly string[]
): BrowseChannel | undefined {
  for (const channel of BROWSE_CHANNEL_PREFERENCE) {
    if (detected.includes(channel)) {
      return channel;
    }
  }
  return undefined;
}

/** Absolute path of the persistent browser profile inside the workspace. */
export function resolveBrowseProfileDir(workspaceRoot: string): string {
  return path.join(workspaceRoot, BROWSE_PROFILE_DIR_NAME);
}

export interface BrowseOpenToolInput {
  /** Full http(s) URL of the page to open in the watched browser. */
  url: string;
}

/**
 * Resolve a model-provided input to the page URL to open.
 * Returns undefined for missing, blank or non-http(s) URLs so the tool can
 * never navigate to a dangerous scheme.
 */
export function resolveBrowseOpenUrl(input: unknown): string | undefined {
  if (typeof input !== 'object' || input === null) {
    return undefined;
  }
  const url = (input as { url?: unknown }).url;
  if (typeof url !== 'string') {
    return undefined;
  }
  const trimmed = url.trim();
  return trimmed && isSafeHttpUrl(trimmed) ? trimmed : undefined;
}

/** Post-JS snapshot of the watched browser's current page. */
export interface BrowsePageState {
  /** Current URL, or '' when no page is loaded yet. */
  url: string;
  /** Current page title (may be ''). */
  title: string;
  /** Rendered text (`document.body.innerText`, post-JS). */
  text: string;
  /** Most recent console errors / uncaught exceptions, oldest first. */
  consoleErrors: readonly string[];
}

/**
 * Append a console error, keeping only the most recent ones (ring buffer).
 * Pure so the retention policy stays unit-tested; the driver owns the list.
 */
export function pushConsoleError(errors: readonly string[], message: string): string[] {
  return [...errors, message].slice(-BROWSE_MAX_CONSOLE_ERRORS_KEPT);
}

/** Message shown when the watched browser has no page loaded yet. */
export function formatBrowseEmptyState(): string {
  return (
    `The watched browser is open but has no page loaded. ` +
    `Open one with the "${BROWSE_OPEN_TOOL_NAME}" tool before reading its state.`
  );
}

/** Render a state snapshot as the text the model answers from. */
export function formatBrowseState(state: BrowsePageState): string {
  if (!state.url || state.url === 'about:blank') {
    return formatBrowseEmptyState();
  }
  const lines = [`Browsing ${state.url}:`];
  if (state.title) {
    lines.push(`Title: ${state.title}`);
  }
  lines.push('');
  const text = state.text.trim();
  if (!text) {
    lines.push('(the page contains no readable text)');
  } else if (text.length <= BROWSE_MAX_TEXT_CHARS) {
    lines.push(text);
  } else {
    lines.push(text.slice(0, BROWSE_MAX_TEXT_CHARS));
    lines.push(
      `…(truncated, showing the first ${BROWSE_MAX_TEXT_CHARS} of ${text.length} characters)`
    );
  }
  const errors = state.consoleErrors.slice(-BROWSE_MAX_CONSOLE_ERRORS_SHOWN);
  if (errors.length > 0) {
    lines.push('');
    lines.push(
      `Console errors (${state.consoleErrors.length}):`
    );
    for (const error of errors) {
      lines.push(`- ${truncateConsoleError(error)}`);
    }
    const hidden = state.consoleErrors.length - errors.length;
    if (hidden > 0) {
      lines.push(`…(${hidden} older error${hidden === 1 ? '' : 's'} not shown)`);
    }
  }
  return lines.join('\n');
}

function truncateConsoleError(error: string): string {
  const singleLine = error.replace(/\s+/g, ' ').trim();
  if (singleLine.length <= BROWSE_MAX_CONSOLE_ERROR_CHARS) {
    return singleLine;
  }
  return `${singleLine.slice(0, BROWSE_MAX_CONSOLE_ERROR_CHARS)}…(truncated)`;
}

/**
 * Watched-browser nudge, appended to the preamble only when the state tool
 * is actually offered — so "what do you see on my page?" becomes a tool
 * call instead of a guess, without teaching the tool to models lacking it.
 */
export function browseWatchHint(offeredToolNames: readonly string[]): string {
  if (!offeredToolNames.includes(BROWSE_STATE_TOOL_NAME)) {
    return '';
  }
  const openBit = offeredToolNames.includes(BROWSE_OPEN_TOOL_NAME)
    ? ` To show the user a page, navigate the watched browser there with the "${BROWSE_OPEN_TOOL_NAME}" tool.`
    : '';
  return (
    ` The user browses in an external watched browser you can observe:` +
    ` when they ask what you see on their page, call the "${BROWSE_STATE_TOOL_NAME}"` +
    ` tool and answer from its URL, title and text (post-JavaScript) instead of guessing.` +
    openBit
  );
}
