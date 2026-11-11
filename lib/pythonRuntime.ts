/**
 * @file lib/pythonRuntime.ts
 * @description Selects a local Python 3 interpreter for ULTRON child workers.
 *
 * Responsibilities:
 * - Honors explicit runtime configuration for packaged and development installs.
 * - Checks common per-user install paths before falling back to PATH lookup.
 *
 * Safety guarantees:
 * - Returns an executable path only; callers invoke it without shell interpolation.
 */

import { existsSync } from "node:fs";
import path from "node:path";

/**
 * Resolves the local Python 3 interpreter used by ULTRON's Python workers.
 *
 * @returns An configured or detected interpreter path, or a PATH-resolved name.
 */
export function resolvePythonExecutable(): string {
  const configured = (process.env.ULTRON_PYTHON_PATH || process.env.ULTRON_PYTHON || "").trim();
  if (configured) return configured;

  const candidates: string[] = [];
  if (process.platform === "win32") {
    const localAppData = process.env.LOCALAPPDATA || "";
    if (localAppData) {
      for (const version of ["Python313", "Python312", "Python311", "Python310"]) {
        candidates.push(path.join(localAppData, "Programs", "Python", version, "python.exe"));
      }
    }
  } else {
    candidates.push("/usr/bin/python3", "/usr/local/bin/python3");
  }

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }

  return process.platform === "win32" ? "python.exe" : "python3";
}
