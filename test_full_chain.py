import urllib.request
import json
import soundfile as sf
import numpy as np
import io

print("Generating 2-second 440Hz test audio...")
sr = 16000
t = np.linspace(0, 2, 2 * sr, endpoint=False)
samples = (0.4 * np.sin(2 * np.pi * 440 * t)).astype(np.float32)

wav_io = io.BytesIO()
sf.write(wav_io, samples, sr, format='WAV', subtype='PCM_16')
wav_bytes = wav_io.getvalue()

print(f"Posting {len(wav_bytes)} bytes to Next.js http://localhost:3000/api/transcribe ...")

req = urllib.request.Request(
    "http://localhost:3000/api/transcribe",
    data=wav_bytes,
    headers={"Content-Type": "audio/webm"}
)

try:
    res = urllib.request.urlopen(req)
    data = json.loads(res.read().decode('utf-8'))
    print("Full chain response:", res.status, data)
except Exception as e:
    print("Full chain error:", e)

