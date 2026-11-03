/**
 * @file electron/main.js
 * @description Electron main process for the ULTRON desktop application.
 *
 * Responsibilities:
 * - Spawns the Next.js frontend server (standalone build) as a child process.
 * - Creates the main BrowserWindow with the ULTRON orb UI.
 * - Grants camera/microphone media permissions only to ULTRON's own loopback UI.
 * - Locks the privileged window to the local UI origin (no remote navigation or
 *   extra Electron windows) and exposes app metadata to the preload bridge.
 * - Manages application lifecycle (quit, window close, server cleanup).
 */

const { app, BrowserWindow, dialog, ipcMain, shell } = require("electron");
const path = require("path");
const fs = require("fs");
const net = require("net");
const { spawn } = require("child_process");

let mainWindow = null;
let nextProcess = null;
let activePort = null;
let appUrl = null;

// Preferred local port for the embedded Next.js server. If another process has
// claimed it (common with dev servers), the next free port in the range is used
// instead of leaving the window stuck on a failed load.
const PREFERRED_PORT = Number(process.env.ULTRON_PORT) || 3000;
const PORT_SCAN_RANGE = 20;
const IS_DEV = process.env.NODE_ENV === "development";
const MEDIA_PERMISSIONS = new Set(["media", "microphone", "camera"]);

// Paths the renderer is allowed to read through the preload bridge.
const ALLOWED_APP_PATHS = new Set([
  "home",
  "appData",
  "userData",
  "sessionData",
  "temp",
  "exe",
  "desktop",
  "documents",
  "downloads",
  "music",
  "pictures",
  "videos",
  "logs",
  "crashDumps",
]);

/**
 * Checks whether a URL is the embedded ULTRON UI.
 *
 * Only the loopback host/port that this process launched is trusted; this is the
 * single gate used for navigation, new-window and media-permission decisions.
 *
 * @param {string} url - URL to validate.
 * @returns {boolean} True when the URL belongs to the local ULTRON server.
 */
function isAppUrl(url) {
  if (!url || !activePort) return false;
  try {
    const parsed = new URL(url);
    const port = parsed.port || (parsed.protocol === "https:" ? "443" : "80");
    const isLoopbackHost = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
    return (
      (parsed.protocol === "http:" || parsed.protocol === "https:") &&
      isLoopbackHost &&
      String(port) === String(activePort)
    );
  } catch {
    return false;
  }
}

/**
 * Finds a free loopback TCP port, starting at the preferred port.
 *
 * @param {number} startPort - First port to try.
 * @returns {Promise<number>} First free port in the scan range.
 * @throws {Error} When no port in the range is free.
 */
function findAvailablePort(startPort) {
  return new Promise((resolve, reject) => {
    const tryPort = (port) => {
      if (port > startPort + PORT_SCAN_RANGE) {
        reject(new Error(`No free port in range ${startPort}-${startPort + PORT_SCAN_RANGE}`));
        return;
      }
      const probe = net.createServer();
      probe.unref();
      probe.once("error", (error) => {
        if (error.code === "EADDRINUSE") {
          tryPort(port + 1);
        } else {
          reject(error);
        }
      });
      probe.listen(port, "127.0.0.1", () => {
        const boundPort = probe.address().port;
        probe.close(() => resolve(boundPort));
      });
    };
    tryPort(startPort);
  });
}

/**
 * Spawns the standalone Next.js server as a Node child process.
 *
 * @param {number} port - Loopback port the server must bind.
 * @returns {boolean} False when the standalone build is missing (caller aborts).
 */
function startNextServer(port) {
  const standaloneServer = app.isPackaged
    ? path.join(process.resourcesPath, "standalone", "server.js")
    : path.join(__dirname, "..", ".next", "standalone", "server.js");

  if (!fs.existsSync(standaloneServer)) {
    console.error(`[Next.js] standalone server not found at ${standaloneServer}`);
    return false;
  }

  nextProcess = spawn(process.execPath, [standaloneServer], {
    stdio: ["ignore", "pipe", "pipe"],
    cwd: path.dirname(standaloneServer),
    env: {
      ...process.env,
      // Re-use the Electron binary as a plain Node runtime for the Next server.
      ELECTRON_RUN_AS_NODE: "1",
      PORT: String(port),
      // Bind loopback only. Next standalone defaults to 0.0.0.0, which would
      // expose the desktop HUD's API routes to the local network.
      HOSTNAME: "127.0.0.1",
      NODE_ENV: "production",
    },
  });

  nextProcess.stdout.on("data", (data) => {
    const line = data.toString().trim();
    if (line) console.log(`[Next.js] ${line}`);
  });

  nextProcess.stderr.on("data", (data) => {
    const line = data.toString().trim();
    if (line) console.error(`[Next.js ERR] ${line}`);
  });

  nextProcess.on("close", (code) => {
    if (code && code !== 0) {
      console.warn(`[Next.js] exited with code ${code}`);
    }
  });

  nextProcess.on("error", (error) => {
    console.error("[Next.js] failed to start:", error);
  });

  return true;
}

