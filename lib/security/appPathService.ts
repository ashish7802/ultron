/**
 * @file lib/security/appPathService.ts
 * @description Central Deterministic Application Path & Persistence Resolver for ULTRON.
 *
 * Subsystem:
 * Centralized Storage, Persistence & Packaging Infrastructure (F-07 Hardening).
 *
 * Key Responsibilities:
 * - Deterministically resolves persistent application paths across development and packaged runtime environments.
 * - Prioritizes `process.env.ULTRON_USER_DATA_DIR` (injected by Electron main process via `app.getPath("userData")`).
 * - Falls back to current working directory in development environments where user data directory is not explicitly passed.
 * - Protects against read-only package installation roots (e.g. `C:\Program Files\ULTRON\resources\standalone`).
 * - Guarantees safe automatic directory creation with restricted directory mode.
 *
 * Safety / Security Guarantees:
 * - Deterministic path isolation: Data files are persisted in trusted user profile paths.
 * - Migration compatibility: Automatically checks both persistent user data and legacy project root to prevent data loss.
 */

import path from "path";
import fs from "fs";

export class AppPathService {
  private static _instance: AppPathService | null = null;
  private readonly _userDataDir: string;
  private readonly _isPackaged: boolean;

  private constructor() {
    // 1. Check for Electron user data directory environment variable
    const envUserData = process.env.ULTRON_USER_DATA_DIR?.trim();
    if (envUserData && envUserData.length > 0) {
      this._userDataDir = path.resolve(envUserData);
      this._isPackaged = true;
    } else {
      // Development fallback: root project directory
      this._userDataDir = path.resolve(process.cwd());
      this._isPackaged = false;
    }

    // Ensure base directory exists
    try {
      if (!fs.existsSync(this._userDataDir)) {
        fs.mkdirSync(this._userDataDir, { recursive: true, mode: 0o700 });
      }
    } catch {
      // Fallback
    }
  }

  public static getInstance(): AppPathService {
    if (!this._instance) {
      this._instance = new AppPathService();
    }
    return this._instance;
  }

  /**
   * Returns whether the application is running inside a packaged Electron environment.
   */
  public isPackaged(): boolean {
    return this._isPackaged;
  }

  /**
   * Resolves the primary root directory for user data.
   */
  public getUserDataDir(): string {
    return this._userDataDir;
  }

  /**
   * Resolves the path to the central encrypted memory vault (`ultron_memory_vault.json`).
   * Supports backward-compatible discovery: if present in project root during migration, preserves it.
   */
  public getMemoryVaultPath(): string {
    const primaryPath = path.join(this._userDataDir, "ultron_memory_vault.json");
    if (!fs.existsSync(primaryPath) && this._isPackaged) {
      const devPath = path.join(process.cwd(), "ultron_memory_vault.json");
      if (fs.existsSync(devPath)) {
        return devPath;
      }
    }
    return primaryPath;
  }

  /**
   * Resolves the path to the primary master key storage file (`.vault_key` or `.vault_key.dpapi`).
   */
  public getVaultKeyPath(): string {
    const primaryPath = path.join(this._userDataDir, ".vault_key");
    if (!fs.existsSync(primaryPath) && this._isPackaged) {
      const devPath = path.join(process.cwd(), ".vault_key");
      if (fs.existsSync(devPath)) {
        return devPath;
      }
    }
    return primaryPath;
  }

  /**
   * Resolves the directory for secure key storage and recovery records (`.security_vault/`).
   */
  public getSecurityVaultDir(): string {
    const primaryDir = path.join(this._userDataDir, ".security_vault");
    if (!fs.existsSync(primaryDir) && this._isPackaged) {
      const devDir = path.join(process.cwd(), ".security_vault");
      if (fs.existsSync(devDir)) {
        return devDir;
      }
    }
    if (!fs.existsSync(primaryDir)) {
      try {
        fs.mkdirSync(primaryDir, { recursive: true, mode: 0o700 });
      } catch {}
    }
    return primaryDir;
  }

  /**
   * Resolves the path to the founder recovery key (`.security_vault/recovery.key`).
   */
  public getRecoveryKeyPath(): string {
    return path.join(this.getSecurityVaultDir(), "recovery.key");
  }

  /**
   * Resolves the path to the emergency lockdown state file (`.security_vault/lockdown.json`).
   */
  public getLockdownStatePath(): string {
    return path.join(this.getSecurityVaultDir(), "lockdown.json");
  }

  /**
   * Resolves the path to the audit chain store (`.security_vault/audit_chain.json`).
   */
  public getAuditChainPath(): string {
    return path.join(this.getSecurityVaultDir(), "audit_chain.json");
  }

  /**
   * Resolves the path to the ultron_engine directory across dev and packaged Electron environments.
   */
  public getUltronEngineDir(): string {
    const envEngine = process.env.ULTRON_ENGINE_DIR?.trim();
    if (envEngine && fs.existsSync(envEngine)) {
      return path.resolve(envEngine);
    }
    // Check local cwd
    const localDir = path.join(process.cwd(), "ultron_engine");
    if (fs.existsSync(localDir)) {
      return localDir;
    }
    // Check relative to resources in packaged builds
    const procAny = process as unknown as { resourcesPath?: string };
    if (typeof procAny.resourcesPath === "string") {
      const resDir = path.join(procAny.resourcesPath, "standalone", "ultron_engine");
      if (fs.existsSync(resDir)) {
        return resDir;
      }
    }
    return localDir;
  }

  /**
   * Resolves the path to the dpapi_helper.py script.
   */
  public getDpapiHelperPath(): string {
    return path.join(this.getUltronEngineDir(), "dpapi_helper.py");
  }

  /**
   * Resolves the path to the filesystem backup snapshot directory (`backups/filesystem/`).
   */
  public getBackupDir(): string {
    const dir = path.join(this._userDataDir, "backups", "filesystem");
    if (!fs.existsSync(dir)) {
      try {
        fs.mkdirSync(dir, { recursive: true });
      } catch {}
    }
    return dir;
  }
}

export const defaultAppPathService = AppPathService.getInstance();
