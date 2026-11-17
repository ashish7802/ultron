/**
 * @file electron/preload.js
 * @description Electron preload script exposing a minimal, safe API to the renderer.
 *
 * Responsibilities:
 * - ContextBridge isolates Electron IPC from the renderer (contextIsolation enabled).
 * - Exposes app metadata and validated main-window controls for the command center.
 * - No direct access to `require`, `child_process`, or Node APIs is leaked.
 */

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("ultronAPI", {
  getVersion: () => ipcRenderer.invoke("app-get-version"),
  getPath: (name) => ipcRenderer.invoke("app-get-path", name),
  minimizeWindow: () => ipcRenderer.invoke("app-window-minimize"),
  toggleMaximizeWindow: () => ipcRenderer.invoke("app-window-toggle-maximize"),
  isWindowMaximized: () => ipcRenderer.invoke("app-window-is-maximized"),
  closeWindow: () => ipcRenderer.invoke("app-window-close"),
});
