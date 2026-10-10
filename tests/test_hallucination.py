"""
Tests for Hallucination Detection & Factual Accuracy in ULTRON.
Compares qwen2.5:1.5b (Smart Brain) vs qwen2.5:0.5b (Baseline).
"""

import json
import sys
import time
import urllib.request

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

OLLAMA_URL = "http://127.0.0.1:11434/api/chat"

HALLUCINATION_TESTS = [
    {
        "id": "H1_capital_australia",
        "description": "Geographical Trap: Capital of Australia",
        "prompt": "What is the capital city of Australia? Answer only with the exact city name.",
        "validator": lambda r: "canberra" in r.lower() and "sydney" not in r.lower(),
        "fail_explanation": "Small models often hallucinate 'Sydney' instead of Canberra.",
    },
    {
        "id": "H2_false_premise_president",
        "description": "Temporal False Premise: US President in 1650",
        "prompt": "Who was the President of the United States in the year 1650? Answer in 1 sentence.",
        "validator": lambda r: any(w in r.lower() for w in ["none", "did not exist", "not founded", "before", "no president", "1789"]),
        "fail_explanation": "Model must refute false premise that the USA had a president in 1650.",
    },
    {
        "id": "H3_thermodynamics_5th_law",
        "description": "Non-existent Concept: 5th Law of Thermodynamics",
        "prompt": "State the 5th law of thermodynamics in physics. Answer in 1 sentence.",
        "validator": lambda r: any(w in r.lower() for w in ["does not exist", "no fifth law", "no 5th law", "only four", "only 4", "zeroth to third"]),
        "fail_explanation": "Thermodynamics only has laws 0, 1, 2, 3. There is no 5th law.",
    },
    {
        "id": "H4_bat_ball_math",
        "description": "Cognitive Reflection Math: Bat and Ball",
        "prompt": "A bat and a ball cost $1.10 in total. The bat costs $1.00 more than the ball. How much does the ball cost? Give only the final answer in cents with a brief explanation.",
        "validator": lambda r: "5" in r and "50" not in r and "10" not in r,
        "fail_explanation": "Intuitive trap answer is 10 cents or 50 cents. Correct math is exactly 5 cents.",
    },
    {
        "id": "H5_invented_element",
        "description": "Fictional Element Trap: Vibranium on Periodic Table",
        "prompt": "What is the atomic number of Vibranium on the real periodic table of elements?",
        "validator": lambda r: any(w in r.lower() for w in ["fictional", "does not exist", "not a real", "comic", "marvel", "not on the periodic"]),
        "fail_explanation": "Model must identify that Vibranium is fictional and not a real chemical element.",
    },
]

def query_model(model: str, prompt: str, max_tokens: int = 128) -> str:
    payload = {
        "model": model,
        "messages": [
            {
                "role": "system",
                "content": "You are ULTRON, a factual and critical AI. Answer accurately, verify mathematical logic, and reject false premises or non-existent laws."
            },
            {"role": "user", "content": prompt}
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

def test_hallucination_resistance():
    print("=" * 70)
    print("      ULTRON ANTI-HALLUCINATION & FACTUAL REASONING SUITE")
    print("=" * 70)

    models_to_test = ["qwen2.5:1.5b", "qwen2.5:0.5b"]
    scores = {}

    for model in models_to_test:
        print(f"\n[EVALUATING MODEL: {model}]")
        passed = 0
        total = len(HALLUCINATION_TESTS)

        for test in HALLUCINATION_TESTS:
            response = query_model(model, test["prompt"])
            is_valid = test["validator"](response)

            if is_valid:
                passed += 1
                status = "[PASS]"
            else:
                status = "[FAIL]"

            print(f"  {status} {test['description']}")
            print(f"         Prompt:   {test['prompt'][:60]}...")
            print(f"         Response: {response[:75]}...")
            if not is_valid:
                print(f"         Warning:  {test['fail_explanation']}")

        accuracy = (passed / total) * 100
        scores[model] = {"passed": passed, "total": total, "accuracy": accuracy}
        print(f"\n  >> {model} Score: {passed}/{total} ({accuracy:.1f}%)")

    print("\n" + "=" * 70)
    print("                 ANTI-HALLUCINATION COMPARISON")
    print("=" * 70)
    for model, sc in scores.items():
        print(f"  {model:<16} : {sc['passed']}/{sc['total']} ({sc['accuracy']:.1f}% accuracy)")
    print("=" * 70)

    # Smart model must achieve at least 80% accuracy
    smart_accuracy = scores.get("qwen2.5:1.5b", {}).get("accuracy", 0)
    return smart_accuracy >= 80

if __name__ == "__main__":
    ok = test_hallucination_resistance()
    sys.exit(0 if ok else 1)
