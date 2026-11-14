/**
 * @file lib/computer/fileSystemIntelligence.ts
 * @description Module 06: Guarded File System Intelligence & Backup Architecture.
 *
 * Subsystem:
 * Computer Intelligence - File Management, Inspection & Mutation.
 *
 * Key Responsibilities:
 * - Safe file discovery, recursive directory exploration, and glob searching.
 * - Comprehensive file metadata inspection: sizes, timestamps, and SHA-256 hashes.
 * - Safe file reading with automatic binary hex / text detection.
 * - Guarded file writing and editing with AUTOMATIC ROLLING BACKUP (.bak) prior to modification.
 * - Duplicate file detection via SHA-256 cryptographic digests.
 * - Guarded file deletion with automatic backup creation.
 * - Path traversal protection and system root boundary enforcement.
 *
 * Architectural Role & Interactions:
 * - Consumed by `workflowOrchestrator.ts` and permission-gated file tools.
 * - Requires explicit founder approval for overwrites and deletions.
 *
 * Safety / Security Guarantees:
 * - Modifying Windows system directories (`C:\Windows`, `System32`) is blocked fail-closed.
 * - Every destructive mutation is backed up before execution.
 * - Verifies result post-write by re-reading size and cryptographic hash.
 */

import { defaultPythonBridge } from "./pythonBridge.ts";
import type {
  FileMetadataDescriptor,
  DirectoryListing,
  FileWriteOutcome,
} from "./types.ts";

export class FileSystemIntelligence {
  /**
   * Retrieves comprehensive metadata for a file or directory.
   *
   * @param targetPath - Absolute or relative file path.
   * @returns FileMetadataDescriptor object.
   */
  public async getMetadata(targetPath: string): Promise<FileMetadataDescriptor> {
    const res = await defaultPythonBridge.execute<FileMetadataDescriptor>("file_meta", { path: targetPath });
    return {
      exists: Boolean(res.exists),
      path: (res.path as string) || targetPath,
      name: res.name as string | undefined,
      isDirectory: res.isDirectory as boolean | undefined,
      sizeBytes: res.sizeBytes as number | undefined,
      createdAt: res.createdAt as number | undefined,
      modifiedAt: res.modifiedAt as number | undefined,
      isReadOnly: res.isReadOnly as boolean | undefined,
      sha256: res.sha256 as string | null | undefined,
      error: res.error as string | undefined,
    };
  }

  /**
   * Lists directory contents with item metadata.
   *
   * @param dirPath - Directory path.
   * @param maxItems - Upper bound on returned items.
   * @returns DirectoryListing descriptor.
   */
  public async listDirectory(dirPath: string = ".", maxItems: number = 500): Promise<DirectoryListing> {
    const res = await defaultPythonBridge.execute<DirectoryListing>("list_dir", { path: dirPath, maxItems });
    return {
      success: Boolean(res.success),
      path: (res.path as string) || dirPath,
      items: Array.isArray(res.items) ? (res.items as DirectoryListing["items"]) : [],
      totalCount: typeof res.totalCount === "number" ? res.totalCount : 0,
      error: res.error as string | undefined,
    };
  }

  /**
   * Searches for files by keyword or pattern.
   *
   * @param query - Keyword to match.
   * @param rootDir - Starting directory (default current directory).
   * @param recursive - Recursive traversal flag.
   * @returns Array of matching file descriptors.
   */
  public async searchFiles(
    query: string,
    rootDir: string = ".",
    recursive: boolean = true
  ): Promise<FileMetadataDescriptor[]> {
    const res = await defaultPythonBridge.execute<{ matches: FileMetadataDescriptor[] }>("search_files", {
      root: rootDir,
      query,
      recursive,
    });
    if (res.success && Array.isArray(res.matches)) {
      return res.matches;
    }
    return [];
  }

  /**
   * Safely reads a file with encoding detection and truncation limits.
   *
   * @param targetPath - File path.
   * @param maxBytes - Maximum bytes to read (default 1MB).
   * @returns Read outcome {success, content, isText, sizeBytes, sha256}.
   */
  public async readFile(
    targetPath: string,
    maxBytes: number = 1048576
  ): Promise<{ success: boolean; content?: string; isText?: boolean; sizeBytes?: number; error?: string }> {
    const res = await defaultPythonBridge.execute<{
      success: boolean;
      content: string;
      isText: boolean;
      sizeBytes: number;
    }>("read_file", { path: targetPath, maxBytes });
    return {
      success: Boolean(res.success),
      content: res.content as string | undefined,
      isText: res.isText as boolean | undefined,
      sizeBytes: res.sizeBytes as number | undefined,
      error: res.error as string | undefined,
    };
  }

  /**
   * Writes data to a file with automatic rolling backup creation and post-write verification.
   * Enforces security invariant (F-03): If the file exists and overwrite is true,
   * a cryptographically signed execution grant must be verified.
   *
   * @param targetPath - Destination path.
   * @param content - Text content.
   * @param overwrite - Explicit overwrite flag.
   * @param approvalGranted - Legacy boolean indicator.
   * @param executionGrant - Cryptographic HMAC-SHA256 grant token issued by PermissionGateway.
   * @returns FileWriteOutcome with backup path and verification flag.
   */
  public async writeFile(
    targetPath: string,
    content: string,
    overwrite: boolean = false,
    approvalGranted: boolean = false,
    executionGrant?: string
  ): Promise<FileWriteOutcome> {
    const res = await defaultPythonBridge.execute<FileWriteOutcome>("write_file", {
      path: targetPath,
      content,
      overwrite,
      approvalGranted,
      executionGrant,
    });
    return {
      success: Boolean(res.success),
      path: (res.path as string) || targetPath,
      backupPath: res.backupPath as string | null | undefined,
      sha256: res.sha256 as string | null | undefined,
      sizeBytes: res.sizeBytes as number | undefined,
      verified: Boolean(res.verified),
      requiresApproval: res.requiresApproval as boolean | undefined,
      message: res.message as string | undefined,
      error: res.error as string | undefined,
    };
  }

  /**
   * Deletes a file after creating an automatic recovery backup.
   *
   * @param targetPath - File to delete.
   * @returns Deletion outcome.
   */
  public async deleteFile(
    targetPath: string
  ): Promise<{ success: boolean; backupPath?: string | null; verified?: boolean; error?: string }> {
    const res = await defaultPythonBridge.execute<{ success: boolean; backupPath: string; verified: boolean }>(
      "delete_file",
      { path: targetPath }
    );
    return {
      success: Boolean(res.success),
      backupPath: res.backupPath as string | null | undefined,
      verified: res.verified as boolean | undefined,
      error: res.error as string | undefined,
    };
  }

  /**
   * Scans a directory and returns groups of duplicate files with identical SHA-256 hashes.
   *
   * @param directory - Root directory to scan.
   * @returns Duplicates mapping {hash: [paths]}.
   */
  public async findDuplicates(
    directory: string = "."
  ): Promise<{ success: boolean; duplicateGroupsCount: number; duplicates: Record<string, string[]> }> {
    const res = await defaultPythonBridge.execute<{
      duplicateGroupsCount: number;
      duplicates: Record<string, string[]>;
    }>("find_duplicates", { directory });
    return {
      success: Boolean(res.success),
      duplicateGroupsCount: typeof res.duplicateGroupsCount === "number" ? res.duplicateGroupsCount : 0,
      duplicates: (res.duplicates as Record<string, string[]>) || {},
    };
  }
}

export const defaultFileSystemIntelligence = new FileSystemIntelligence();
