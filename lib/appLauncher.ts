/**
 * @file lib/appLauncher.ts
 * @description Local desktop application discovery & launcher for ULTRON voice commands.
 *
 * Subsystem:
 * Local Desktop Control (Windows Start Menu / Shell integration).
 *
 * Key Responsibilities:
 * - Discovers installed applications from the current user's and the all-users' Start Menu
 *   shortcut folders (plus the Desktop), with a short-lived cache to keep voice turns fast.
 * - Resolves fuzzy spoken names ("chrome kholo", "open notepad") to a concrete shortcut or a
 *   fixed built-in alias, and launches it in the user's logged-in desktop session.
 * - Returns an honest "not found" result with suggestions instead of guessing/fabricating.
 *
 * Architectural Role & Interactions:
 * - Used by `app/api/chat/route.ts` for deterministic app-launch intents, so the LLM never has
 *   to invent that a command succeeded.
 *
 * Safety / Security Guarantees:
 * - Only allow-listed targets are launched: shortcuts discovered on disk or the built-in alias
 *   table below. User text is NEVER interpolated into a shell command line.
 * - No shell is used (`spawn`/`execFile` with argv arrays), so quotes/`&`/backticks in speech
 *   cannot become commands. `settle`-style shell URIs are passed as single argv elements.
 * - Applications start under the CURRENT Windows user account (the user's already logged-in
 *   desktop session); ULTRON never stores, types or automates account passwords.
 */

import { spawn } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { verifyGatewayExecutionGrant } from "./permissionGateway.ts";

export interface GatewayAuthContext {
  planId: string;
  grantToken: string;
}

/** How long a discovered app list stays cached (ms). */
const APP_CACHE_TTL_MS = 5 * 60 * 1000;
/** Guard against pathological shortcut directory depth. */
const MAX_SCAN_DEPTH = 8;

/**
 * Built-in Windows apps that may not have a usable Start Menu shortcut.
 * `kind: "shell"` entries are shell URIs opened through explorer.exe.
 */
const BUILTIN_APPS: Record<string, { label: string; file: string; kind: "exe" | "shell" }> = {
  notepad: { label: "Notepad", file: "notepad.exe", kind: "exe" },
  calculator: { label: "Calculator", file: "calc.exe", kind: "exe" },
  calc: { label: "Calculator", file: "calc.exe", kind: "exe" },
  paint: { label: "Paint", file: "mspaint.exe", kind: "exe" },
  "task manager": { label: "Task Manager", file: "taskmgr.exe", kind: "exe" },
  taskmgr: { label: "Task Manager", file: "taskmgr.exe", kind: "exe" },
  command: { label: "Command Prompt", file: "cmd.exe", kind: "exe" },
  cmd: { label: "Command Prompt", file: "cmd.exe", kind: "exe" },
  explorer: { label: "File Explorer", file: "explorer.exe", kind: "exe" },
  "file explorer": { label: "File Explorer", file: "explorer.exe", kind: "exe" },
  files: { label: "File Explorer", file: "explorer.exe", kind: "exe" },
  settings: { label: "Settings", file: "ms-settings:", kind: "shell" },
  "windows settings": { label: "Settings", file: "ms-settings:", kind: "shell" },
  camera: { label: "Camera", file: "microsoft.windows.camera:", kind: "shell" },
  control: { label: "Control Panel", file: "control.exe", kind: "exe" },
  "control panel": { label: "Control Panel", file: "control.exe", kind: "exe" },
};

export interface InstalledApp {
  /** Human-readable name derived from the shortcut file. */
  name: string;
  /** Absolute path to the `.lnk` shortcut. */
  shortcutPath: string;
}

export interface LaunchResult {
  ok: boolean;
  app?: string;
  message: string;
  suggestions?: string[];
}

interface AppCache {
  apps: InstalledApp[];
  builtAt: number;
}

let appCache: AppCache | null = null;

/**
 * Returns the Start Menu / Desktop folders that contain application shortcuts.
 *
 * @returns Absolute directory paths that may exist on this host.
 */
function shortcutDirectories(): string[] {
  const appData = process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");
  const programData = process.env.ProgramData || "C:\\ProgramData";
  const userProfile = os.homedir();
  return [
    path.join(appData, "Microsoft", "Windows", "Start Menu", "Programs"),
    path.join(programData, "Microsoft", "Windows", "Start Menu", "Programs"),
    path.join(userProfile, "Desktop"),
    path.join(process.env.PUBLIC || "C:\\Users\\Public", "Desktop"),
  ];
}

/**
 * Recursively collects `.lnk` files from one directory.
 *
 * @param dir - Directory to scan.
 * @param depth - Current recursion depth (bounded).
 * @param out - Accumulator for discovered shortcuts.
 */
