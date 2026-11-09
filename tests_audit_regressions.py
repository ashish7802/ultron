"""Regression tests for the confirmed ULTRON security and reliability findings.

The vault tests use isolated temporary directories and never open or modify the
repository's persisted vault files. Source-contract checks protect boundaries
owned by optional services that are not installed in every test environment.
"""

import base64
import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

os.environ.setdefault("ULTRON_TEST_ALLOW_PLAINTEXT_VAULT", "1")

from ultron_engine import secure_vault
from ultron_engine.server import is_local_cors_origin


ROOT = Path(__file__).resolve().parent


class SecureVaultRegressionTests(unittest.TestCase):
    """Verify vault platform gates and recovery integrity without touching user data."""

    def test_windows_without_dpapi_does_not_create_plaintext_key(self):
        with tempfile.TemporaryDirectory() as isolated_vault:
            with patch.object(secure_vault.sys, "platform", "win32"), patch.object(
                secure_vault, "HAS_WIN32CRYPT", False
            ):
                with self.assertRaises(RuntimeError):
                    secure_vault.SecureVault(isolated_vault)
            self.assertFalse(Path(isolated_vault, "vault.bin").exists())

    def test_windows_does_not_load_non_windows_test_gate(self):
        with tempfile.TemporaryDirectory() as isolated_vault:
            with patch.object(secure_vault.sys, "platform", "linux"), patch.object(
                secure_vault, "HAS_WIN32CRYPT", False
            ):
                created = secure_vault.SecureVault(isolated_vault)
            with patch.object(secure_vault.sys, "platform", "win32"), patch.object(
                secure_vault, "HAS_WIN32CRYPT", False
            ):
                with self.assertRaises(RuntimeError):
                    secure_vault.SecureVault(isolated_vault)
            self.assertEqual(len(created.get_master_key()), 32)

    def test_recovery_rejects_unknown_manifest_version(self):
        with tempfile.TemporaryDirectory() as isolated_vault:
            vault = secure_vault.SecureVault(isolated_vault)
            manifest_path = Path(isolated_vault, "recovery_manifest.json")
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            manifest["version"] = 999
            manifest_path.write_text(json.dumps(manifest), encoding="utf-8")
            with self.assertRaises(PermissionError):
                vault.recover_master_key(vault.get_recovery_passphrase() or "test")

    def test_recovery_rejects_wrong_passphrase_and_tampered_ciphertext(self):
        with tempfile.TemporaryDirectory() as isolated_vault:
            vault = secure_vault.SecureVault(isolated_vault)
            passphrase = vault.get_recovery_passphrase()
            self.assertIsNotNone(passphrase)
            with self.assertRaises(PermissionError):
                vault.recover_master_key("incorrect passphrase")

            manifest_path = Path(isolated_vault, "recovery_manifest.json")
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            ciphertext = bytearray(base64.b64decode(manifest["ciphertext_b64"]))
            ciphertext[0] ^= 1
            manifest["ciphertext_b64"] = base64.b64encode(ciphertext).decode("ascii")
            manifest_path.write_text(json.dumps(manifest), encoding="utf-8")
            with self.assertRaises(PermissionError):
                vault.recover_master_key(passphrase or "")

    def test_recovery_rejects_invalid_field_lengths(self):
        with tempfile.TemporaryDirectory() as isolated_vault:
            vault = secure_vault.SecureVault(isolated_vault)
            manifest_path = Path(isolated_vault, "recovery_manifest.json")
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            manifest["nonce_b64"] = base64.b64encode(b"short").decode("ascii")
            manifest_path.write_text(json.dumps(manifest), encoding="utf-8")
            with self.assertRaises(PermissionError):
                vault.recover_master_key(vault.get_recovery_passphrase() or "")

    def test_recovery_requires_iteration_count(self):
        with tempfile.TemporaryDirectory() as isolated_vault:
            vault = secure_vault.SecureVault(isolated_vault)
            manifest_path = Path(isolated_vault, "recovery_manifest.json")
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            del manifest["iterations"]
            manifest_path.write_text(json.dumps(manifest), encoding="utf-8")
            with self.assertRaises(PermissionError):
                vault.recover_master_key(vault.get_recovery_passphrase() or "")

    def test_windows_rejects_unexpected_master_key_length(self):
        with tempfile.TemporaryDirectory() as isolated_vault:
            secure_vault.SecureVault(isolated_vault)
            fake_dpapi = type(
                "FakeDPAPI",
                (),
                {"CryptUnprotectData": staticmethod(lambda *_args: ("", b"short"))},
            )
            with patch.object(secure_vault.sys, "platform", "win32"), patch.object(
                secure_vault, "HAS_WIN32CRYPT", True
            ), patch.object(secure_vault, "win32crypt", fake_dpapi):
                with self.assertRaises(PermissionError):
                    secure_vault.SecureVault(isolated_vault)

    def test_corrupted_vault_checksum_fails_closed(self):
        with tempfile.TemporaryDirectory() as isolated_vault:
            secure_vault.SecureVault(isolated_vault)
            vault_path = Path(isolated_vault, "vault.bin")
            payload = json.loads(vault_path.read_text(encoding="utf-8"))
            payload["checksum_sha256"] = "0" * 64
            vault_path.write_text(json.dumps(payload), encoding="utf-8")
            with self.assertRaises(PermissionError):
                secure_vault.SecureVault(isolated_vault)


class SourceBoundaryRegressionTests(unittest.TestCase):
    """Pin observable security contracts for optional/runtime-bound components."""

    def test_chat_route_does_not_log_user_message_contents(self):
        source = (ROOT / "app" / "api" / "chat" / "route.ts").read_text(encoding="utf-8")
        self.assertNotRegex(source, r"console\.\w+\([^)]*(?:userText|User Said)")

    def test_audio_route_streams_bounded_input_and_transcribes(self):
        source = (ROOT / "app" / "api" / "transcribe" / "route.ts").read_text(encoding="utf-8")
        self.assertNotIn("req.arrayBuffer()", source)
        self.assertIn("readBoundedAudio", source)
        self.assertIn("transcribe", source.lower())

    def test_engine_api_does_not_allow_every_cors_origin(self):
        source = (ROOT / "ultron_engine" / "server.py").read_text(encoding="utf-8")
        self.assertNotIn('allow_origins=["*"]', source)
        self.assertTrue(is_local_cors_origin("http://127.0.0.1:3000"))
        self.assertTrue(is_local_cors_origin("http://localhost:3000"))
        self.assertFalse(is_local_cors_origin("https://attacker.example"))

    def test_electron_waits_for_child_server_readiness(self):
        source = (ROOT / "electron" / "main.js").read_text(encoding="utf-8")
        self.assertNotIn("setTimeout(createWindow, 1200)", source)
        self.assertIn("waitForServerReady", source)


if __name__ == "__main__":
    unittest.main(verbosity=2)
