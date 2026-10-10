"""
Tests for ULTRON Tool-Calling Accuracy & Schema Compliance.
Verifies JSON formatting, function selection, argument extraction,
and negative tool invocation avoidance.
"""

import json
import sys
import urllib.request

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

OLLAMA_URL = "http://127.0.0.1:11434/api/chat"

SYSTEM_TOOL_PROMPT = """You are ULTRON's automated command core.
Available tools:
1. system_control(action: "reset_view" | "zoom_in" | "zoom_out" | "toggle_gestures" | "toggle_voice")
2. calculate(expression: string)
3. web_search(query: string)
4. get_system_diagnostics()

When the user request matches a tool, you MUST respond ONLY with a valid JSON object in this exact format:
{"tool": "<name>", "parameters": {<key>: <value>}}
If no tool is needed (conversational talk), answer normally in plain text without JSON.
"""

TOOL_TEST_CASES = [
    {
        "id": "T1_volume_control",
        "user_prompt": "Ultron, reset the 3D orb view",
        "expect_tool": True,
        "expected_tool_name": "system_control",
        "validator": lambda d: d.get("parameters", {}).get("action") == "reset_view",
    },
    {
        "id": "T2_calculate_math",
        "user_prompt": "Calculate 128 multiplied by 16",
        "expect_tool": True,
        "expected_tool_name": "calculate",
        "validator": lambda d: any(tok in str(d.get("parameters", {}).get("expression")) for tok in ["128", "16", "*"]),
    },
    {
        "id": "T3_web_search",
        "user_prompt": "Search the web for James Webb telescope discoveries",
        "expect_tool": True,
        "expected_tool_name": "web_search",
        "validator": lambda d: "james webb" in str(d.get("parameters", {}).get("query")).lower(),
    },
    {
        "id": "T4_system_diagnostics",
        "user_prompt": "Run a system diagnostic check on hardware",
        "expect_tool": True,
        "expected_tool_name": "get_system_diagnostics",
        "validator": lambda d: isinstance(d.get("parameters"), dict),
    },
    {
        "id": "T5_conversational_negative",
        "user_prompt": "What is your philosophy on human and AI collaboration?",
        "expect_tool": False,
        "expected_tool_name": None,
        "validator": lambda r: "{" not in r or "tool" not in r,
    },
]

def query_tool_model(model: str, user_prompt: str, max_tokens: int = 64) -> str:
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": SYSTEM_TOOL_PROMPT},
            {"role": "user", "content": user_prompt}
        ],
        "stream": False,
        "options": {
            "num_predict": max_tokens,
            "temperature": 0.1
        }
    }
    req = urllib.request.Request(
        OLLAMA_URL,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"}
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            return data.get("message", {}).get("content", "").strip()
    except Exception as e:
        return f"ERROR: {e}"

def test_tool_calling(model: str = "qwen2.5:1.5b"):
    print("=" * 70)
    print(f"       ULTRON TOOL-CALLING & SCHEMA COMPLIANCE ({model})")
    print("=" * 70)

    passed = 0
    total = len(TOOL_TEST_CASES)

    for case in TOOL_TEST_CASES:
        raw_res = query_tool_model(model, case["user_prompt"])
        is_ok = False
        parsed_json = None
        details = ""

        if case["expect_tool"]:
            # Clean JSON if model output includes markdown code fence
            clean = raw_res
            if "```" in clean:
                clean = clean.split("```")[1]
                if clean.startswith("json"):
                    clean = clean[4:]
                clean = clean.strip()

            try:
                parsed_json = json.loads(clean)
                has_tool = parsed_json.get("tool") == case["expected_tool_name"]
                args_valid = case["validator"](parsed_json)
                is_ok = has_tool and args_valid
                details = f"Tool: '{parsed_json.get('tool')}', Params: {parsed_json.get('parameters')}"
            except Exception as e:
                is_ok = False
                details = f"Invalid JSON ({e}): {raw_res[:60]}"
        else:
            # Negative test (should NOT produce tool json)
            is_ok = case["validator"](raw_res)
            details = f"Text response: {raw_res[:50]}..."

        if is_ok:
            passed += 1
            status = "[PASS]"
        else:
            status = "[FAIL]"

        print(f"  {status} {case['id']}: {case['user_prompt']}")
        print(f"         {details}")

    accuracy = (passed / total) * 100
    print("-" * 70)
    print(f"Tool-Calling Accuracy: {passed}/{total} ({accuracy:.1f}%)")
    print("=" * 70)
    return accuracy >= 80

if __name__ == "__main__":
    model_name = sys.argv[1] if len(sys.argv) > 1 else "qwen2.5:1.5b"
    ok = test_tool_calling(model_name)
    sys.exit(0 if ok else 1)

