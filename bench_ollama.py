import urllib.request
import json
import time

t0 = time.time()
req = urllib.request.Request(
    'http://127.0.0.1:11434/api/chat',
    data=json.dumps({
        'model': 'qwen2.5:0.5b',
        'messages': [{'role': 'user', 'content': 'hi'}],
        'keep_alive': '24h',
        'stream': False
    }).encode('utf-8'),
    headers={'Content-Type': 'application/json'}
)

try:
    res = json.loads(urllib.request.urlopen(req).read())
    print(f"Ollama time: {time.time() - t0:.2f}s")
    print(f"Response: {res['message']['content']}")
except Exception as e:
    print("Error:", e)

