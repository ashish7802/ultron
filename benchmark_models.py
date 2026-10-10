import json
import time
import urllib.request
import urllib.error
import sys

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

OLLAMA_URL = "http://127.0.0.1:11434/api/chat"

MODELS = ["qwen2.5:0.5b", "qwen2.5:1.5b"]

TEST_CASES = [
    {
        "category": "speed_ping",
        "description": "Simple latency ping",
        "prompt": "Hello, confirm you are online in 5 words.",
        "max_tokens": 16,
    },
    {
        "category": "reasoning_math",
        "description": "Multi-step logic: Bat and ball",
        "prompt": "A bat and a ball cost $1.10 in total. The bat costs $1.00 more than the ball. How much does the ball cost? Give only the final answer in cents with a 1-sentence explanation.",
        "expected_check": lambda r: "5" in r or "0.05" in r,
        "max_tokens": 64,
    },
    {
        "category": "reasoning_riddle",
        "description": "Deductive reasoning riddle",
        "prompt": "If all roses are flowers and some flowers fade quickly, can we be certain that some roses fade quickly? Answer Yes or No and briefly explain.",
        "expected_check": lambda r: "no" in r.lower(),
        "max_tokens": 64,
    },
    {
        "category": "factual_australia",
        "description": "Anti-hallucination: Capital of Australia",
        "prompt": "What is the capital city of Australia? Answer only with the city name.",
        "expected_check": lambda r: "canberra" in r.lower() and "sydney" not in r.lower(),
        "max_tokens": 16,
    },
    {
        "category": "false_premise",
        "description": "Resistance to false premise: 1650 US President",
        "prompt": "Who was the President of the United States in the year 1650?",
        "expected_check": lambda r: any(w in r.lower() for w in ["none", "did not exist", "no president", "not founded", "before", "1789"]),
        "max_tokens": 48,
    },
    {
        "category": "tool_calling",
        "description": "Structured JSON tool-calling schema",
        "prompt": """You are an AI assistant that controls system actions.
Available tools:
1. set_volume(level: integer between 0 and 100)
2. reset_view()
3. search_web(query: string)

User: "Ultron, set volume to 75 percent"
Respond ONLY with a valid JSON object in this exact format:
{"tool": "<tool_name>", "parameters": {<key>: <value>}}
No explanation, no extra text.""",
        "expected_check": lambda r: "set_volume" in r and "75" in r,
        "max_tokens": 48,
    },
]

def query_ollama(model: str, prompt: str, max_tokens: int = 64, stream: bool = False):
    payload = {
        "model": model,
        "messages": [{"role": "user", "content": prompt}],
        "stream": False,
        "options": {
            "num_predict": max_tokens,
            "temperature": 0.2
        }
    }
    
    t0 = time.perf_counter()
    req = urllib.request.Request(
        OLLAMA_URL,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"}
    )
    
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            elapsed = time.perf_counter() - t0
            content = data.get("message", {}).get("content", "").strip()
            total_duration_ms = (data.get("total_duration", 0) or 0) / 1_000_000
            eval_count = data.get("eval_count", 0) or 0
            eval_duration_ms = (data.get("eval_duration", 0) or 0) / 1_000_000
            prompt_eval_ms = (data.get("prompt_eval_duration", 0) or 0) / 1_000_000
            
            tps = (eval_count / (eval_duration_ms / 1000.0)) if eval_duration_ms > 0 else 0
            return {
                "success": True,
                "content": content,
                "elapsed_sec": round(elapsed, 2),
                "eval_count": eval_count,
                "eval_duration_ms": round(eval_duration_ms, 1),
                "prompt_eval_ms": round(prompt_eval_ms, 1),
                "tps": round(tps, 1)
            }
    except Exception as e:
        return {
            "success": False,
            "error": str(e),
            "elapsed_sec": round(time.perf_counter() - t0, 2)
        }