function collectShortcuts(dir: string, depth: number, out: string[]): void {
  if (depth > MAX_SCAN_DEPTH) return;
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return; // Missing/unreadable folder is normal (e.g. no all-users Start Menu on some hosts).
  }

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectShortcuts(fullPath, depth + 1, out);
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".lnk")) {
      out.push(fullPath);
    }
  }
}

/**
 * Converts a shortcut filename into a speakable application name.
 *
 * @param shortcutPath - Absolute `.lnk` path.
 * @returns Cleaned display name.
 */
function nameFromShortcut(shortcutPath: string): string {
  return path
    .basename(shortcutPath, ".lnk")
    .replace(/\s*-\s*shortcut$/i, "")
    .replace(/\s*shortcut$/i, "")
    .trim();
}

/**
 * Discovers installed applications across Start Menu and Desktop shortcut folders.
 *
 * Results are cached for APP_CACHE_TTL_MS because a voice turn should not pay a filesystem
 * walk every time. Duplicate names (user vs all-users shortcut) are kept in user-first order.
 *
 * @param forceRefresh - Bypass the cache when true.
 * @returns Deduplicated installed-app list (empty on non-Windows hosts).
 */
export function discoverInstalledApps(forceRefresh = false): InstalledApp[] {
  if (process.platform !== "win32") return [];
  if (!forceRefresh && appCache && Date.now() - appCache.builtAt < APP_CACHE_TTL_MS) {
    return appCache.apps;
  }

  const shortcutPaths: string[] = [];
  for (const dir of shortcutDirectories()) {
    collectShortcuts(dir, 0, shortcutPaths);
  }

  const seen = new Set<string>();
  const apps: InstalledApp[] = [];
  for (const shortcutPath of shortcutPaths) {
    const name = nameFromShortcut(shortcutPath);
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    apps.push({ name, shortcutPath });
  }

  apps.sort((a, b) => a.name.localeCompare(b.name));
  appCache = { apps, builtAt: Date.now() };
  return apps;
}

/**
 * Normalizes spoken text for fuzzy app matching.
 *
 * @param value - Raw text.
 * @returns Lowercase alphanumeric/space form.
 */
function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Starts a program detached from the Next.js server process.
 *
 * WHY: GUI apps must outlive the HTTP request; `detached` + `unref` avoids keeping the
 * server event loop attached to a window the user may leave open for hours, and no shell is
 * involved so arguments cannot be reinterpreted as commands.
 *
 * @param file - Executable or explorer.exe.
 * @param args - Argument vector.
 * @returns Promise that resolves once the process spawned successfully.
 */
function spawnDetached(file: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(file, args, {
      detached: true,
      stdio: "ignore",
      windowsHide: false,
    });
    child.once("spawn", () => {
      child.unref();
      resolve();
    });
    child.once("error", reject);
  });
}

/**
 * Launches a shortcut through explorer.exe (no shell, single argv element).
 *
 * @param shortcutPath - Absolute `.lnk` path.
 */
async function launchShortcut(shortcutPath: string): Promise<void> {
  await spawnDetached("explorer.exe", [shortcutPath]);
}

/**
 * Launches a resolved built-in application.
 *
 * @param entry - Built-in app descriptor.
 */
async function launchBuiltin(entry: { file: string; kind: "exe" | "shell" }): Promise<void> {
  if (entry.kind === "shell") {
    await spawnDetached("explorer.exe", [entry.file]);
  } else {
    await spawnDetached(entry.file, []);
  }
}

/**
 * Detects an app-launch command in a natural-language utterance.
 *
 * Supported forms (English + common Hinglish):
 * - "open chrome", "launch notepad", "start spotify"
 * - "chrome kholo", "notepad khol do", "camera chalao", "settings kholo"
 *
 * @param text - User utterance.
 * @returns Requested app phrase, or null when the utterance is not an app-launch command.
 */
export function detectAppLaunchIntent(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  // Prefix verb form: "open chrome", "kholo notepad" (rare but harmless).
  const prefix = /^(?:please\s+)?(?:open|launch|start|run|kholo|khol|chalao|chalu\s+karo)\s+(?:the\s+)?(.+)$/i.exec(trimmed);
  if (prefix) {
    const candidate = prefix[1].replace(/\s+(?:app|application|please)$/i, "").replace(/\s+(?:kholo|khol|karo|kar\s+do|chalao)$/i, "").trim();
    if (candidate && candidate.length >= 2) return candidate;
  }

  // Suffix verb form: "chrome kholo", "notepad khol do", "camera chalao".
  const suffix = /^(.+?)\s+(?:kholo|khol(?:\s+do)?|chalao|chalu\s+karo|open\s+karo)$/i.exec(trimmed);
  if (suffix) {
    const candidate = suffix[1].trim();
    if (candidate && candidate.length >= 2) return candidate;
  }

  return null;
}

