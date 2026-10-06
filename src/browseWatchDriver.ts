import * as vscode from 'vscode';
import type { BrowserContext, Page } from 'playwright-core';
import {
  BROWSE_GITIGNORE_ENTRY,
  BROWSE_MAX_CONSOLE_ERRORS_KEPT,
  browseLaunchAttempts,
  browseLaunchOptions,
  describeBrowseLaunch,
  pushConsoleError,
  resolveBrowseProfileDir,
  type BrowseLaunchAttempt,
  type BrowsePageState
} from './browseWatch';
import { ensureGitignoreEntry } from './pythonEnv';

/**
 * Playwright driver for the watched browser: one visible external window
 * (system Chrome or Edge when available, bundled Chromium otherwise) with
 * a persistent profile in `<workspace>/.froggy-browser/`, so cookies and
 * logins survive restarts. The user drives; the tools only observe.
 */

type ChromiumLauncher = typeof import('playwright-core').chromium;

/** Navigation budget: the browser is user-driven, never wait for full load. */
const NAVIGATION_TIMEOUT_MS = 30_000;

let context: BrowserContext | undefined;
let launching: Promise<BrowserContext> | undefined;
let browserLabel = '';
let consoleErrors: string[] = [];

/** Load the Playwright driver lazily so a missing install fails with guidance. */
async function loadChromium(): Promise<ChromiumLauncher> {
  for (const name of ['playwright-core', 'playwright']) {
    try {
      const mod = (await import(name)) as { chromium?: ChromiumLauncher };
      if (mod?.chromium) {
        return mod.chromium;
      }
    } catch {
      continue;
    }
  }
  throw new Error(
    'Playwright is not installed: run "npm install" in the extension folder, then retry.'
  );
}

/** Best-effort: keep the browser profile (cookies, logins) untracked. */
async function ensureProfileGitignored(root: vscode.Uri): Promise<void> {
  try {
    const gitignore = vscode.Uri.joinPath(root, '.gitignore');
    let current: string | undefined;
    try {
      current = new TextDecoder('utf-8').decode(await vscode.workspace.fs.readFile(gitignore));
    } catch {
      current = undefined;
    }
    const update = ensureGitignoreEntry(current, BROWSE_GITIGNORE_ENTRY);
    if (update.changed) {
      await vscode.workspace.fs.writeFile(gitignore, new TextEncoder().encode(update.content));
    }
  } catch {
    // Ignore tracking failures: watching still works on a tracked profile.
  }
}

function recordConsoleError(message: string): void {
  const text = message.trim();
  if (text) {
    consoleErrors = pushConsoleError(consoleErrors, text);
  }
}

function watchPage(page: Page): void {
  page.on('console', (message) => {
    if (message.type() === 'error') {
      recordConsoleError(message.text());
    }
  });
  page.on('pageerror', (error) => {
    recordConsoleError(error instanceof Error ? error.stack ?? error.message : String(error));
  });
}

function resetContext(): void {
  context = undefined;
  launching = undefined;
}

async function launchAttempt(
  chromium: ChromiumLauncher,
  profileDir: string,
  attempt: BrowseLaunchAttempt
): Promise<BrowserContext> {
  const options = browseLaunchOptions(attempt);
  const launched = await chromium.launchPersistentContext(profileDir, {
    channel: options.channel,
    headless: options.headless,
    chromiumSandbox: options.chromiumSandbox,
    args: [...options.args],
    ignoreDefaultArgs: [...options.ignoreDefaultArgs]
  });
  browserLabel = describeBrowseLaunch(attempt);
  for (const page of launched.pages()) {
    watchPage(page);
  }
  launched.on('page', watchPage);
  launched.on('close', resetContext);
  return launched;
}

/**
 * Start the watched browser if needed: system Chrome, then system Edge,
 * then the bundled Chromium. Concurrent callers share one launch.
 */
async function ensureBrowser(): Promise<BrowserContext> {
  if (context) {
    return context;
  }
  if (launching) {
    return launching;
  }
  launching = (async (): Promise<BrowserContext> => {
    const root = vscode.workspace.workspaceFolders?.[0]?.uri;
    if (!root) {
      throw new Error('Open a folder first, then retry in the watched browser.');
    }
    const chromium = await loadChromium();
    const profileDir = resolveBrowseProfileDir(root.fsPath);
    const attempts = browseLaunchAttempts();
    const failures: string[] = [];
    for (const attempt of attempts) {
      try {
        const launched = await launchAttempt(chromium, profileDir, attempt);
        context = launched;
        await ensureProfileGitignored(root);
        return launched;
      } catch (err) {
        failures.push(
          `${describeBrowseLaunch(attempt)}: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }
    throw new Error(
      `Could not start a browser (${failures.join(' | ')}). ` +
        'Install Google Chrome or Microsoft Edge, or the bundled Chromium ' +
        'with "npx playwright-core install chromium".'
    );
  })();
  try {
    return await launching;
  } catch (err) {
    resetContext();
    throw err;
  }
}

/** The page the user is looking at (most recently opened tab). */
async function activePage(): Promise<Page> {
  const browser = await ensureBrowser();
  const pages = browser.pages();
  const page = pages[pages.length - 1];
  return page ?? browser.newPage();
}

/** Navigate the watched browser to a URL (already validated by the tool). */
export async function openWatchedPage(url: string): Promise<{ url: string; browser: string }> {
  const page = await activePage();
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: NAVIGATION_TIMEOUT_MS });
  return { url: page.url(), browser: browserLabel };
}

/**
 * Snapshot the watched page: URL, title, post-JS rendered text and recent
 * console errors. Reading never steals focus or clicks anything.
 */
export async function readWatchedState(): Promise<BrowsePageState> {
  const page = await activePage();
  const url = page.url();
  const title = await page.title().catch(() => '');
  const text = await page
    .evaluate('document.body ? document.body.innerText : ""')
    .catch(() => '');
  return {
    url,
    title,
    text: typeof text === 'string' ? text : '',
    consoleErrors: consoleErrors.slice(-BROWSE_MAX_CONSOLE_ERRORS_KEPT)
  };
}

/** Capture the watched page as PNG bytes for a vision-capable model. */
export async function captureWatchedScreenshot(): Promise<{
  data: Uint8Array;
  url: string;
  title: string;
}> {
  const page = await activePage();
  const data = await page.screenshot({ type: 'png' });
  const title = await page.title().catch(() => '');
  return { data: new Uint8Array(data), url: page.url(), title };
}

/** Close the watched browser (logins persist in the workspace profile). */
export async function disposeWatchedBrowser(): Promise<void> {
  const browser = context;
  resetContext();
  if (browser) {
    await browser.close().catch(() => undefined);
  }
}