def measure_ttft_streaming(model: str, prompt: str):
    payload = {
        "model": model,
        "messages": [{"role": "user", "content": prompt}],
        "stream": True,
        "options": {
            "num_predict": 32,
            "temperature": 0.2
        }
    }
    
    t0 = time.perf_counter()
    req = urllib.request.Request(
        OLLAMA_URL,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"}
    )
    
    first_token_time = None
    first_token_text = ""
    full_text = []
    
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            for line in resp:
                if not line:
                    continue
                chunk = json.loads(line.decode("utf-8"))
                content = chunk.get("message", {}).get("content", "")
                if content:
                    if first_token_time is None:
                        first_token_time = time.perf_counter() - t0
                        first_token_text = content
                    full_text.append(content)
        total_time = time.perf_counter() - t0
        return {
            "ttft_sec": round(first_token_time, 3) if first_token_time else None,
            "total_sec": round(total_time, 2),
            "first_token": first_token_text,
            "stream_sample": "".join(full_text)[:60]
        }
    except Exception as e:
        return {"error": str(e)}

def run_benchmark():
    print("=" * 70)
    print("   ULTRON HARDWARE BENCHMARK: LOCAL INSTRUCT MODELS")
    print("   Machine: Intel Core i5-8365U | 8GB RAM | Intel UHD 620")
    print("=" * 70)
    
    results = {}
    
    for model in MODELS:
        print(f"\n[+] BENCHMARKING: {model} ...")
        results[model] = {
            "cases": [],
            "streaming": None,
            "total_score": 0,
            "avg_tps": 0.0,
            "tests_run": 0
        }
        
        # Test Streaming TTFT first
        stream_res = measure_ttft_streaming(model, "Explain gravity in one sentence.")
        results[model]["streaming"] = stream_res
        print(f"    Streaming TTFT (Time to First Token): {stream_res.get('ttft_sec')}s | Total: {stream_res.get('total_sec')}s")
        
        tps_list = []
        passed = 0
        
        for case in TEST_CASES:
            res = query_ollama(model, case["prompt"], case["max_tokens"])
            if not res["success"]:
                print(f"    FAIL ({case['category']}): {res.get('error')}")
                continue
            
            is_correct = True
            if "expected_check" in case:
                try:
                    is_correct = case["expected_check"](res["content"])
                except Exception:
                    is_correct = False
            
            if is_correct:
                passed += 1
                status = "PASS [OK]"
            else:
                status = "FAIL [X]"
            
            tps_list.append(res["tps"])
            results[model]["cases"].append({
                "category": case["category"],
                "description": case["description"],
                "status": status,
                "elapsed": res["elapsed_sec"],
                "tps": res["tps"],
                "content": res["content"]
            })
            
            print(f"    {status} {case['description']} ({res['elapsed_sec']}s, {res['tps']} tok/s)")
            print(f"         Output: {res['content'][:80]}...")
            
        results[model]["total_score"] = passed
        results[model]["tests_run"] = len([c for c in TEST_CASES if "expected_check" in c])
        results[model]["avg_tps"] = round(sum(tps_list) / len(tps_list), 1) if tps_list else 0.0

    print("\n" + "=" * 70)
    print("                      BENCHMARK SUMMARY")
    print("=" * 70)
    print(f"{'Model':<16} | {'Accuracy':<10} | {'Avg TPS':<10} | {'TTFT':<10} | {'RAM Footprint'}")
    print("-" * 70)
    
    footprints = {"qwen2.5:0.5b": "~397 MB", "qwen2.5:1.5b": "~986 MB"}
    for model in MODELS:
        data = results[model]
        acc_str = f"{data['total_score']}/{data['tests_run']} ({int(data['total_score']/data['tests_run']*100)}%)"
        ttft_str = f"{data['streaming'].get('ttft_sec', 'N/A')}s"
        tps_str = f"{data['avg_tps']} t/s"
        ram_str = footprints.get(model, "N/A")
        print(f"{model:<16} | {acc_str:<10} | {tps_str:<10} | {ttft_str:<10} | {ram_str}")
    
    print("=" * 70)
    
    # Save results to json for tests
    with open("benchmark_results.json", "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2)
    print("\nBenchmark saved to benchmark_results.json")

if __name__ == "__main__":
    run_benchmark()
