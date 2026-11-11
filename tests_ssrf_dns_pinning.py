"""Regression tests for request-time DNS pinning in web research."""

import unittest

from ultron_engine.quantum_research_agent import PinnedDNSBackend, QuantumResearchAgent


class RecordingBackend:
    """Records the address passed to the socket layer without opening a network socket."""

    def __init__(self):
        self.hosts = []

    async def connect_tcp(self, host, port, **_kwargs):
        self.hosts.append((host, port))
        return "connected"


class DNSPinningTests(unittest.TestCase):
    """Ensure HTTP connections use only the already-validated DNS addresses."""

    @staticmethod
    def run_immediate(coroutine):
        """Runs a no-I/O backend coroutine without opening Windows event-loop sockets."""
        try:
            coroutine.send(None)
        except StopIteration as result:
            return result.value
        raise AssertionError("Expected the mocked socket backend not to suspend")

    def test_connection_uses_validated_address_instead_of_resolving_hostname_again(self):
        delegate = RecordingBackend()
        backend = PinnedDNSBackend(
            {"research.example": ("93.184.216.34",)},
            backend=delegate,
        )
        result = self.run_immediate(backend.connect_tcp("research.example", 443))
        self.assertEqual(result, "connected")
        self.assertEqual(delegate.hosts, [("93.184.216.34", 443)])

    def test_unpinned_hostname_is_rejected(self):
        backend = PinnedDNSBackend({"research.example": ("93.184.216.34",)})
        with self.assertRaises(Exception):
            self.run_immediate(backend.connect_tcp("attacker.example", 443))

    def test_ssrf_filter_rejects_private_ipv4_ipv6_and_metadata_forms(self):
        agent = QuantumResearchAgent()
        blocked_urls = (
            "http://127.0.0.1/admin",
            "http://2130706433/admin",
            "http://169.254.169.254/latest/meta-data/",
            "http://[::1]/",
            "http://[::ffff:127.0.0.1]/",
            "http://192.168.1.1/",
            "https://user:token@research.example/",
        )
        for url in blocked_urls:
            with self.subTest(url=url):
                self.assertFalse(agent.is_safe_url(url))


if __name__ == "__main__":
    unittest.main(verbosity=2)
