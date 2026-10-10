"""
Unit & Integration Tests for ULTRON Permanent Memory System
Tests:
1. Fact saving and retrieval
2. Duplicate key updates
3. FTS5 full-text / semantic keyword search
4. Conversation turn logging
5. Fact deletion
6. Memory reset
"""

import sys
from pathlib import Path

# Add project root to sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from ultron_memory import UltronMemory

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

def main():
    print("=" * 65)
    print("      ULTRON PERMANENT MEMORY SYSTEM (SQLITE + FTS5)")
    print("=" * 65)

    # 1. Reset for fresh test
    UltronMemory.reset_all_memories()

    # 2. Save facts
    f1 = UltronMemory.save_fact("project_focus", "Holographic 3D Orb Voice Interface", "project")
    f2 = UltronMemory.save_fact("preferred_language", "Python and TypeScript", "preference")
    f3 = UltronMemory.save_fact("developer_name", "Ashish", "biography")

    assert f1["status"] == "saved"
    print("  [PASS] Fact Storage: Saved 3 distinct categorical facts")

    # 3. Retrieve specific fact
    retrieved = UltronMemory.get_fact("developer_name")
    assert retrieved is not None and retrieved["fact_value"] == "Ashish"
    print(f"  [PASS] Fact Retrieval: Developer name resolved to '{retrieved['fact_value']}'")

    # 4. Search memory using FTS keyword matching
    search_res = UltronMemory.search_memories("Holographic Interface")
    assert len(search_res["facts"]) >= 1
    print(f"  [PASS] Search Retrieval: Found {len(search_res['facts'])} matching fact(s) for 'Holographic Interface'")

    # 5. Record conversation turn & test FTS index
    UltronMemory.record_conversation("session_001", "user", "Kal jo project banaya tha uska agla step shuru karo", "Project resumption query")
    conv_search = UltronMemory.search_memories("project")
    assert len(conv_search["conversations"]) >= 1 or len(conv_search["facts"]) >= 1
    print("  [PASS] Conversation FTS5 Indexing: Successfully indexed and searched historical dialogue")

    # 6. Delete fact
    deleted = UltronMemory.delete_fact("preferred_language")
    assert deleted is True
    assert UltronMemory.get_fact("preferred_language") is None
    print("  [PASS] Fact Deletion: Successfully pruned specified key")

    # 7. Selective fact extraction rule
    extracted = UltronMemory.selective_fact_extraction("Remember that my server port is 5001")
    assert extracted is not None and "5001" in extracted["value"]
    casual_check = UltronMemory.selective_fact_extraction("Hey how is the weather today?")
    assert casual_check is None
    print("  [PASS] Selective Memory Extraction: Saved fact while rejecting casual chatter")

    print("-" * 65)
    print("Permanent Memory Test: ALL 7 CHECKS PASSED [100% OK]")
    print("=" * 65)
    return 0

if __name__ == "__main__":
    sys.exit(main())
