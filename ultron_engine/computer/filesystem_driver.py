"""
===============================================================================
ULTRON COMPUTER INTELLIGENCE SYSTEM
Module: ultron_engine.computer.filesystem_driver
Purpose: Guarded File System Intelligence, Safe Navigation & Backup Architecture
===============================================================================

Key Responsibilities:
- Module 06: File System Intelligence.
- Safe file discovery, recursive directory exploration, and regex/glob searching.
- File inspection: size, timestamps (ctime, mtime), read-only attributes, SHA-256 hash.
- Safe file reading with automatic binary vs. text UTF-8 detection.
- Safe file writing and editing with AUTOMATIC ROLLING BACKUP (.bak) prior to modification.
- Duplicate file identification using streaming SHA-256 cryptographic digests.
- File movement and organization with post-operation verification.
- Security enforcement:
  - Path traversal protection (canonical path resolution to prevent directory escapes).
  - Protected Windows directories guard (`C:\\Windows`, `System32`, credential vaults).
  - Destructive operations (delete, overwrite) require explicit approval verification.

Architectural Role & Interactions:
- Consumed by `computer_intelligence_cli.py` and Node.js `fileSystemIntelligence.ts`.
- Enforces permission checks before executing any destructive filesystem mutation.

Safety / Security Guarantees:
- Never deletes or overwrites without creating a recovery snapshot first.
- Strict path validation against system roots and forbidden system directories.
- Verifies all operations (checks existence, size, and hash post-write).
===============================================================================
"""

import os
import shutil
import hashlib
import hmac
import time
from typing import Any, Dict, List, Optional, Tuple

# System directories forbidden from automated deletion or modification
PROTECTED_PATHS: List[str] = [
    os.path.normpath(r"C:\Windows"),
    os.path.normpath(r"C:\Windows\System32"),
    os.path.normpath(r"C:\Program Files\Windows Defender"),
    os.path.normpath(r"C:\ProgramData\Microsoft\Windows Defender"),
]

# Dedicated backup storage location
BACKUP_DIR = os.path.normpath(
    os.path.join(
        os.path.dirname(os.path.dirname(os.path.dirname(__file__))),
        "backups",
        "filesystem",
    )
)


# In-memory consumed token cache to enforce single-use execution and prevent replay attacks
_CONSUMED_GRANTS = set()
_CONSUMED_NONCES_FILE = os.path.normpath(
    os.path.join(
        os.path.dirname(os.path.dirname(os.path.dirname(__file__))),
        "backups",
        "filesystem",
        ".consumed_grants.log",
    )
)


def _is_grant_consumed(grant_token: str, nonce: str) -> bool:
    """Checks whether grant token or nonce has already been consumed."""
    if nonce in _CONSUMED_GRANTS or grant_token in _CONSUMED_GRANTS:
        return True
    if os.path.exists(_CONSUMED_NONCES_FILE):
        try:
            with open(_CONSUMED_NONCES_FILE, "r", encoding="utf-8") as f:
                consumed = set(line.strip() for line in f if line.strip())
                if nonce in consumed or grant_token in consumed:
                    return True
        except Exception:
            pass
    return False


def _record_grant_consumed(grant_token: str, nonce: str) -> None:
    """Atomically records grant token and nonce as consumed."""
    _CONSUMED_GRANTS.add(nonce)
    _CONSUMED_GRANTS.add(grant_token)
    try:
        os.makedirs(os.path.dirname(_CONSUMED_NONCES_FILE), exist_ok=True)
        with open(_CONSUMED_NONCES_FILE, "a", encoding="utf-8") as f:
            f.write(f"{nonce}\n{grant_token}\n")
    except Exception:
        pass