/**
 * Creates the main ULTRON BrowserWindow and wires security/permission handlers.
 */
function createWindow() {
  if (!activePort || !appUrl) return;

  const iconPath = path.join(__dirname, "../build/icons/icon512.png");
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: false,
    ...(fs.existsSync(iconPath) ? { icon: iconPath } : {}),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  const ses = mainWindow.webContents.session;

  /**
   * Electron reports camera and microphone access as the "media" permission.
   * Allow checks and requests only for this window and only while it shows the
   * embedded ULTRON UI; all other permissions and origins are denied.
   */
  ses.setPermissionCheckHandler((webContents, permission) => {
    if (!MEDIA_PERMISSIONS.has(permission)) return false;
    if (!webContents || !mainWindow || webContents !== mainWindow.webContents) return false;
    return isAppUrl(webContents.getURL());
  });

  ses.setPermissionRequestHandler((webContents, permission, callback) => {
    const trustedWindow = Boolean(mainWindow) && webContents === mainWindow.webContents;
    callback(MEDIA_PERMISSIONS.has(permission) && trustedWindow && isAppUrl(webContents.getURL()));
  });

  ses.webRequest.onBeforeSendHeaders((details, callback) => {
    details.requestHeaders["X-ULTRON-App"] = "desktop";
    callback({ requestHeaders: details.requestHeaders });
  });

  // Navigation lockdown: only the local ULTRON UI may load in the privileged
  // window, because that renderer can be granted camera/microphone access.
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (!isAppUrl(url)) {
      event.preventDefault();
      console.warn(`[Electron] Blocked navigation to ${url}`);
    }
  });

  // window.open()/target=_blank must never create another privileged window;
  // hand ordinary web links to the user's browser instead.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url) && !isAppUrl(url)) {
      shell.openExternal(url).catch((error) => {
        console.warn(`[Electron] Could not open external URL: ${error}`);
      });
    }
    return { action: "deny" };
  });

  // The Next.js server may need a moment to bind; retry the initial load a
  // bounded number of times instead of reloading forever.
  let loadRetries = 0;
  mainWindow.webContents.on("did-fail-load", (_event, errorCode, errorDescription, _url, isMainFrame) => {
    if (!isMainFrame || IS_DEV) return;
    if (loadRetries >= 10) {
      console.error(`[Electron] UI failed to load after ${loadRetries} retries: ${errorDescription} (${errorCode})`);
      return;
    }
    loadRetries += 1;
    setTimeout(() => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.loadURL(appUrl);
      }
    }, 1000);
  });

  mainWindow.loadURL(appUrl);

  if (IS_DEV) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.once("ready-to-show", () => {
    if (mainWindow) mainWindow.show();
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

/**
 * Registers IPC handlers consumed by electron/preload.js.
 *
 * The preload bridge exposes getVersion()/getPath(); without these handlers every
 * renderer call rejected with "No handler registered for 'app-get-version'".
 */
function registerIpcHandlers() {
  ipcMain.handle("app-get-version", () => app.getVersion());

  ipcMain.handle("app-get-path", (_event, name) => {
    if (typeof name !== "string" || !ALLOWED_APP_PATHS.has(name)) {
      throw new Error(`Unsupported app path: ${String(name)}`);
    }
    return app.getPath(name);
  });
}

/**
 * Stops the embedded Next.js server. Safe to call multiple times.
 */
function cleanup() {
  if (nextProcess) {
    try {
      nextProcess.kill("SIGTERM");
    } catch (error) {
      console.warn("[Next.js] failed to stop cleanly:", error);
    }
    nextProcess = null;
  }
}

app.whenReady().then(async () => {
  registerIpcHandlers();

  try {
    activePort = await findAvailablePort(PREFERRED_PORT);
  } catch (error) {
    console.error("[Electron] Could not find a free local port:", error);
    dialog.showErrorBox(
      "ULTRON could not start",
      `No free local port was found near ${PREFERRED_PORT}.\n\n${String(error)}`
    );
    app.quit();
    return;
  }
  appUrl = `http://127.0.0.1:${activePort}/`;

  if (!startNextServer(activePort)) {
    dialog.showErrorBox(
      "ULTRON server missing",
      "The Next.js standalone build was not found.\n\nRun `npm run build:next` before starting the desktop app."
    );
    app.quit();
    return;
  }

  // Give Next.js a head start; did-fail-load retries cover slower machines.
  setTimeout(createWindow, 1200);
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    cleanup();
    app.quit();
  }
});

app.on("before-quit", () => {
  cleanup();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