/**
 * Resolves an app request to launch targets.
 *
 * Matching order: built-in alias -> exact discovered name -> substring match (shortest name).
 *
 * @param request - Spoken app name.
 * @returns Matching built-in/discovered apps and optional suggestion names.
 */
function resolveApps(request: string): { matches: Array<{ label: string; launch: () => Promise<void> }>; suggestions: string[] } {
  const query = normalize(request);
  if (!query) return { matches: [], suggestions: [] };

  const builtinKey = Object.keys(BUILTIN_APPS).find((key) => key === query);
  if (builtinKey) {
    const entry = BUILTIN_APPS[builtinKey];
    return {
      matches: [{ label: entry.label, launch: () => launchBuiltin(entry) }],
      suggestions: [],
    };
  }

  const apps = discoverInstalledApps();

  // Exact name match first.
  const exact = apps.filter((app) => normalize(app.name) === query);
  if (exact.length > 0) {
    return {
      matches: exact.map((app) => ({ label: app.name, launch: () => launchShortcut(app.shortcutPath) })),
      suggestions: [],
    };
  }

  // Substring match in both directions ("code" -> "Visual Studio Code", "chrome browser" -> "Google Chrome").
  const partial = apps.filter((app) => {
    const name = normalize(app.name);
    return name.length >= 2 && (name.includes(query) || query.includes(name));
  });

  if (partial.length === 0) {
    // Friendly suggestions from a loose token overlap so the reply is helpful, not a guess.
    const tokens = query.split(" ").filter((token) => token.length >= 3);
    const suggestions = apps
      .filter((app) => tokens.some((token) => normalize(app.name).includes(token)))
      .slice(0, 3)
      .map((app) => app.name);
    return { matches: [], suggestions };
  }

  // Prefer the shortest partial match ("Chrome" over "Chrome Remote Desktop").
  partial.sort((a, b) => a.name.length - b.name.length);
  return {
    matches: partial.slice(0, 1).map((app) => ({ label: app.name, launch: () => launchShortcut(app.shortcutPath) })),
    suggestions: partial.slice(1, 4).map((app) => app.name),
  };
}

/**
 * Rejects requests containing shell/URI metacharacters.
 *
 * WHY: even though launching never uses a shell, defence-in-depth keeps hostile strings out of
 * the resolver/exec paths entirely (and makes the "spoken text cannot become a command"
 * guarantee explicit and testable).
 *
 * @param request - Spoken app name.
 * @returns True when the request is safe to resolve.
 */
function isSafeAppName(request: string): boolean {
  return !/[&|;<>`$(){}[\]"'\\%^!\r\n]/.test(request);
}

/**
 * Resolves and launches an application requested by voice.
 * Enforces mandatory authorization via Universal Computer Action Permission Gateway.
 * Direct invocation without a valid gateway grant is blocked.
 *
 * @param request - Spoken app name (e.g. "chrome", "notepad", "visual studio code").
 * @param gatewayAuth - Cryptographic execution authorization context from permission gateway.
 * @returns Honest launch result; on failure it includes suggestions and never claims success.
 */
export async function launchAppByName(
  request: string,
  gatewayAuth?: GatewayAuthContext
): Promise<LaunchResult> {
  // Enforce Universal Permission Gateway authorization
  if (!gatewayAuth || !verifyGatewayExecutionGrant(gatewayAuth.planId, gatewayAuth.grantToken)) {
    return {
      ok: false,
      message: "Security Policy Enforcement: Direct execution blocked. All application launches must route through the Universal Permission Gateway.",
    };
  }

  if (process.platform !== "win32") {
    return { ok: false, message: "App launching is only supported on Windows." };
  }
  if (!isSafeAppName(request)) {
    return {
      ok: false,
      message: "That app name contains characters I don't accept; please say just the app name.",
    };
  }

  let resolution: ReturnType<typeof resolveApps>;
  try {
    resolution = resolveApps(request);
  } catch (err) {
    console.error("[APP LAUNCHER] Discovery failure:", err);
    return { ok: false, message: "I couldn't read the list of installed apps." };
  }

  if (resolution.matches.length === 0) {
    const suggestions = resolution.suggestions.length > 0 ? ` Did you mean: ${resolution.suggestions.join(", ")}?` : "";
    return {
      ok: false,
      message: `I couldn't find an installed app matching "${request}".${suggestions}`,
      suggestions: resolution.suggestions,
    };
  }

  const match = resolution.matches[0];
  try {
    await match.launch();
    return { ok: true, app: match.label, message: `Opening ${match.label}.` };
  } catch (err) {
    console.error(`[APP LAUNCHER] Failed to launch ${match.label}:`, err);
    return { ok: false, app: match.label, message: `I found ${match.label} but couldn't launch it.` };
  }
}