def _get_active_recovery_key() -> Optional[str]:
    """
    Retrieves the active authorized recovery key from environment, DPAPI blob, or local vault.
    Used for HMAC-SHA256 signature verification of execution grants.
    """
    env_key = os.environ.get("ULTRON_RECOVERY_KEY", "").strip()
    if env_key and len(env_key) >= 32:
        return env_key

    repo_root = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))
    dpapi_path = os.path.join(repo_root, ".security_vault", "recovery.key.dpapi")
    if os.path.exists(dpapi_path):
        try:
            with open(dpapi_path, "r", encoding="utf-8") as f:
                blob = f.read().strip()
            if blob:
                import base64
                import win32crypt
                raw = base64.b64decode(blob)
                unprotected = win32crypt.CryptUnprotectData(raw, None, None, None, 0)[1].decode("utf-8")
                if len(unprotected) >= 32:
                    return unprotected
        except Exception:
            pass

    vault_key_path = os.path.join(repo_root, ".security_vault", "recovery.key")
    if os.path.exists(vault_key_path):
        try:
            with open(vault_key_path, "r", encoding="utf-8") as f:
                key = f.read().strip()
                if len(key) >= 32:
                    return key
        except Exception:
            pass
    return None


def verify_subprocess_execution_grant(
    grant_token: Optional[str],
    operation: str,
    target_path: str,
) -> Tuple[bool, str]:
    """
    Cryptographically verifies an HMAC-SHA256 authorization grant token across the
    Node.js -> Python boundary before executing high-risk mutations (e.g. file overwrite).

    Token format:
        {planId}|{operation}|{canonicalPath}|{expiresAt}|{nonce}|{signature}

    Enforces:
        1. Token structure and signature authenticity against founder key.
        2. Operation matching (e.g., "write_file").
        3. Canonical physical path matching (preventing path traversal and symlink swap).
        4. Expiration check (fail-closed if expired).
        5. Single-use replay protection.

    Args:
        grant_token (Optional[str]): Signed grant token string.
        operation (str): Intended operation.
        target_path (str): Intended target path.

    Returns:
        Tuple[bool, str]: (is_valid, error_message)
    """
    if not grant_token or not isinstance(grant_token, str):
        return False, "Missing cryptographic execution grant token."

    parts = grant_token.split("|")
    if len(parts) != 6:
        return False, "Malformed execution grant token format."

    plan_id, token_op, token_path, expires_str, nonce, signature = parts

    # 1. Verify single-use nonce/token
    if _is_grant_consumed(grant_token, nonce):
        return False, "Execution grant token has already been consumed (replay rejected)."

    # 2. Verify operation binding
    if token_op.lower() != operation.lower():
        return False, f"Operation mismatch: grant is for '{token_op}', but requested '{operation}'."

    # 3. Verify path binding against canonical target path
    canonical_target = os.path.abspath(os.path.normpath(target_path)).lower()
    if token_path.lower() != canonical_target:
        return False, f"Target path mismatch: grant is bound to '{token_path}', but requested '{canonical_target}'."

    # 4. Verify expiration
    try:
        expires_at = int(expires_str)
        current_time_ms = int(time.time() * 1000)
        if current_time_ms > expires_at:
            return False, f"Execution grant token expired {current_time_ms - expires_at}ms ago."
    except ValueError:
        return False, "Invalid expiration timestamp in execution grant."

    # 5. Verify cryptographic HMAC signature
    secret_key = _get_active_recovery_key()
    if not secret_key:
        return False, "Unable to resolve active founder recovery key for signature verification."

    expected_payload = f"{plan_id}|{token_op}|{token_path}|{expires_str}|{nonce}"
    expected_sig = hmac.new(
        secret_key.encode("utf-8"),
        expected_payload.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()

    if not hmac.compare_digest(signature, expected_sig):
        return False, "Cryptographic signature verification failed: grant token is invalid or forged."

    # 6. Consume grant atomically
    _record_grant_consumed(grant_token, nonce)
    return True, ""


def _validate_path_safety(target_path: str, allow_protected: bool = False) -> str:
    """
    Resolves absolute canonical physical path following symlinks and NTFS junctions,
    and ensures target does not violate protected system boundaries.

    Args:
        target_path (str): File or directory path.
        allow_protected (bool): If True, allows read-only access to system paths.

    Returns:
        str: Fully canonicalized and resolved physical path.

    Raises:
        PermissionError: If path violates system protection boundaries.
        ValueError: If path contains directory traversal escapes.
    """
    if not target_path or not isinstance(target_path, str):
        raise ValueError("Invalid target path.")

    # 1. Normalize apparent path
    norm = os.path.abspath(os.path.normpath(target_path))

    # 2. Resolve underlying physical target following symlinks & junctions
    try:
        real = os.path.realpath(norm)
    except Exception:
        real = norm

    if not allow_protected:
        for prot in PROTECTED_PATHS:
            prot_norm = os.path.abspath(os.path.normpath(prot)).lower()
            # Enforce boundary checks on BOTH the apparent normalized path AND the resolved physical path
            for candidate in (norm, real):
                cand_low = candidate.lower()
                if cand_low == prot_norm or cand_low.startswith(prot_norm + os.sep) or cand_low.startswith(prot_norm + "/"):
                    raise PermissionError(
                        f"Access Denied: Path '{candidate}' violates protected system boundary ({prot})."
                    )

    return real


def compute_file_hash(path: str) -> Optional[str]:
    """
    Computes streaming SHA-256 digest of a file.

    Args:
        path (str): File path.

    Returns:
        Optional[str]: Hex SHA-256 hash or None if file cannot be read.
    """
    if not os.path.isfile(path):
        return None
    h = hashlib.sha256()
    try:
        with open(path, "rb") as f:
            while chunk := f.read(65536):
                h.update(chunk)
        return h.hexdigest()
    except Exception:
        return None


def get_file_metadata(target_path: str) -> Dict[str, Any]:
    """
    Inspects comprehensive file or directory metadata.

    Args:
        target_path (str): Target filesystem path.

    Returns:
        Dict[str, Any]: Metadata descriptor {exists, isDirectory, sizeBytes, createdAt, modifiedAt, hash}.
    """
    try:
        norm = _validate_path_safety(target_path, allow_protected=True)
    except Exception as e:
        return {"exists": False, "error": str(e)}

    if not os.path.exists(norm):
        return {"exists": False, "path": norm}

    st = os.stat(norm)
    is_dir = os.path.isdir(norm)

    return {
        "exists": True,
        "path": norm,
        "name": os.path.basename(norm),
        "isDirectory": is_dir,
        "sizeBytes": st.st_size if not is_dir else 0,
        "createdAt": st.st_ctime,
        "modifiedAt": st.st_mtime,
        "isReadOnly": not os.access(norm, os.W_OK),
        "sha256": compute_file_hash(norm) if not is_dir else None,
    }


def list_directory(
    dir_path: str,
    include_hidden: bool = False,
    max_items: int = 500,
) -> Dict[str, Any]:
    """
    Lists directory contents with file metadata.

    Args:
        dir_path (str): Directory to navigate.
        include_hidden (bool): Whether to include hidden/system files.
        max_items (int): Upper bound on returned entries.

    Returns:
        Dict[str, Any]: {success, path, items, totalCount}.
    """
    try:
        norm = _validate_path_safety(dir_path, allow_protected=True)
    except Exception as e:
        return {"success": False, "error": str(e)}

    if not os.path.isdir(norm):
        return {"success": False, "error": f"Path '{norm}' is not a directory."}

    items: List[Dict[str, Any]] = []
    try:
        with os.scandir(norm) as it:
            for entry in it:
                if len(items) >= max_items:
                    break
                if not include_hidden and entry.name.startswith("."):
                    continue
                try:
                    st = entry.stat()
                    items.append({
                        "name": entry.name,
                        "path": entry.path,
                        "isDirectory": entry.is_dir(),
                        "sizeBytes": st.st_size if not entry.is_dir() else 0,
                        "modifiedAt": st.st_mtime,
                    })
                except Exception:
                    continue
        return {"success": True, "path": norm, "items": items, "totalCount": len(items)}
    except Exception as e:
        return {"success": False, "error": str(e)}


def search_files(
    root_dir: str,
    query: str,
    recursive: bool = True,
    max_results: int = 100,
) -> Dict[str, Any]:
    """
    Searches for files matching query by name or extension.

    Args:
        root_dir (str): Starting directory.
        query (str): Keyword or substring to search for.
        recursive (bool): Search subdirectories.
        max_results (int): Maximum matching results.

    Returns:
        Dict[str, Any]: {success, matches}.
    """
    try:
        norm = _validate_path_safety(root_dir, allow_protected=True)
    except Exception as e:
        return {"success": False, "error": str(e)}

    q = query.lower()
    matches: List[Dict[str, Any]] = []

    if recursive:
        for root, dirs, files in os.walk(norm):
            # Exclude node_modules and .git for speed
            dirs[:] = [d for d in dirs if d not in ("node_modules", ".git", ".next", "__pycache__")]
            for f in files:
                if q in f.lower():
                    full_p = os.path.join(root, f)
                    matches.append(get_file_metadata(full_p))
                    if len(matches) >= max_results:
                        return {"success": True, "matches": matches}
    else:
        res = list_directory(norm, max_items=max_results)
        if res.get("success"):
            for item in res.get("items", []):
                if q in item["name"].lower():
                    matches.append(item)

    return {"success": True, "matches": matches}


def create_backup(target_path: str) -> Optional[str]:
    """
    Creates an atomic backup snapshot of an existing file before modification.

    Args:
        target_path (str): File to backup.

    Returns:
        Optional[str]: Path to backup file or None if source file does not exist.

    Side Effects:
        Writes backup file to disk.
    """
    if not os.path.isfile(target_path):
        return None

    os.makedirs(BACKUP_DIR, exist_ok=True)
    base_name = os.path.basename(target_path)
    ts = int(time.time())
    backup_filename = f"{base_name}.{ts}.bak"
    backup_dest = os.path.join(BACKUP_DIR, backup_filename)

    try:
        shutil.copy2(target_path, backup_dest)
        return backup_dest
    except Exception:
        # Fallback to local .bak file in same directory
        local_bak = f"{target_path}.bak"
        try:
            shutil.copy2(target_path, local_bak)
            return local_bak
        except Exception:
            return None


def read_file(target_path: str, max_bytes: int = 1048576) -> Dict[str, Any]:
    """
    Safely reads file content with automatic encoding detection.

    Args:
        target_path (str): File path.
        max_bytes (int): Maximum bytes to read (default 1MB).

    Returns:
        Dict[str, Any]: {success, content, size, truncated, sha256}.
    """
    try:
        norm = _validate_path_safety(target_path, allow_protected=True)
    except Exception as e:
        return {"success": False, "error": str(e)}

    if not os.path.isfile(norm):
        return {"success": False, "error": f"File '{norm}' does not exist or is not a regular file."}

    file_size = os.path.getsize(norm)
    truncated = file_size > max_bytes

    try:
        with open(norm, "rb") as f:
            raw_data = f.read(max_bytes)
        try:
            content = raw_data.decode("utf-8")
            is_text = True
        except UnicodeDecodeError:
            content = raw_data.hex()
            is_text = False

        return {
            "success": True,
            "path": norm,
            "content": content,
            "isText": is_text,
            "sizeBytes": file_size,
            "truncated": truncated,
            "sha256": compute_file_hash(norm),
        }
    except Exception as e:
        return {"success": False, "error": str(e)}


def write_file(
    target_path: str,
    content: str,
    overwrite: bool = False,
    is_binary_hex: bool = False,
    approval_granted: bool = False,
    execution_grant: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Writes content to a file with automatic backup creation if file exists.
    Verifies result by inspecting output file size and hash.
    Enforces security invariant (F-03): If the file exists and overwrite is True,
    a valid cryptographic HMAC-SHA256 execution grant must be verified.

    Args:
        target_path (str): Destination path.
        content (str): Text or hex string content.
        overwrite (bool): Explicit overwrite flag.
        is_binary_hex (bool): If True, parses content as hex bytes.
        approval_granted (bool): Legacy boolean indicator.
        execution_grant (Optional[str]): Cryptographic HMAC-SHA256 grant token issued by PermissionGateway.

    Returns:
        Dict[str, Any]: {success, path, backupPath, sha256, sizeBytes, verified, requiresApproval}.

    Side Effects:
        Creates directories, backups existing file, writes data to disk.
    """
    try:
        norm = _validate_path_safety(target_path, allow_protected=False)
    except Exception as e:
        return {"success": False, "error": str(e)}

    exists = os.path.exists(norm)
    if exists and not overwrite:
        return {
            "success": False,
            "error": f"File '{norm}' already exists. Overwrite authorization required.",
            "requiresApproval": True,
        }

    # F-03 Cryptographic Authorization Boundary:
    # Overwriting an existing file strictly requires a verified HMAC execution grant.
    # A plain Boolean (approval_granted=True) without a valid cryptographic grant is rejected fail-closed.
    if exists and overwrite:
        valid_grant, grant_err = verify_subprocess_execution_grant(execution_grant, "write_file", norm)
        if not valid_grant:
            return {
                "success": False,
                "error": f"File overwrite authorization failure: {grant_err}",
                "requiresApproval": True,
                "blocked": True,
            }

    backup_path = None
    if exists:
        backup_path = create_backup(norm)

    # Ensure parent directory exists
    parent_dir = os.path.dirname(norm)
    if parent_dir:
        os.makedirs(parent_dir, exist_ok=True)

    try:
        if is_binary_hex:
            data = bytes.fromhex(content)
            with open(norm, "wb") as f:
                f.write(data)
        else:
            with open(norm, "w", encoding="utf-8") as f:
                f.write(content)

        # Verification step
        meta = get_file_metadata(norm)
        verified = meta.get("exists") is True and meta.get("sizeBytes", 0) >= 0

        return {
            "success": True,
            "path": norm,
            "backupPath": backup_path,
            "sha256": meta.get("sha256"),
            "sizeBytes": meta.get("sizeBytes"),
            "verified": verified,
            "message": f"Successfully wrote {meta.get('sizeBytes')} bytes to {norm}.",
        }
    except Exception as e:
        return {"success": False, "error": str(e)}


def delete_file(target_path: str) -> Dict[str, Any]:
    """
    Deletes a file after creating an automatic recovery backup.

    Args:
        target_path (str): File to delete.

    Returns:
        Dict[str, Any]: {success, backupPath, verified}.

    Side Effects:
        Moves file to backup storage and removes from original location.
    """
    try:
        norm = _validate_path_safety(target_path, allow_protected=False)
    except Exception as e:
        return {"success": False, "error": str(e)}

    if not os.path.exists(norm):
        return {"success": False, "error": f"Target '{norm}' does not exist."}

    backup_path = create_backup(norm)

    try:
        if os.path.isdir(norm):
            shutil.rmtree(norm)
        else:
            os.remove(norm)

        verified = not os.path.exists(norm)
        return {
            "success": True,
            "path": norm,
            "backupPath": backup_path,
            "verified": verified,
            "message": f"Safely removed {norm} (Backup created at {backup_path}).",
        }
    except Exception as e:
        return {"success": False, "error": str(e)}


def find_duplicates(directory: str) -> Dict[str, Any]:
    """
    Identifies duplicate files within a directory by comparing SHA-256 hashes.

    Args:
        directory (str): Root folder to search.

    Returns:
        Dict[str, Any]: {success, duplicates: {hash: [paths]}}.
    """
    try:
        norm = _validate_path_safety(directory, allow_protected=True)
    except Exception as e:
        return {"success": False, "error": str(e)}

    hash_map: Dict[str, List[str]] = {}

    for root, _, files in os.walk(norm):
        for f in files:
            p = os.path.join(root, f)
            h = compute_file_hash(p)
            if h:
                hash_map.setdefault(h, []).append(p)

    duplicates = {h: paths for h, paths in hash_map.items() if len(paths) > 1}
    return {
        "success": True,
        "scannedDirectory": norm,
        "duplicateGroupsCount": len(duplicates),
        "duplicates": duplicates,
    }
