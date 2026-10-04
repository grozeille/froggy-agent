import { spawn, type SpawnOptions } from 'child_process';

/** Source label shown on the toast; arbitrary ids pop but don't persist. */
export const WIN_TOAST_APP_ID = 'Froggy Agent';

/** Toast text stays short; bodies arriving here are already one line. */
const MAX_TOAST_CHARS = 200;

function clip(text: string): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length > MAX_TOAST_CHARS ? `${clean.slice(0, MAX_TOAST_CHARS - 1).trimEnd()}…` : clean;
}

/** Single quotes are the only escape needed inside PS single-quoted strings. */
function escapePs(text: string): string {
  return text.replace(/'/g, "''");
}

/**
 * WinRT toast script: two-line template (title + body) shown under our app
 * id. Text goes through CreateTextNode, never parsed as XML, so no XML
 * escaping is needed.
 */
export function buildToastScript(appId: string, title: string, body: string): string {
  return [
    "$ErrorActionPreference = 'Stop'",
    '[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null',
    '$t = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent([Windows.UI.Notifications.ToastTemplateType]::ToastText02)',
    "$n = $t.GetElementsByTagName('text')",
    `$n.Item(0).AppendChild($t.CreateTextNode('${escapePs(clip(title))}')) | Out-Null`,
    `$n.Item(1).AppendChild($t.CreateTextNode('${escapePs(clip(body))}')) | Out-Null`,
    '$toast = [Windows.UI.Notifications.ToastNotification]::new($t)',
    `[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('${escapePs(appId)}').Show($toast)`
  ].join('\n');
}

/** powershell.exe -EncodedCommand expects base64 utf16le, dodging all quoting. */
export function encodeToastCommand(script: string): string {
  return Buffer.from(script, 'utf16le').toString('base64');
}

export type ToastSpawner = (
  command: string,
  args: string[],
  options: SpawnOptions
) => { unref(): void; once(_event: string, _listener: () => void): void };

const defaultSpawn: ToastSpawner = (command, args, options) => spawn(command, args, options);

/**
/** Native toasts exist on Windows only; elsewhere the in-app popup stands in. */
export function supportsNativeToast(platform: string = process.platform): boolean {
  return platform === 'win32';
}

/**
 * Fire-and-forget native toast, Windows only. Best effort by design: any
 * failure is swallowed so a toast can never break the chat. Other platforms
 * keep the in-app notification only.
 */
export function showWindowsToast(
  title: string,
  body: string,
  platform: string = process.platform,
  spawnFn: ToastSpawner = defaultSpawn
): void {
  if (platform !== 'win32') {
    return;
  }
  try {
    const script = buildToastScript(WIN_TOAST_APP_ID, title, body);
    const child = spawnFn(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-EncodedCommand', encodeToastCommand(script)],
      { stdio: 'ignore', windowsHide: true }
    );
    child.once('error', () => undefined);
    child.unref();
  } catch {
    // No powershell, no toast — the in-app notification still shows.
  }
}
