"""
Tests for ULTRON Intent & Brain Router.
Verifies that simple commands route to fast/instant paths
and complex queries route to stronger reasoning paths.
"""

import sys
import re

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

# Fast patterns identical to lib/intentRouter.ts
TIME_DATE_PATTERNS = [
    r"\b(what time is it|current time|kya time hai|kya baj raha hai|samay kya hai|time please|tell me the time)\b",
    r"\b(what is the date|today's date|aaj ki date|aaj kaun sa din hai|what day is it|current date)\b",
]

SYSTEM_CONTROL_PATTERNS = [
    r"\b(reset view|reset orb|orb reset|camera reset)\b",
    r"\b(status report|system status|system diagnostic|diagnostics|hardware check)\b",
]

GREETING_PATTERNS = [
    r"^(hi|hello|hey|hey ultron|hello ultron|hola|namaste|sup|yo|good morning|good evening|good afternoon)[\s!.,?]*$",
    r"^(how are you|kaise ho|how are you doing|sab kaisa hai)[\s!.,?]*$",
    r"^(who are you|tum kaun ho|introduce yourself|what is your name)[\s!.,?]*$",
]

COMPLEX_TRIGGERS = [
    r"\b(why|how does|explain|analyze|calculate|solve|compare|difference between|write a|code|implement|function|algorithm|python|javascript|typescript|logic|reasoning)\b",
    r"\b(bat and a ball|riddle|puzzle|math|integral|derivative|theorem|quantum|physics|step by step|multi-step)\b",
]

TOOL_TRIGGERS = [
    r"\b(set volume|change volume|volume ko|mute|unmute)\b",
    r"\b(search for|google|web search|look up online|find info about)\b",
    r"\b(calculate|compute|math for|hisab lagao)\b",
]

def route_query(user_input: str) -> dict:
    trimmed = user_input.strip()
    lower = trimmed.lower()

    # 1. System Local (Time/Date)
    for pat in TIME_DATE_PATTERNS:
        if re.search(pat, lower):
            return {"intent": "SYSTEM_LOCAL", "target_model": "local-rule", "fast_response": True}

    # 2. System Control / Diagnostics
    for pat in SYSTEM_CONTROL_PATTERNS:
        if re.search(pat, lower):
            return {"intent": "SYSTEM_LOCAL", "target_model": "local-rule", "fast_response": True}

    # 3. Canonical Identity
    if re.search(r"^(who are you|tum kaun ho|who made you|what are you)[\s!.,?]*$", lower):
        return {"intent": "SYSTEM_LOCAL", "target_model": "local-rule", "fast_response": True}

    # 4. Tool Execution
    for pat in TOOL_TRIGGERS:
        if re.search(pat, lower):
            return {"intent": "TOOL_CALL", "target_model": "qwen2.5:1.5b"}

    # 5. Complex Reasoning
    for pat in COMPLEX_TRIGGERS:
        if re.search(pat, lower):
            return {"intent": "COMPLEX_REASONING", "target_model": "qwen2.5:1.5b"}

    if len(trimmed) > 70 or ("?" in trimmed and len(trimmed.split()) > 8):
        return {"intent": "COMPLEX_REASONING", "target_model": "qwen2.5:1.5b"}

    # 6. Fast Chat
    for pat in GREETING_PATTERNS:
        if re.search(pat, lower):
            return {"intent": "FAST_CHAT", "target_model": "qwen2.5:0.5b"}

    return {"intent": "COMPLEX_REASONING", "target_model": "qwen2.5:1.5b"}


TEST_CASES = [
    # Instant Local Commands
    {"query": "What time is it?", "expected_intent": "SYSTEM_LOCAL"},
    {"query": "Aaj ki date kya hai?", "expected_intent": "SYSTEM_LOCAL"},
    {"query": "Status report", "expected_intent": "SYSTEM_LOCAL"},
    {"query": "Reset view", "expected_intent": "SYSTEM_LOCAL"},
    {"query": "Who are you?", "expected_intent": "SYSTEM_LOCAL"},

    # Fast Greetings
    {"query": "Hello", "expected_intent": "FAST_CHAT"},
    {"query": "Hey Ultron!", "expected_intent": "FAST_CHAT"},
    {"query": "Kaise ho?", "expected_intent": "FAST_CHAT"},
    {"query": "Good morning", "expected_intent": "FAST_CHAT"},

    # Tool Calls
    {"query": "Set volume to 80 percent", "expected_intent": "TOOL_CALL"},
    {"query": "Search for latest NASA mission", "expected_intent": "TOOL_CALL"},
    {"query": "Calculate 450 * 32", "expected_intent": "TOOL_CALL"},

    # Complex Reasoning
    {"query": "A bat and a ball cost $1.10 in total. The bat costs $1.00 more. How much does the ball cost?", "expected_intent": "COMPLEX_REASONING"},
    {"query": "Explain quantum superposition in simple terms", "expected_intent": "COMPLEX_REASONING"},
    {"query": "Write a python function to find prime numbers", "expected_intent": "COMPLEX_REASONING"},
    {"query": "Compare React and Svelte architecture", "expected_intent": "COMPLEX_REASONING"},
    {"query": "Why is the sky blue during the day and red during sunset?", "expected_intent": "COMPLEX_REASONING"},
]


def test_routing():
    passed = 0
    total = len(TEST_CASES)
    print("=" * 65)
    print("         ULTRON INTENT ROUTING ACCURACY TEST")
    print("=" * 65)

    for case in TEST_CASES:
        res = route_query(case["query"])
        is_ok = res["intent"] == case["expected_intent"]
        if is_ok:
            passed += 1
            mark = "[PASS]"
        else:
            mark = "[FAIL]"
        print(f"{mark} Query: \"{case['query'][:38]:<38}\" -> Got: {res['intent']} (Target: {res.get('target_model')})")

    acc = (passed / total) * 100
    print("-" * 65)
    print(f"Routing Accuracy: {passed}/{total} ({acc:.1f}%)")
    print("=" * 65)
    return acc == 100


if __name__ == "__main__":
    success = test_routing()
    sys.exit(0 if success else 1)

